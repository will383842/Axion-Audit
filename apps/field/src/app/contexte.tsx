// =============================================================================
// LA COQUILLE TERRAIN — base ouverte, coffre, verrou, navigation
//
// Un seul fournisseur React pour tout le socle. Pourquoi un seul : les quatre
// éléments sont indissociables (voir `local/contexte.ts`) et les séparer en
// quatre contextes créerait des états intermédiaires impossibles — « navigation
// prête, coffre fermé » — que chaque écran devrait ensuite traiter.
//
// ── LA MACHINE DE LA COQUILLE, EN QUATRE PHASES ─────────────────────────────
//   chargement  → ouverture d'IndexedDB et relecture de `meta`
//   erreur      → base plus récente que le code (invariant 7 : on ne supprime RIEN)
//   verrouille  → le coffre est fermé ; SEULE vue possible : le déverrouillage
//   ouvert      → contexte local installé, la collecte peut lire et écrire
//
// Le passage `ouvert → verrouille` ferme le coffre ET retire le contexte local :
// après lui, plus aucun chemin de code n'atteint la DEK (05 §9.7).
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E33 (sécurité / RGPD).
// =============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BaseTropRecenteError,
  CLES_META,
  ecrireMeta,
  lireMeta,
  ouvrirBaseLocale,
  type BaseLocale,
} from '../local/base.js';
import { deverrouiller, initialiserCoffre, lireCoffreAuRepos } from '../local/coffre-appareil.js';
import { contexteLocal, installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { instantMs, restaurerDecalage } from '../local/horloge.js';
import {
  effacerJetonRafraichissement,
  enregistrerJetonRafraichissement,
  lireJetonRafraichissement,
  type JetonRafraichissement,
} from '../local/jetons.js';
import { evaluerStockage, type EtatStockage } from '../local/stockage.js';
import {
  ETAT_NAVIGATION_INITIAL,
  peutRevenir,
  reducteurNavigation,
  restaurerNavigation,
  useGesteRetourSysteme,
  vueCourante,
  type ActionNavigation,
  type EtatNavigation,
} from './navigation.js';
import { useVerrou, type EtatVerrou } from './verrou.js';
import type { CodeVue } from './vues.js';

export type PhaseSocle = 'chargement' | 'erreur' | 'verrouille' | 'ouvert';

/**
 * L'état du lien avec le siège, tel que le socle peut l'établir HORS LIGNE.
 *
 * 05 §31-3 : « si le refresh token (30 j) expire pendant une longue période hors
 * ligne, le déverrouillage local continue de fonctionner, la collecte se poursuit
 * sans interruption ; seule la SYNCHRONISATION attend une reconnexion. » Le
 * distinguer de la phase du socle n'est donc pas un raffinement : c'est la seule
 * façon de dire « vous pouvez collecter » et « vous ne pourrez pas synchroniser »
 * dans la même phrase, ce que le pack exige mot pour mot.
 *
 * `inconnu` = coffre encore fermé, donc jeton illisible — et non « absent ».
 */
export type EtatJetonSiege = 'inconnu' | 'absent' | 'valide' | 'expire';

/** Le jeton est chiffré sous la DEK : cette lecture n'est possible que coffre OUVERT. */
function evaluerJeton(jeton: JetonRafraichissement | null): EtatJetonSiege {
  if (jeton === null) return 'absent';
  if (jeton.expireLe === null) return 'valide';
  return Date.parse(jeton.expireLe) <= instantMs() ? 'expire' : 'valide';
}

export interface PanneSocle {
  readonly cause: string;
  readonly action: string;
}

export interface ValeurTerrain {
  readonly phase: PhaseSocle;
  readonly panne: PanneSocle | null;
  /** `true` quand aucun coffre n'existe encore : le mot de passe saisi le CRÉE. */
  readonly premierUsage: boolean;
  readonly base: BaseLocale | null;
  readonly verrou: EtatVerrou;
  readonly navigation: EtatNavigation;
  readonly vue: CodeVue;
  readonly stockage: EtatStockage | null;
  /** Lu au déverrouillage, depuis Dexie, CHIFFRÉ (11 §3, 05 §31-3). */
  readonly jetonSiege: EtatJetonSiege;
  naviguer: (action: ActionNavigation) => void;
  /** Range le jeton de rafraîchissement CHIFFRÉ dans Dexie — appelé après une connexion. */
  memoriserJetonSiege: (jeton: JetonRafraichissement) => Promise<void>;
  /** Déconnexion, ou réutilisation détectée par le serveur (11 §3). */
  oublierJetonSiege: () => Promise<void>;
  /** Ouvre le coffre. Lève une erreur explicite si le mot de passe est faux. */
  ouvrir: (motDePasse: string) => Promise<void>;
  /** Ferme le coffre et retire le contexte local. Le geste manuel du 05 §9.7. */
  fermer: () => void;
  rafraichirStockage: () => Promise<void>;
}

const ContexteTerrain = createContext<ValeurTerrain | null>(null);

export function useTerrain(): ValeurTerrain {
  const valeur = useContext(ContexteTerrain);
  if (valeur === null) {
    throw new Error('useTerrain doit être appelé sous <FournisseurTerrain>.');
  }
  return valeur;
}

export function FournisseurTerrain({ children }: { readonly children: ReactNode }): ReactNode {
  const [base, setBase] = useState<BaseLocale | null>(null);
  const [phase, setPhase] = useState<PhaseSocle>('chargement');
  const [panne, setPanne] = useState<PanneSocle | null>(null);
  const [premierUsage, setPremierUsage] = useState(false);
  const [stockage, setStockage] = useState<EtatStockage | null>(null);
  const [jetonSiege, setJetonSiege] = useState<EtatJetonSiege>('inconnu');
  const [navigation, naviguer] = useReducer(reducteurNavigation, ETAT_NAVIGATION_INITIAL);

  // ── Amorçage : ouvrir la base, relire ce que `meta` sait déjà ──────────────
  useEffect(() => {
    // Un booléen local serait NARROWÉ à `false` par TypeScript — il ne suit pas
    // l'affectation faite dans la fermeture de nettoyage —, et chaque garde
    // deviendrait « toujours fausse » aux yeux du lint. La lecture par APPEL n'est
    // pas narrowable : la garde reste vraie, et le composant démonté en plein
    // amorçage ne pose plus d'état.
    let vivant = true;
    const abandonne = (): boolean => !vivant;
    const amorcer = async (): Promise<void> => {
      try {
        const ouverte = await ouvrirBaseLocale();
        if (abandonne()) {
          ouverte.close();
          return;
        }
        // Le décalage d'horloge AVANT tout le reste : les écritures qui suivront
        // doivent en bénéficier, y compris hors ligne (05 §9.2).
        const decalage = await lireMeta(ouverte, CLES_META.decalageHorloge);
        if (typeof decalage === 'number') restaurerDecalage(decalage);

        const vueMemorisee = await lireMeta(ouverte, CLES_META.vueCourante);
        const coffre = await lireCoffreAuRepos(ouverte);
        if (abandonne()) return;

        naviguer({ type: 'racine', vue: vueCourante(restaurerNavigation(vueMemorisee)) });
        setBase(ouverte);
        setPremierUsage(coffre === null);
        setPhase('verrouille');
        setStockage(await evaluerStockage());
      } catch (erreur) {
        if (abandonne()) return;
        setPanne(
          erreur instanceof BaseTropRecenteError
            ? {
                cause: erreur.message,
                action:
                  'Rechargez la page pour appliquer la mise à jour. Aucune donnée n’a été supprimée.',
              }
            : {
                cause: 'Le stockage local de cet appareil n’a pas pu être ouvert.',
                action:
                  'Vérifiez que la navigation privée est désactivée, puis rechargez la page. Si le problème persiste, changez d’appareil AVANT de collecter.',
              },
        );
        setPhase('erreur');
      }
    };
    void amorcer();
    return () => {
      vivant = false;
    };
  }, []);

  // ── Y a-t-il une session en cours ? (délai de verrou : 15 ou 60 min) ───────
  // Lecture d'INDEX uniquement — aucun déchiffrement, donc utilisable même à
  // chaque rendu. C'est précisément ce que la liste fermée du §3.2 rend possible.
  const sessionActive = useLiveQuery(
    async () =>
      base === null
        ? false
        : (await base.interviews.where('status').equals('en_cours').count()) > 0,
    [base],
    false,
  );

  const fermer = useCallback(() => {
    retirerContexteLocal();
    // Le jeton redevient ILLISIBLE, pas absent : il reste chiffré dans Dexie et
    // servira au prochain déverrouillage. Le passer à `absent` ferait afficher
    // « reconnexion requise » à un auditeur qui n'a rien perdu.
    setJetonSiege('inconnu');
    setPhase((precedente) => (precedente === 'ouvert' ? 'verrouille' : precedente));
  }, []);

  const verrou = useVerrou({ sessionActive, surVerrouillage: fermer });

  const ouvrir = useCallback(
    async (motDePasse: string): Promise<void> => {
      if (base === null) return;
      const coffre = premierUsage
        ? await initialiserCoffre(base, motDePasse)
        : await deverrouiller(base, motDePasse);
      installerContexteLocal({ base, coffre });
      setPremierUsage(false);
      setPhase('ouvert');
      verrou.signalerDeverrouillage();
      // Le jeton de sync est chiffré sous la DEK : c'est ICI, coffre tout juste
      // ouvert, qu'il devient lisible — et nulle part ailleurs.
      setJetonSiege(evaluerJeton(await lireJetonRafraichissement(base, coffre)));
      setStockage(await evaluerStockage());
    },
    [base, premierUsage, verrou],
  );

  const rafraichirStockage = useCallback(async (): Promise<void> => {
    setStockage(await evaluerStockage());
  }, []);

  const memoriserJetonSiege = useCallback(async (jeton: JetonRafraichissement): Promise<void> => {
    const contexte = contexteLocal();
    await enregistrerJetonRafraichissement(contexte.base, contexte.coffre, jeton);
    setJetonSiege(evaluerJeton(jeton));
  }, []);

  const oublierJetonSiege = useCallback(async (): Promise<void> => {
    if (base === null) return;
    await effacerJetonRafraichissement(base);
    setJetonSiege('absent');
  }, [base]);

  // ── Reprise instantanée : la vue courante est PERSISTÉE (03 §17.4) ────────
  const vue = vueCourante(navigation);
  useEffect(() => {
    if (base === null || phase !== 'ouvert') return;
    void ecrireMeta(base, CLES_META.vueCourante, vue);
  }, [base, phase, vue]);

  // ── Le geste retour du système ne quitte jamais l'app en pleine collecte ───
  const retour = useCallback((): boolean => {
    if (!peutRevenir(navigation)) return false;
    naviguer({ type: 'retour' });
    return true;
  }, [navigation]);
  useGesteRetourSysteme(retour);

  const valeur = useMemo<ValeurTerrain>(
    () => ({
      phase,
      panne,
      premierUsage,
      base,
      verrou,
      navigation,
      vue,
      stockage,
      jetonSiege,
      naviguer,
      ouvrir,
      fermer,
      rafraichirStockage,
      memoriserJetonSiege,
      oublierJetonSiege,
    }),
    [
      phase,
      panne,
      premierUsage,
      base,
      verrou,
      navigation,
      vue,
      stockage,
      jetonSiege,
      ouvrir,
      fermer,
      rafraichirStockage,
      memoriserJetonSiege,
      oublierJetonSiege,
    ],
  );

  return <ContexteTerrain.Provider value={valeur}>{children}</ContexteTerrain.Provider>;
}

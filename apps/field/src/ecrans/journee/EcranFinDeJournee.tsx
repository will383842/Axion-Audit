// =============================================================================
// FIN DE JOURNÉE — 03 §34.2-2, §19.1 (V2.10), §17.3 (fin de visite), invariant 8
//
// ── LE GESTE, MOT POUR MOT ──────────────────────────────────────────────────
// 03 §34.2-2 : « Bouton “**Fin de journée**” : **UN geste** = sync forcée +
// **export de secours chiffré (§9.7)** + synthèse du jour (à-revoir ouverts,
// entretiens terminés non validés → **validation groupée §19.1**, photos en
// attente de sync) — **l'invariant 8 cesse d'être une discipline de mémoire et
// devient un bouton**. »
//
// « UN geste » est le critère de porte (§33.7). L'écran ne demande donc pas trois
// confirmations : il montre la synthèse, coche par défaut ce qui est validable,
// et un seul bouton exécute les trois. Le mot de passe est demandé UNE fois, et
// pour une raison qui n'est pas administrative : la clé du fichier `.axionbackup`
// dérive de lui et de rien d'autre (11 §4), il n'est nulle part en mémoire.
//
// ── LE BOUTON NE DOIT PAS MENTIR ────────────────────────────────────────────
// `LOT_L5.md` §3.6, sur ce bouton exactement : « L5a livre `PortSync` et une
// implémentation INERTE ; la tentation est de la faire répondre “tout va bien”.
// Elle rend `{statut: 'indisponible'}` et l'écran l'affiche tel quel — jamais une
// pastille verte. » La synthèse rend donc TROIS résultats distincts, et l'échec
// de la synchronisation n'empêche jamais l'export : c'est même l'inverse, c'est
// quand la sync est indisponible que la sauvegarde compte.
//
// ── TERMINER ≠ VALIDER, ET C'EST ICI QUE LE SECOND GESTE SE POSE ───────────
// 03 §19.1 V2.10 : « Valider l'entretien » est « typiquement posé **en fin de
// journée** depuis la synthèse mission, où la **validation GROUPÉE** est possible
// (les entretiens terminés du jour cochés → **une seule confirmation, un seul
// récapitulatif cumulé**) ». Cet écran EST cette synthèse. Les règles, elles, ne
// sont pas ici : elles sont dans `agenda/validation.ts`, qui interroge la machine
// à états de L5a.
//
// ── AUCUN VERROU (critère P-C, §33.7) ──────────────────────────────────────
// Rien sur cet écran ne bloque quoi que ce soit. Une session non validable est
// listée avec SON motif et n'empêche pas les autres ; un export refusé n'empêche
// pas de continuer à collecter ; un mot de passe faux ne fait rien perdre.
//
// Traçabilité : E38 (sauvegarde terrain, invariant 8), E24 (validation
// obligatoire de chaque étape), E6 (hors ligne total).
// =============================================================================
import { useCallback, useId, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, CaseACocher, Message, ZoneEtat, type EtatZone } from '@axion/ui';
import {
  construireJournee,
  type EtatMissionDuJour,
  type JourneeTerrain,
} from '../../agenda/jour.js';
import { LIBELLE_TYPE_SESSION } from '../../agenda/sessions.js';
import {
  sessionsValidablesEnGroupe,
  syntheseDeValidation,
  validerEnGroupe,
  type RefusValidation,
} from '../../agenda/validation.js';
import { useTerrain } from '../../app/contexte.js';
import { ecrireMeta, lireMeta } from '../../local/base.js';
import { maintenant } from '../../local/horloge.js';
import { portSyncInerte } from '../../local/port-sync.js';
import { nomFichierSauvegarde } from '../../sauvegarde/format.js';
import { exporterSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { PROFIL_PAR_DEFAUT } from '../../session/auditeur.js';
import './journee.css';

/** Clé `meta` du dernier rituel accompli — le rappel discret du §34.2 s'y règle. */
const CLE_DERNIER_RITUEL = 'journee:dernier-rituel';

interface ResultatRituel {
  readonly sync: string;
  readonly sauvegarde: string;
  readonly validation: string;
  readonly refus: readonly RefusValidation[];
  /** Le fichier produit, à télécharger. `null` si l'export a échoué. */
  readonly fichier: { readonly nom: string; readonly contenu: string } | null;
}

/**
 * Dépose le fichier sur l'appareil.
 *
 * 05 §9.7 : « fichier unique chiffré […] **déposable sur le stockage de
 * l'appareil ou une clé USB** ». Un `<a download>` synthétique est le seul
 * mécanisme disponible hors ligne dans un navigateur ; `showSaveFilePicker`
 * n'existe pas sur Safari, qui est la cible dure (03 §22.1).
 */
function deposerFichier(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

export function EcranFinDeJournee(): ReactNode {
  const { base, naviguer } = useTerrain();
  const identifiant = useId();
  const [motDePasse, setMotDePasse] = useState('');
  const [cochees, setCochees] = useState<Set<string> | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatRituel | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const journee = useLiveQuery(
    async (): Promise<JourneeTerrain | null | undefined> => {
      if (base === null) return undefined;
      try {
        return await construireJournee(portSyncInerte);
      } catch {
        return null;
      }
    },
    [base],
    undefined,
  );

  const validables =
    journee == null ? [] : sessionsValidablesEnGroupe(journee.aValider, PROFIL_PAR_DEFAUT);

  // Par défaut TOUT est coché : 03 §34.2 veut « un geste ». Décocher est le geste
  // d'exception, pas cocher — l'auditeur qui a terminé cinq entretiens ne doit
  // pas les cocher un par un pour faire ce qu'il fait tous les soirs.
  const selection = cochees ?? new Set(validables.map((session) => session.id));
  const aValider = validables.filter((session) => selection.has(session.id));
  const synthese = syntheseDeValidation(aValider);

  const basculer = useCallback(
    (id: string): void => {
      setCochees((precedent) => {
        const suivant = new Set(precedent ?? new Set(validables.map((s) => s.id)));
        if (suivant.has(id)) suivant.delete(id);
        else suivant.add(id);
        return suivant;
      });
    },
    [validables],
  );

  /**
   * LE geste unique : synchroniser, sauvegarder, valider — dans cet ordre, et
   * **sans qu'un échec n'annule les suivants**.
   *
   * L'ordre n'est pas indifférent. La sync d'abord parce que si elle réussit, la
   * sauvegarde qui suit est moins critique ; l'export ensuite parce qu'il est le
   * filet quand la sync a échoué ; la validation en dernier parce qu'elle
   * MODIFIE des données, et qu'on ne modifie pas avant d'avoir protégé.
   */
  const executer = useCallback((): void => {
    if (base === null || journee == null) return;
    setEnCours(true);
    setErreur(null);

    void (async (): Promise<void> => {
      const missionId = journee.missions[0]?.mission.id ?? null;

      // ① Synchronisation. Le port est inerte tant que L6a n'a pas livré : il
      //    dit « indisponible », et c'est ce que l'écran affichera.
      let sync = 'Aucune mission embarquée : rien à synchroniser.';
      if (missionId !== null) {
        const r = await portSyncInerte.synchroniserMaintenant(missionId);
        sync = r.message;
      }

      // ② Sauvegarde de secours. Elle fonctionne SANS réseau (11 §4) — c'est
      //    précisément pour cet instant qu'elle existe.
      let sauvegarde = 'Aucune mission embarquée : aucune sauvegarde à produire.';
      let fichier: ResultatRituel['fichier'] = null;
      if (missionId !== null) {
        if (motDePasse.trim() === '') {
          sauvegarde =
            'Sauvegarde NON produite : votre mot de passe est nécessaire pour la chiffrer (c’est lui, et lui seul, qui permettra de la rouvrir sur un autre appareil).';
        } else {
          try {
            const produit = await exporterSauvegarde({ missionId, motDePasse });
            const nom = nomFichierSauvegarde(missionId, produit.enTete.creeLe);
            fichier = { nom, contenu: JSON.stringify(produit) };
            deposerFichier(nom, fichier.contenu);
            sauvegarde = `Sauvegarde chiffrée produite : ${nom} (${String(produit.enTete.operationsIncluses)} élément(s) non encore synchronisé(s) inclus).`;
          } catch {
            sauvegarde =
              'La sauvegarde n’a pas pu être produite sur cet appareil. Vos données restent intactes ; réessayez, et prévenez le siège si l’échec persiste.';
          }
        }
      }

      // ③ Validation groupée. Une seule confirmation, un seul récapitulatif.
      let validation = 'Aucun entretien terminé à valider.';
      let refus: readonly RefusValidation[] = [];
      if (aValider.length > 0) {
        const r = await validerEnGroupe(aValider, PROFIL_PAR_DEFAUT);
        refus = r.refusees;
        validation = `${String(r.validees.length)} entretien(s) validé(s)${r.refusees.length > 0 ? `, ${String(r.refusees.length)} non validé(s)` : ''}.`;
      }

      await ecrireMeta(base, CLE_DERNIER_RITUEL, maintenant());
      setResultat({ sync, sauvegarde, validation, refus, fichier });
      setMotDePasse('');
      setCochees(null);
    })()
      .catch(() => {
        setErreur(
          'Le rituel de fin de journée n’a pas pu aller à son terme. Aucune donnée n’a été perdue ; réessayez.',
        );
      })
      .finally(() => {
        setEnCours(false);
      });
  }, [aValider, base, journee, motDePasse]);

  const dernierRituel = useLiveQuery(
    async () => (base === null ? null : ((await lireMeta(base, CLE_DERNIER_RITUEL)) ?? null)),
    [base],
    null,
  );

  const etat: EtatZone =
    journee === undefined
      ? { nature: 'chargement', libelle: 'Lecture de votre journée', lignes: 3 }
      : journee === null
        ? {
            nature: 'erreur',
            titre: 'La synthèse du jour n’a pas pu être lue',
            cause: 'Les données locales de cet appareil n’ont pas pu être ouvertes.',
            action: 'Rechargez la page, puis relancez la fin de journée.',
          }
        : journee.sessionsDuJour.length === 0 && journee.missions.length === 0
          ? {
              nature: 'vide',
              titre: 'Rien à clôturer',
              description:
                'Aucune mission n’est embarquée sur cet appareil : il n’y a ni collecte à sauvegarder ni entretien à valider.',
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <h1>Fin de journée</h1>
      <p>
        Un seul geste : synchroniser, produire une sauvegarde de secours chiffrée, et valider les
        entretiens terminés du jour.
      </p>

      <ZoneEtat etat={etat}>
        <>
          {/* ── La synthèse du jour (03 §34.2-2) ─────────────────────────── */}
          <div className="axn-journee__carte">
            <div className="axn-journee__entete-carte">
              <h2 className="axn-journee__titre-carte">Votre journée</h2>
            </div>
            <ul>
              <li>
                {journee?.sessionsDuJour.length ?? 0} session(s) au programme,{' '}
                {(journee?.sessionsDuJour ?? []).filter((s) => s.status === 'termine').length}{' '}
                terminée(s)
              </li>
              <li>
                {(journee?.missions ?? []).reduce(
                  (t: number, m: EtatMissionDuJour) => t + m.aRevoirOuverts,
                  0,
                )}{' '}
                point(s) à revoir encore ouverts
              </li>
              <li>
                {(journee?.missions ?? []).reduce(
                  (t: number, m: EtatMissionDuJour) => t + (m.sync.operationsEnAttente ?? 0),
                  0,
                )}{' '}
                élément(s) de collecte en attente de remontée
              </li>
            </ul>
            {typeof dernierRituel === 'string' && (
              <p className="axn-coquille__mention">Dernier rituel : {dernierRituel}</p>
            )}
          </div>

          {/* ── La validation groupée (03 §19.1 V2.10) ───────────────────── */}
          <div className="axn-journee__carte">
            <div className="axn-journee__entete-carte">
              <h2 className="axn-journee__titre-carte">Entretiens terminés à valider</h2>
            </div>
            {validables.length === 0 ? (
              <p>
                Aucun entretien terminé n’attend d’être validé. Un entretien terminé reste
                modifiable tant qu’il n’est pas validé.
              </p>
            ) : (
              <>
                <p>
                  Valider verrouille l’entretien : toute correction ultérieure sera une révision
                  tracée. Décochez ce que vous voulez garder ouvert.
                </p>
                <ul className="axn-journee__liste">
                  {validables.map((session) => (
                    <li key={session.id}>
                      <CaseACocher
                        checked={selection.has(session.id)}
                        onChange={() => {
                          basculer(session.id);
                        }}
                        libelle={`${session.personName ?? 'Interlocuteur non nommé'} — ${LIBELLE_TYPE_SESSION[session.kind]}`}
                      />
                    </li>
                  ))}
                </ul>
                <p className="axn-coquille__mention">
                  Récapitulatif : {synthese.nombre} entretien(s) seront validés.
                </p>
              </>
            )}
          </div>

          {/* ── Le mot de passe, pour la sauvegarde et rien d'autre ──────── */}
          <div className="axn-journee__carte">
            <div className="axn-journee__entete-carte">
              <h2 className="axn-journee__titre-carte">Sauvegarde de secours</h2>
            </div>
            {/*
              `ChampTexte` retire délibérément `type` de ses propriétés : ses six
              natures sont des natures de DONNÉE, aucune n'est un secret. Cet
              écran compose donc les classes du design system directement, comme
              `EcranDeverrouillage` (L5a) le fait déjà pour la même raison —
              aucune couleur ni taille en dur, aucun jeton nouveau, les mêmes
              règles CSS que tous les autres champs (invariant 4).
            */}
            <div className="axn-champ">
              <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp`}>
                Votre mot de passe
              </label>
              <input
                id={`${identifiant}-mdp`}
                className="axn-champ__saisie"
                type="password"
                autoComplete="current-password"
                data-saisie-libre="vrai"
                aria-describedby={`${identifiant}-aide`}
                value={motDePasse}
                onChange={(evenement) => {
                  setMotDePasse(evenement.target.value);
                }}
              />
              <p id={`${identifiant}-aide`} className="axn-champ__aide">
                Il chiffre le fichier de sauvegarde. C’est lui, et lui seul, qui permettra de le
                rouvrir — y compris sur un autre appareil.
              </p>
            </div>
          </div>

          {/* ── LE geste unique ──────────────────────────────────────────── */}
          <div className="axn-journee__actions">
            <Bouton taille="large" chargement={enCours} onClick={executer}>
              Terminer la journée
            </Bouton>
            <Bouton
              variante="secondaire"
              onClick={() => {
                naviguer({ type: 'retour' });
              }}
            >
              Revenir
            </Bouton>
          </div>

          {erreur !== null && (
            <Message ton="alerte" titre="Le rituel n’a pas abouti">
              {erreur}
            </Message>
          )}

          {resultat !== null && (
            <div className="axn-journee__carte">
              <div className="axn-journee__entete-carte">
                <h2 className="axn-journee__titre-carte">Ce qui a été fait</h2>
              </div>
              <Message ton="info" titre="Synchronisation">
                {resultat.sync}
              </Message>
              <Message
                ton={resultat.fichier === null ? 'avertissement' : 'succes'}
                titre="Sauvegarde de secours"
              >
                {resultat.sauvegarde}
              </Message>
              <Message ton="succes" titre="Validation des entretiens">
                {resultat.validation}
              </Message>
              {resultat.refus.map((refus) => (
                <Message key={refus.id} ton="avertissement" titre="Entretien non validé">
                  {refus.personName ?? 'Interlocuteur non nommé'} — {refus.motif}
                </Message>
              ))}
            </div>
          )}
        </>
      </ZoneEtat>
    </section>
  );
}

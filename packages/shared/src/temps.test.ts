// =============================================================================
// F-19 — LA VALIDITÉ D'UN FUSEAU SE CALCULE UNE FOIS PAR GRAPHIE, PAS PAR LIGNE.
//
// ── QUI ÉCRIT CE FICHIER, ET POURQUOI CE N'EST PAS L'AUTEUR DU CORRECTIF ─────
// 09 §5.6 : le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé. `packages/shared/src/temps.ts` a été corrigé par A15 dans `58231bb` ; ce
// fichier est écrit par A16 (testeur), sur la SEULE base de la sonde consignée par
// A51 et recopiée dans `DECISIONS.md` du 2026-09-02 (« Rejeu A51 », constat F-19) :
// « `fuseauIanaSchema` construit un `Intl.DateTimeFormat` PAR LIGNE — 5 000 fuseaux
// légitimes = 1,4 s sous le verrou de mission ».
//
// ── LES DEUX SONDES, ET POURQUOI IL EN FAUT DEUX ────────────────────────────
// ① DÉTERMINISTE, et c'est la principale : on COMPTE les constructions de
//    `Intl.DateTimeFormat` pendant l'analyse d'un fichier de 5 000 lignes portant
//    toutes le même fuseau. Sans mémoïsation il y en a 5 000 ; avec, il y en a au
//    plus UNE. Un compteur ne dépend ni de la charge de la machine ni de l'humeur
//    du ramasse-miettes : ce cas ne peut pas devenir intermittent.
// ② CHRONOMÉTRIQUE — la sonde « ×10 » d'A51 — parce que le compteur seul ne dirait
//    rien du COÛT : une implémentation qui appellerait `Intl` une seule fois puis
//    referait le travail autrement serait verte au compteur. La comparaison est
//    RELATIVE et prise dans la MÊME exécution, sur la MÊME machine : le seuil n'est
//    donc pas un temps absolu (qui serait intermittent en CI) mais un RAPPORT entre
//    deux boucles voisines. Marge mesurée le 2026-09-02 sur ce dépôt : ×800 environ,
//    pour un seuil exigé à ×10.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit plutôt que sous-entendu ─────────────
//   · rien sur le fuseau d'AFFICHAGE (§22.2) : seule la VALIDATION est mesurée ;
//   · rien sur 5 000 graphies DISTINCTES et inconnues — `temps.ts` écrit lui-même
//     que ce coût-là reste ouvert, borné par `LIGNES_CSV_ARBRE_MAX`. Un test ne
//     doit pas prétendre fermer ce que le code déclare ouvert.
//
// Invariant 2 : aucune référence client — les libellés sont des unités factices.
// Traçabilité : E33 (sécurité), E43 (conventions), E46 (format CSV §35.2)
// · CLAUDE.md §5 (« couverture mesurée, pas déclarée »).
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { LIGNES_CSV_ARBRE_MAX, analyserCsvArbre, type AnalyseCsvArbre } from './org-units.js';
import { fuseauIanaSchema } from './temps.js';

const FUSEAU_LEGITIME = 'Europe/Paris';

/** Nombre de lignes de la sonde A51. C'est aussi le plafond d'un import (§35.2). */
const LIGNES = 5000;

/**
 * Facteur exigé par la sonde « ×10 » d'A51. Volontairement très en deçà de la marge
 * mesurée : un seuil serré transformerait une machine chargée en échec, et une suite
 * intermittente finit ignorée.
 */
const FACTEUR_EXIGE = 10;

const CONSTRUCTEUR_REEL = Intl.DateTimeFormat;

afterEach(() => {
  // On rétablit TOUJOURS : un `Intl` laissé instrumenté contaminerait les autres
  // fichiers du projet `unit`, qui partagent le processus.
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: CONSTRUCTEUR_REEL,
    configurable: true,
    writable: true,
  });
});

/** Instrumente `Intl.DateTimeFormat` et rend le nombre de constructions de `action`. */
function compterConstructions(action: () => void): number {
  let appels = 0;
  const espion = function espion(
    ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
  ): Intl.DateTimeFormat {
    appels += 1;
    return new CONSTRUCTEUR_REEL(...args);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.defineProperty(espion, 'supportedLocalesOf', {
    value: CONSTRUCTEUR_REEL.supportedLocalesOf.bind(CONSTRUCTEUR_REEL),
  });
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: espion,
    configurable: true,
    writable: true,
  });
  action();
  return appels;
}

/** Un fichier §35.2 de `lignes` unités à plat, toutes portant le même fuseau. */
function csvAvecFuseau(lignes: number, fuseau: string): string {
  const entete =
    'ref;name;kind;parent_ref;country_code;headcount;service_code;sector_code;timezone';
  const corps: string[] = [];
  for (let i = 0; i < lignes; i += 1) {
    corps.push(`u${String(i)};Unite factice ${String(i)};service;;FR;;;;${fuseau}`);
  }
  return [entete, ...corps].join('\r\n') + '\r\n';
}

describe('fuseauIanaSchema — la mémoïsation exigée par A51 (F-19)', () => {
  it('@critique 5 000 lignes portant le même fuseau ne construisent PAS 5 000 formateurs', () => {
    // La sonde d'A51, littéralement : un import à la taille maximale admise, dont la
    // colonne `timezone` est renseignée partout. Le contrôle étant PUR, il n'y a
    // aucune raison de le refaire ligne après ligne — et le refaire coûtait 1,4 s
    // SOUS LE VERROU DE MISSION, donc en sérialisant toutes les écritures d'arbre de
    // cette mission pendant ce temps.
    expect(LIGNES, 'la sonde tourne au plafond réel d’un import').toBe(LIGNES_CSV_ARBRE_MAX);
    const contenu = csvAvecFuseau(LIGNES, FUSEAU_LEGITIME);

    let analyse: AnalyseCsvArbre | undefined;
    const constructions = compterConstructions(() => {
      analyse = analyserCsvArbre(contenu);
    });

    // TÉMOIN — sans lui, ce cas passerait au vert si l'analyse refusait le fichier
    // avant d'avoir seulement regardé la colonne `timezone`.
    expect(analyse?.erreurs, 'le fichier témoin doit être VALIDE').toHaveLength(0);
    expect(analyse?.lignes).toHaveLength(LIGNES);
    expect(analyse?.lignes[0]?.timezone, 'le fuseau atterrit bien dans la ligne').toBe(
      FUSEAU_LEGITIME,
    );

    expect(
      constructions,
      `Sans mémoïsation il y en aurait ${String(LIGNES)} (constat A51, F-19) ; ` +
        `mesuré : ${String(constructions)}.`,
    ).toBeLessThanOrEqual(1);
  });

  it('@critique le contrôle mémoïsé est au moins dix fois moins cher qu’une construction par appel', () => {
    // La sonde « ×10 ». Les deux boucles sont VOISINES et de MÊME longueur : ce qui
    // est comparé, c'est le coût du contrôle mémoïsé au coût de ce que la version
    // fautive faisait — construire un formateur à chaque appel. Aucun temps absolu
    // n'est asséré, donc rien ici ne dépend de la vitesse de la machine.
    const puits: unknown[] = [];

    const t0 = performance.now();
    for (let i = 0; i < LIGNES; i += 1) {
      puits.push(new CONSTRUCTEUR_REEL('fr-FR', { timeZone: FUSEAU_LEGITIME }));
    }
    const coutParAppel = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < LIGNES; i += 1) {
      puits.push(fuseauIanaSchema.safeParse(FUSEAU_LEGITIME).success);
    }
    const coutMemoise = performance.now() - t1;

    // Le puits existe pour que rien ne soit éliminé comme calcul mort : une boucle
    // dont le résultat n'est lu par personne peut être supprimée par le moteur, et
    // la mesure comparerait alors deux riens.
    expect(puits).toHaveLength(LIGNES * 2);
    expect(
      coutMemoise * FACTEUR_EXIGE,
      `Mémoïsé : ${coutMemoise.toFixed(1)} ms pour ${String(LIGNES)} contrôles ; une ` +
        `construction par appel : ${coutParAppel.toFixed(1)} ms. Le rapport doit atteindre ` +
        `×${String(FACTEUR_EXIGE)} (A51, F-19).`,
    ).toBeLessThanOrEqual(coutParAppel);
  });

  it('mémoïser n’a rien changé au VERDICT — valides acceptés, inconnus refusés, y compris relus', () => {
    // Un cache qui répondrait vite et FAUX serait une régression bien pire que le
    // coût qu'il supprime. Chaque graphie est éprouvée DEUX fois : la seconde passe
    // par le cache, et doit rendre exactement le même verdict que la première. Les
    // alias (`Asia/Calcutta`) sont là exprès : ils sont légitimes et absents de
    // `Intl.supportedValuesOf('timeZone')`.
    for (const valide of [
      'Europe/Paris',
      'UTC',
      'America/Argentina/Buenos_Aires',
      'Asia/Calcutta',
    ]) {
      expect(fuseauIanaSchema.safeParse(valide).success, valide).toBe(true);
      expect(fuseauIanaSchema.safeParse(valide).success, `${valide} (relu du cache)`).toBe(true);
    }
    for (const inconnu of ['Europe/Atlantide', 'Pas un fuseau', '', 'Europe/Paris ']) {
      expect(fuseauIanaSchema.safeParse(inconnu).success, `« ${inconnu} »`).toBe(false);
      expect(fuseauIanaSchema.safeParse(inconnu).success, `« ${inconnu} » (relu)`).toBe(false);
    }
  });

  it('la table des graphies REFUSÉES est bornée, et sa purge ne fausse aucun verdict', () => {
    // Un cache dont l'appelant choisit les clés est un vecteur d'épuisement mémoire
    // s'il n'est pas borné. On pousse très au-delà du plafond annoncé, puis on
    // revérifie un valide et un invalide : une purge fait perdre un cache, jamais
    // une garantie.
    for (let i = 0; i < 1000; i += 1) {
      expect(fuseauIanaSchema.safeParse(`Europe/Inconnue${String(i)}`).success).toBe(false);
    }
    expect(fuseauIanaSchema.safeParse(FUSEAU_LEGITIME).success, 'un valide reste valide').toBe(true);
    expect(fuseauIanaSchema.safeParse('Europe/Atlantide').success, 'un inconnu reste refusé').toBe(
      false,
    );
  });
});

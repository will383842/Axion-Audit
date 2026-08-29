// =============================================================================
// LOT L2 — `analyserDureeMs` : LA DURÉE DE SESSION, ET CE QU'ELLE REFUSE.
//
// Écrit par A17, réviseur croisé du lot, qui n'a produit AUCUNE des lignes testées
// (09 §5.6). Les attentes viennent du contrat 11 §3 (« refresh 30 j rotatif ») et
// de ce que la fonction PROMET en tête de `jetons-rafraichissement.ts` — jamais du
// décalque de ses branches.
//
// ── POURQUOI CE FICHIER EXISTE : LA MESURE, PAS L'INTUITION ──────────────────
// Mesure de couverture du 2026-08-29 (suite complète verte) : `analyserDureeMs`
// n'était exercée QUE par son chemin heureux — l'évaluation de
// `DUREE_RAFRAICHISSEMENT_MS` au chargement du module. Ses quatre refus, lignes
// 93 à 115, n'avaient AUCUN test.
//
// Ce n'est pas un trou cosmétique. Cette fonction décide de la DURÉE DE VIE DES
// SESSIONS DE TOUT LE TERRAIN, et son propre commentaire nomme la panne : « une
// durée de session mal orthographiée qui vaudrait silencieusement " 30 jours " — ou
// " 30 millisecondes " — est exactement le genre de panne qu'on ne découvre qu'en
// clientèle ». La garantie n'est PAS qu'elle calcule juste : c'est qu'elle REFUSE
// DE DEVINER, et qu'elle empêche le processus de démarrer plutôt que de retomber
// sur une valeur par défaut. Une garantie de refus qu'aucun test n'exerce est une
// garantie que la prochaine refactorisation remplacera par un `?? 30 * JOUR` sans
// que rien ne rougisse.
//
// ── CE QUI N'EST DÉLIBÉRÉMENT PAS TESTÉ ICI, ET POURQUOI ─────────────────────
// Deux refus de cette fonction sont INATTEIGNABLES par construction :
//   · `quantite === undefined || unite === undefined` — l'expression régulière a
//     déjà correspondu, donc ses deux groupes existent ; le code le dit lui-même
//     (« le typage ne le sait pas, et une assertion serait un mensonge ») ;
//   · `multiplicateur === undefined` — le motif `(s|m|h|d)` ne peut rendre qu'une
//     unité présente dans `MULTIPLICATEURS_MS`.
// Les couvrir demanderait de simuler l'impossible. Un test écrit pour la couverture
// et non pour la vérité est PIRE qu'une couverture basse, parce qu'il rassure : ces
// deux branches restent donc rouges, et c'est un signalement, pas un oubli.
//
// Traçabilité : E33 (sécurité : 06 §10.1).
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';

// -----------------------------------------------------------------------------
// Environnement AVANT tout chargement de module applicatif.
//
// `config.ts` valide `process.env` À L'IMPORT, et ce module-ci évalue
// `DUREE_RAFRAICHISSEMENT_MS` au chargement : les imports sont donc DYNAMIQUES.
// Secrets FACTICES (11 §2) : 64 caractères hexadécimaux = les 32 octets exigés.
// -----------------------------------------------------------------------------
process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_duree';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

const SECONDE = 1_000;
const MINUTE = 60 * SECONDE;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

let analyser: (valeur: string, nomVariable: string) => number;

beforeAll(async () => {
  const module = await import('./jetons-rafraichissement.js');
  analyser = module.analyserDureeMs;
});

/** Rend le message de ce que `action` lève, ou `null` si elle ne lève pas. */
function messageLeve(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (erreur: unknown) {
    return erreur instanceof Error ? erreur.message : String(erreur);
  }
}

// =============================================================================
// CE QU'ELLE ACCEPTE — la contre-épreuve, sans laquelle les refus ne prouvent rien
// =============================================================================
describe('analyserDureeMs — les durées valides', () => {
  // Sans ces cas, une fonction qui lèverait sur TOUTE entrée passerait tous les
  // tests de refus ci-dessous. Un test incapable de distinguer le bon cas du
  // mauvais ne prouve rien.
  it('traduit les quatre unités du contrat', () => {
    expect(analyser('900s', 'X')).toBe(900 * SECONDE);
    expect(analyser('15m', 'X')).toBe(15 * MINUTE);
    expect(analyser('12h', 'X')).toBe(12 * HEURE);
    expect(analyser('30d', 'X')).toBe(30 * JOUR);
  });

  it('« 30d » vaut bien TRENTE JOURS, et non trente de quoi que ce soit d’autre', () => {
    // 11 §3 : « refresh 30 j rotatif ». La valeur est écrite en clair plutôt que
    // recalculée par la même formule que le code : un test qui refait le calcul de
    // son sujet valide l'arithmétique, jamais l'unité.
    expect(analyser('30d', 'JWT_REFRESH_TTL')).toBe(2_592_000_000);
  });

  it('tolère les espaces AUTOUR, qui viennent d’un `.env` recopié à la main', () => {
    expect(analyser('  30d  ', 'X')).toBe(30 * JOUR);
    expect(analyser('\t7d\n', 'X')).toBe(7 * JOUR);
  });
});

// =============================================================================
// CE QU'ELLE REFUSE — la garantie, c'est le refus de deviner
// =============================================================================
describe('analyserDureeMs — le refus de deviner', () => {
  it('@critique une durée SANS UNITÉ est refusée, jamais interprétée', () => {
    // Le cas qui coûte le plus cher : « 30 » pourrait passer pour 30 ms, 30 s ou
    // 30 jours selon l'humeur d'une bibliothèque. Un repli silencieux ici
    // déconnecterait tout le terrain — ou n'expirerait jamais.
    const message = messageLeve(() => analyser('30', 'JWT_REFRESH_TTL'));
    expect(
      message,
      'Une durée sans unité DOIT être refusée. Si ce test passe au vert sans levée,\n' +
        'la durée de session est redevenue devinable, et la panne ne se découvrira\n' +
        "qu'en clientèle — c'est ce que le commentaire de la fonction promet d'empêcher.",
    ).not.toBeNull();
  });

  it('@critique le message NOMME la variable ET la valeur fautive', () => {
    // Un refus de démarrer qui ne dit pas QUELLE variable est en cause envoie
    // l'exploitation chercher dans tout un `.env`. Le garde-fou n'est utile que
    // s'il est exploitable.
    const message = messageLeve(() => analyser('trente-jours', 'JWT_REFRESH_TTL'));
    expect(message).not.toBeNull();
    expect(message).toContain('JWT_REFRESH_TTL');
    expect(message).toContain('trente-jours');
  });

  it('refuse une unité hors du contrat (« 4w », « 1y »), plutôt que de l’ignorer', () => {
    // Le risque réel : rogner l'unité et lire « 4 » — quatre millisecondes de
    // session. On veut un refus, pas une troncature.
    expect(messageLeve(() => analyser('4w', 'X'))).not.toBeNull();
    expect(messageLeve(() => analyser('1y', 'X'))).not.toBeNull();
    expect(messageLeve(() => analyser('30D', 'X'))).not.toBeNull();
  });

  it('refuse un espace INTERNE — le `trim` ne vaut que pour les bords', () => {
    expect(messageLeve(() => analyser('30 d', 'X'))).not.toBeNull();
  });

  it('refuse une valeur vide, un signe, une décimale', () => {
    expect(messageLeve(() => analyser('', 'X'))).not.toBeNull();
    expect(messageLeve(() => analyser('-30d', 'X'))).not.toBeNull();
    expect(messageLeve(() => analyser('1.5d', 'X'))).not.toBeNull();
  });

  it('@critique refuse une durée NULLE — un jeton expiré à l’instant de sa frappe', () => {
    // C'est le seul refus qui ne vient PAS d'une faute de frappe évidente : « 0d »
    // est syntaxiquement correct. Il rendrait chaque jeton périmé avant sa remise
    // au client, c'est-à-dire une API qui refuse tout le monde sans rien dire.
    for (const valeur of ['0d', '0s', '0m', '0h']) {
      const message = messageLeve(() => analyser(valeur, 'JWT_REFRESH_TTL'));
      expect(message, `« ${valeur} » doit être refusé`).not.toBeNull();
    }
  });
});

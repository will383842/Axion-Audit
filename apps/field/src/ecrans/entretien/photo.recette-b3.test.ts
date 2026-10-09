// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B3** de la recette novice n°1 (A54,
// 2026-09-06) : la promesse photo, « le constat le plus coûteux du rapport ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient
// à A27 (09 §5.6). Aucun n'est marqué `@critique`.
//
// ── CE QU'ILS TIENNENT, ET POURQUOI C'EST UN TEST ET PAS UNE RELECTURE ──────
// Le défaut n'était pas qu'il manque une fonction : c'est que le produit
// PROMETTAIT la capture photo à un endroit (l'accueil) après l'avoir retirée à
// l'autre (le cockpit, majeur M6 d'A29). Une promesse réparée à un endroit sur
// deux se répare une troisième fois toute seule, sauf si une machine la
// surveille. Le premier test balaie donc TOUTES les sources de
// `apps/field/src` : il échouera le jour où la phrase revient, où qu'elle
// revienne — y compris dans un écran qui n'existe pas encore.
//
// Le second tient l'autre moitié : le motif du bouton doit être VISIBLE. Un
// `aria-label` seul laisse l'auditeur voyant devant un bouton gris et muet, et
// c'est ce bouton-là qui l'envoie photographier avec son téléphone personnel.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif), E44 (UX/UI §33.6).
// =============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as moduleZoneQuestion from './ZoneQuestion.js';

const RACINE_SOURCES = fileURLToPath(new URL('../..', import.meta.url));

/** Tous les fichiers de source de l'app terrain, tests exclus. */
function sources(dossier: string): readonly string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...sources(chemin));
    else if (/[.]tsx?$/.test(entree.name) && !entree.name.includes('.test.')) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Les libellés d'interface d'un fichier : le contenu de ses chaînes littérales.
 *
 * Les COMMENTAIRES sont écartés — celui qui explique ce bloquant contient
 * nécessairement le mot « photographier », et un garde-fou qui interdirait
 * d'expliquer pourquoi il existe est un garde-fou qu'on finit par contourner.
 *
 * Pas d'échappement à gérer : les libellés de ce dépôt sont délimités par des
 * apostrophes ASCII et n'en contiennent jamais — le français y prend
 * l'apostrophe typographique.
 */
function libelles(source: string): readonly string[] {
  const trouves: string[] = [];
  for (const ligne of source.split(/\r?\n/)) {
    const nu = ligne.trim();
    if (nu.startsWith('//') || nu.startsWith('*') || nu.startsWith('/*')) continue;
    for (const trouve of nu.matchAll(/'([^']*)'/g)) trouves.push(trouve[1] ?? '');
  }
  return trouves;
}

/**
 * La promesse d'un GESTE de capture.
 *
 * Deux formes, parce que le dépôt en a produit deux : le verbe seul
 * (« Photographier une pièce », retiré du cockpit le 2026-09-05) et
 * l'énumération (« prendre … des photos », restée sur l'accueil jusqu'ici).
 */
const PROMESSE = /photographi[a-z]+|(prendre|prise de)[^']{0,40}photo/i;

/**
 * Ce qui DÉMENT la promesse dans la même phrase.
 *
 * Le correctif de B3 dit à l'auditeur de ne PAS photographier avec un appareil
 * personnel : cette phrase contient donc « photographier » et « photo », et un
 * garde-fou qui l'attraperait interdirait de prévenir le contournement qu'il est
 * chargé d'empêcher. L'exemption est nommée, étroite, et ne s'applique qu'à une
 * phrase qui dit explicitement que la capture n'existe pas.
 */
const DEMENTI = /(n’est pas disponible|plutôt que)/i;

function promesses(source: string): readonly string[] {
  return libelles(source).filter((texte) => PROMESSE.test(texte) && !DEMENTI.test(texte));
}

describe('B3 — aucune source ne promet la capture photo', () => {
  it('aucun libellé de `apps/field/src` n’annonce que l’appareil PREND des photos', () => {
    const coupables = sources(RACINE_SOURCES)
      .filter((fichier) => promesses(readFileSync(fichier, 'utf8')).length > 0)
      .map((fichier) => fichier.replace(RACINE_SOURCES, ''));
    expect(coupables).toEqual([]);
  });

  it('le balayage n’est pas vide par construction : il attrape bien la phrase retirée', () => {
    expect(
      promesses("const x = 'Prendre des notes, des notes volantes et des photos';"),
    ).toHaveLength(1);
  });

  it('il attrape aussi « Photographier », la formulation retirée du cockpit', () => {
    expect(
      promesses("const x = 'Photographier une pièce et la joindre à la réponse';"),
    ).toHaveLength(1);
  });
});

// ── RÉVISION A26 du 2026-10-09 (L6c-1, `DECISIONS.md` [L6c]) ────────────────
// La capture est réelle : le motif « indisponible » et le bouton « Photo
// (bientôt) » deviennent à leur tour une promesse NON TENUE, dans l'autre sens.
// La preuve au nœud (champ actif, geste fonctionnel) vit dans
// `boutonPhoto.acceptation-b3.test.tsx` ; ici, la trace dans le source.
describe('B3 révisé — la zone question offre la capture, plus le motif d’absence', () => {
  it('`MOTIF_PHOTO_INDISPONIBLE` n’est plus exporté par `ZoneQuestion`', () => {
    expect('MOTIF_PHOTO_INDISPONIBLE' in moduleZoneQuestion).toBe(false);
  });

  it('le source de `ZoneQuestion` ne porte plus « Photo (bientôt) » et porte « Ajouter une photo »', () => {
    const source = readFileSync(join(RACINE_SOURCES, 'ecrans/entretien/ZoneQuestion.tsx'), 'utf8');
    expect(source).not.toContain('Photo (bientôt)');
    expect(source).not.toContain('MOTIF_PHOTO_INDISPONIBLE');
    expect(source).toContain('Ajouter une photo');
  });
});

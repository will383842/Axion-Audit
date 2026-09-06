// =============================================================================
// TESTS DE LA MACHINE À ÉTATS DE SESSION — lot L5, incrément L5a.
//
// Écrits par A26 depuis `docs/conception/LOT_L5.md` §2/§4 et 03 §19.1 (règle
// V2.10), sans lire le corps de `machine.ts` (09 §5.6) — seules ses déclarations
// exportées (`EtatSession`, `ActionSession`, `ProfilAuditeur`, `Autorisation`,
// `TransitionSession`) ont été lues, parce qu'elles sont le contrat.
//
// ── LA MÉTHODE : ÉNUMÉRER, PAS LISTER ────────────────────────────────────────
// 4 états × 5 actions × 2 profils = 40 couples. Le jeu attendu est RECOPIÉ EN DUR
// ci-dessous, transcrit du 03 §19.1 — jamais dérivé de `TRANSITIONS_SESSION` :
// un test qui lirait la table pour se donner ses attentes vérifierait que la
// table est égale à elle-même. C'est l'exhaustivité du REFUS qui porte le
// critère « toute transition interdite rejetée avec motif ».
//
// ── CE QUE LE 03 §19.1 DIT, ET COMMENT IL EST LU ICI ─────────────────────────
//   · « Terminer l'entretien » = geste À CHAUD → `termine` ; « reste ROUVRABLE
//     librement par son auteur tant qu'il n'est pas validé » → `rouvrir` depuis
//     `termine`, SANS motif, pour les DEUX profils.
//   · « Valider l'entretien » = geste QUALITÉ qui verrouille → `valide`, depuis
//     `termine` seulement : atteignable depuis `en_cours`, il verrouillerait à
//     chaud, ce que V2.10 interdit (« deux gestes, deux moments — jamais
//     fusionnés »).
//   · « un entretien validé est verrouillé en modification (correction possible
//     via révision tracée uniquement) » + « expert : les verrous deviennent des
//     garde-fous contournables avec motif obligatoire, journalisé » + « guidé
//     strict : aucune dérogation » → `deverrouiller` depuis `valide` : expert
//     seul, motif OBLIGATOIRE ; refusé au guidé strict.
//   · « Aucun verrou ne peut jamais bloquer la SAISIE » → `demarrer` est ouvert
//     aux deux profils, sans motif.
//   HYPOTHÈSE TRACÉE (pas dans le 03) : l'état d'arrivée de `deverrouiller` est
//   `en_cours` — « son équivalent APRÈS validation » de `rouvrir`. Si A01 tranche
//   `termine`, une seule ligne du tableau change.
//
// Traçabilité : E6 (hors ligne total — la machine tourne sans serveur) ·
// E38 (sauvegarde terrain) · critère 07 L5 « terminer ≠ valider ».
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS_SESSION,
  estVerrouilleeEnModification,
  etatSession,
  peutTransiter,
  versStatutPersiste,
  type ActionSession,
  type EtatSession,
  type ProfilAuditeur,
} from './machine.js';

const ETATS: readonly EtatSession[] = ['non_demarre', 'en_cours', 'termine', 'valide'];
const ACTIONS: readonly ActionSession[] = [
  'demarrer',
  'terminer',
  'rouvrir',
  'valider',
  'deverrouiller',
];
const PROFILS: readonly ProfilAuditeur[] = ['guide_strict', 'expert'];

/**
 * Le jeu attendu — transcription INDÉPENDANTE du 03 §19.1 (voir l'en-tête).
 * Tout couple absent d'ici est REFUSÉ, pour les deux profils.
 */
const ATTENDU: readonly {
  depuis: EtatSession;
  action: ActionSession;
  vers: EtatSession;
  profils: readonly ProfilAuditeur[];
  motifRequis: boolean;
}[] = [
  {
    depuis: 'non_demarre',
    action: 'demarrer',
    vers: 'en_cours',
    profils: PROFILS,
    motifRequis: false,
  },
  { depuis: 'en_cours', action: 'terminer', vers: 'termine', profils: PROFILS, motifRequis: false },
  { depuis: 'termine', action: 'rouvrir', vers: 'en_cours', profils: PROFILS, motifRequis: false },
  { depuis: 'termine', action: 'valider', vers: 'valide', profils: PROFILS, motifRequis: false },
  {
    depuis: 'valide',
    action: 'deverrouiller',
    vers: 'en_cours',
    profils: ['expert'],
    motifRequis: true,
  },
];

function attendu(depuis: EtatSession, action: ActionSession, profil: ProfilAuditeur) {
  return ATTENDU.find(
    (t) => t.depuis === depuis && t.action === action && t.profils.includes(profil),
  );
}

// =============================================================================
// A. Les 40 couples — autorisés ET refusés, chacun avec son verdict
// =============================================================================
describe('peutTransiter — énumération des 4 états × 5 actions × 2 profils (03 §19.1)', () => {
  const couples = ETATS.flatMap((etat) =>
    ACTIONS.flatMap((action) => PROFILS.map((profil) => [etat, action, profil] as const)),
  );

  it('l’énumération couvre bien 40 couples, dont 9 autorisés', () => {
    expect(couples).toHaveLength(40);
    const autorises = couples.filter(([e, a, p]) => attendu(e, a, p) !== undefined);
    expect(autorises).toHaveLength(9);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une table qui accepte `valider` depuis
  // `en_cours` (verrou à chaud), ou `rouvrir` refusé depuis `termine` (la note
  // de couloir perdue), ou `deverrouiller` ouvert au guidé strict (dérogation
  // qu'il n'a pas). Chaque couple est un test : le rouge NOMME le couple.
  it.each(couples)(
    '@critique depuis « %s », action « %s », profil « %s »',
    (etat, action, profil) => {
      const verdict = peutTransiter(etat, action, profil);
      const cible = attendu(etat, action, profil);
      if (cible) {
        expect(verdict).toEqual({
          autorise: true,
          vers: cible.vers,
          motifRequis: cible.motifRequis,
        });
      } else {
        expect(verdict.autorise).toBe(false);
        if (!verdict.autorise) {
          expect(verdict.motif.trim().length).toBeGreaterThan(0);
        }
      }
    },
  );
});

// =============================================================================
// B. TERMINER ≠ VALIDER — la règle V2.10 en trois propriétés
// =============================================================================
describe('terminer ≠ valider (03 §19.1, V2.10)', () => {
  it('@critique terminer ne verrouille pas : une session terminée se rouvre sans motif, quel que soit le profil', () => {
    for (const profil of PROFILS) {
      const verdict = peutTransiter('termine', 'rouvrir', profil);
      expect(verdict).toEqual({ autorise: true, vers: 'en_cours', motifRequis: false });
    }
    expect(estVerrouilleeEnModification('termine')).toBe(false);
  });

  it('@critique valider verrouille : seul l’état `valide` est verrouillé en modification', () => {
    expect(estVerrouilleeEnModification('valide')).toBe(true);
    for (const etat of ETATS.filter((e) => e !== 'valide')) {
      expect(estVerrouilleeEnModification(etat)).toBe(false);
    }
  });

  it('@critique on ne valide jamais à chaud : `valider` est refusé depuis `en_cours` et `non_demarre`', () => {
    for (const profil of PROFILS) {
      expect(peutTransiter('en_cours', 'valider', profil).autorise).toBe(false);
      expect(peutTransiter('non_demarre', 'valider', profil).autorise).toBe(false);
    }
  });

  it('@critique après validation, rouvrir « librement » n’existe plus : seul `deverrouiller` (expert, motif) rouvre', () => {
    for (const profil of PROFILS) {
      expect(peutTransiter('valide', 'rouvrir', profil).autorise).toBe(false);
    }
    expect(peutTransiter('valide', 'deverrouiller', 'guide_strict').autorise).toBe(false);
    expect(peutTransiter('valide', 'deverrouiller', 'expert')).toEqual({
      autorise: true,
      vers: 'en_cours',
      motifRequis: true,
    });
  });

  it('le motif de refus est une phrase française (jamais un code SNAKE_CASE nu)', () => {
    const verdict = peutTransiter('valide', 'deverrouiller', 'guide_strict');
    expect(verdict.autorise).toBe(false);
    if (!verdict.autorise) {
      expect(verdict.motif).toMatch(/[a-zéèêàç]/);
      expect(verdict.motif).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

// =============================================================================
// C. La table elle-même — propriétés structurelles
// =============================================================================
describe('TRANSITIONS_SESSION — propriétés de la table', () => {
  it('chaque transition part et arrive sur un des 4 états, avec au moins un profil', () => {
    for (const t of TRANSITIONS_SESSION) {
      expect(ETATS).toContain(t.depuis);
      expect(ETATS).toContain(t.vers);
      expect(t.profils.length).toBeGreaterThan(0);
      expect(t.depuis).not.toBe(t.vers);
    }
  });

  it('@critique le guidé strict n’a AUCUNE transition à motif (« aucune dérogation », 03 §19.1)', () => {
    const derogations = TRANSITIONS_SESSION.filter(
      (t) => t.motifRequis && t.profils.includes('guide_strict'),
    );
    expect(derogations).toEqual([]);
  });

  it('la table et `peutTransiter` disent la même chose (aucun `if` caché hors table)', () => {
    for (const t of TRANSITIONS_SESSION) {
      for (const profil of t.profils) {
        expect(peutTransiter(t.depuis, t.action, profil)).toEqual({
          autorise: true,
          vers: t.vers,
          motifRequis: t.motifRequis,
        });
      }
    }
  });

  it('il n’existe pas deux transitions pour le même (état, action) menant à des états différents', () => {
    const vus = new Map<string, EtatSession>();
    for (const t of TRANSITIONS_SESSION) {
      const cle = `${t.depuis}→${t.action}`;
      const deja = vus.get(cle);
      if (deja !== undefined) expect(deja).toBe(t.vers);
      vus.set(cle, t.vers);
    }
  });
});

// =============================================================================
// D. Projection vers le 04 — `valide` n'existe pas en base
// =============================================================================
describe('etatSession / versStatutPersiste — `valide` = `termine` + `valideeLe` (04)', () => {
  it('un statut persisté `termine` avec `valideeLe` non nul est `valide`', () => {
    expect(etatSession({ status: 'termine', valideeLe: '2026-09-02T18:00:00.000Z' })).toBe(
      'valide',
    );
  });

  it('un statut persisté `termine` sans `valideeLe` reste `termine`', () => {
    expect(etatSession({ status: 'termine', valideeLe: null })).toBe('termine');
  });

  it('`non_demarre` et `en_cours` ne deviennent jamais `valide`, même avec un `valideeLe` résiduel', () => {
    expect(etatSession({ status: 'non_demarre', valideeLe: null })).toBe('non_demarre');
    expect(etatSession({ status: 'en_cours', valideeLe: null })).toBe('en_cours');
    expect(etatSession({ status: 'en_cours', valideeLe: '2026-09-02T18:00:00.000Z' })).toBe(
      'en_cours',
    );
  });

  it('versStatutPersiste projette `valide` sur `termine` et laisse les trois autres intacts', () => {
    expect(versStatutPersiste('valide')).toBe('termine');
    expect(versStatutPersiste('termine')).toBe('termine');
    expect(versStatutPersiste('en_cours')).toBe('en_cours');
    expect(versStatutPersiste('non_demarre')).toBe('non_demarre');
  });

  it('aller-retour : etatSession(versStatutPersiste(e), valideeLe cohérent) = e', () => {
    for (const etat of ETATS) {
      const valideeLe = etat === 'valide' ? '2026-09-02T18:00:00.000Z' : null;
      expect(etatSession({ status: versStatutPersiste(etat), valideeLe })).toBe(etat);
    }
  });
});

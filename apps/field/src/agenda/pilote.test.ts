// =============================================================================
// PILOTE DE MISSION ET PARCOURS EXPRESS R1 — lot L5, incrément L5c. Écrit par A23.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. Les HUIT codes d'étape sont ceux du 03 §32.2, dans l'ordre — lus DANS LE
//      PACK, pas recopiés dans le test. C'est la garde qui rend acceptable la
//      duplication avec `apps/api/src/db/schema.ts` : les deux copies répondent
//      à la même source, et celle-ci est vérifiée à chaque exécution.
//   B. Les DEUX SEUILS de R1 (1 unité, > 3 entretiens) sont ceux du 03 §29, lus
//      dans le pack eux aussi. Une borne recopiée à l'envers (`>= 3` au lieu de
//      `> 3`) est exactement le genre d'erreur qu'aucune relecture n'attrape.
//   C. Le « 3 étapes visibles » du pack est une VÉRIFICATION du calcul, pas un
//      nombre posé à la main : si la lecture du repli `analyse`+`rapport` est
//      fausse, ce test tombe.
//   D. Une étape validée par un HUMAIN n'est jamais effacée par l'automatisme
//      (invariant 7).
//   E. L'express ne valide JAMAIS l'absence de travail : une mission éligible
//      mais vide n'auto-valide rien.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E23 (novice
// < 30 min), E6 (hors ligne total).
// =============================================================================
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CODES_ETAPE,
  construirePilote,
  ENTRETIENS_MAX_EXPRESS,
  estParcoursExpress,
  ETAPES_PILOTE,
  ETAPES_VISIBLES_EXPRESS,
  motifGuideIntegral,
  NIVEAU_AUDIT_EXPRESS,
  UNITES_MAX_EXPRESS,
  type MesureMission,
} from './pilote.js';

const PACK = readFileSync('docs/03_MODULES_FONCTIONNELS.md', 'utf8');

/** Une mission éligible à R1 : mono-unité, diagnostic de cadrage, un entretien. */
const EXPRESS: MesureMission = {
  auditLevel: 'diagnostic_cadrage',
  unites: 1,
  entretiens: 1,
  questions: 40,
};

// ─────────────────────────────────────────────────────────────────────────────
// A. LES CODES D'ÉTAPE VIENNENT DU PACK
// ─────────────────────────────────────────────────────────────────────────────
describe('les codes d’étape sont ceux du 03 §32.2 — la recopie est gardée', () => {
  it('@critique les huit codes figurent dans la phrase du §32.2, dans cet ordre', () => {
    // `Codes d.étape` et non l'apostrophe recopiée : le pack mélange les deux
    // formes d'apostrophe, et chercher la mauvaise ferait échouer ce test pour
    // une raison typographique — c'est-à-dire pour rien.
    const ligne = PACK.split('\n').find((l) => /\*\*Codes d.étape\*\*/.test(l));
    expect(ligne, 'la phrase des codes d’étape du §32.2 est introuvable').toBeDefined();

    let curseur = -1;
    for (const code of CODES_ETAPE) {
      const position = (ligne ?? '').indexOf(`\`${code}\``, curseur + 1);
      expect(position, `le code « ${code} » n’apparaît pas après le précédent`).toBeGreaterThan(
        curseur,
      );
      curseur = position;
    }
    expect(CODES_ETAPE).toHaveLength(8);
  });

  it('@critique les six étapes du pilote sont un sous-ensemble des huit codes', () => {
    for (const etape of ETAPES_PILOTE) {
      expect(CODES_ETAPE).toContain(etape);
    }
    // `entretien` et `unite` ont une AUTRE portée (§32.2) : ils ne sont pas des
    // étapes du pilote de mission, et les y mettre ferait afficher deux jalons
    // qui n'appartiennent pas à la timeline.
    expect(ETAPES_PILOTE).not.toContain('entretien');
    expect(ETAPES_PILOTE).not.toContain('unite');
    expect(ETAPES_PILOTE).toHaveLength(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LES SEUILS DE R1 VIENNENT DU PACK
// ─────────────────────────────────────────────────────────────────────────────
describe('R1 — les seuils sont ceux du 03 §29, pas des réglages', () => {
  const ligneR1 = PACK.split('\n').find((l) => l.includes('R1 — Parcours EXPRESS micro'));

  it('@critique la ligne R1 nomme mono-unité, diagnostic_cadrage, 3 étapes et > 3 entretiens', () => {
    expect(ligneR1).toBeDefined();
    expect(ligneR1).toContain('diagnostic_cadrage');
    expect(ligneR1).toContain('mono-unité');
    expect(ligneR1).toContain('3 étapes visibles');
    expect(ligneR1).toContain('> 1 unité ou > 3 entretiens');
    expect(NIVEAU_AUDIT_EXPRESS).toBe('diagnostic_cadrage');
    expect(UNITES_MAX_EXPRESS).toBe(1);
    expect(ENTRETIENS_MAX_EXPRESS).toBe(3);
    expect(ETAPES_VISIBLES_EXPRESS).toBe(3);
  });

  it('@critique la borne des entretiens est « au-delà de 3 » : 3 reste express, 4 ne l’est plus', () => {
    expect(estParcoursExpress({ ...EXPRESS, entretiens: 3 })).toBe(true);
    expect(estParcoursExpress({ ...EXPRESS, entretiens: 4 })).toBe(false);
  });

  it('@critique la borne des unités est « au-delà de 1 » : 1 reste express, 2 ne l’est plus', () => {
    expect(estParcoursExpress({ ...EXPRESS, unites: 1 })).toBe(true);
    expect(estParcoursExpress({ ...EXPRESS, unites: 2 })).toBe(false);
  });

  it('@critique un autre niveau d’audit n’est JAMAIS express, même mono-unité', () => {
    expect(estParcoursExpress({ ...EXPRESS, auditLevel: 'audit_complet' })).toBe(false);
  });

  it('chaque sortie de l’express dit POURQUOI, en français', () => {
    expect(motifGuideIntegral(EXPRESS)).toBeNull();
    expect(motifGuideIntegral({ ...EXPRESS, unites: 4 })).toMatch(/4 unités/);
    expect(motifGuideIntegral({ ...EXPRESS, entretiens: 9 })).toMatch(/9 sessions/);
    expect(motifGuideIntegral({ ...EXPRESS, auditLevel: 'audit_complet' })).toMatch(
      /diagnostic de cadrage/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LE PILOTE CONDENSÉ
// ─────────────────────────────────────────────────────────────────────────────
describe('pilote condensé — le « 3 » du pack VÉRIFIE le calcul, il ne le remplace pas', () => {
  it('@critique une mission express affiche exactement 3 étapes', () => {
    const pilote = construirePilote(EXPRESS);
    expect(pilote.express).toBe(true);
    expect(pilote.etapesVisibles).toHaveLength(ETAPES_VISIBLES_EXPRESS);
  });

  it('@critique les trois étapes visibles sont Collecte, Analyse et Livraison', () => {
    // Ce test FIXE la lecture faite dans `pilote.ts` (repli de `rapport` sur
    // `analyse`, 03 §32.2 « en_analyse ⇔ Analyse + Rapport »). Il est le point
    // exact que l'entrée DECISIONS.md soumet à Williams : s'il tranche
    // autrement, c'est ce test qui doit changer, et il se voit.
    expect(construirePilote(EXPRESS).etapesVisibles.map((e) => e.code)).toEqual([
      'collecte',
      'analyse',
      'livraison',
    ]);
  });

  it('@critique une mission NON express affiche les six étapes', () => {
    const pilote = construirePilote({ ...EXPRESS, unites: 5 });
    expect(pilote.express).toBe(false);
    expect(pilote.etapesVisibles).toHaveLength(6);
    expect(pilote.motifGuideIntegral).not.toBeNull();
  });

  it('@critique en express, cadrage et préparation sont validées AUTOMATIQUEMENT', () => {
    const etapes = construirePilote(EXPRESS).etapes;
    const cadrage = etapes.find((e) => e.code === 'cadrage');
    const preparation = etapes.find((e) => e.code === 'preparation');

    expect(cadrage?.validee).toBe(true);
    expect(cadrage?.origine).toBe('automatique_express');
    expect(preparation?.validee).toBe(true);
    expect(preparation?.origine).toBe('automatique_express');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D et E. CE QUE L'AUTOMATISME NE FAIT PAS
// ─────────────────────────────────────────────────────────────────────────────
describe('l’automatisme ne valide jamais l’absence de travail, ni n’efface un humain', () => {
  it('@critique une mission express SANS unité n’auto-valide pas le cadrage', () => {
    const etapes = construirePilote({ ...EXPRESS, unites: 0 }).etapes;
    const cadrage = etapes.find((e) => e.code === 'cadrage');
    expect(cadrage?.validee).toBe(false);
    expect(cadrage?.manques.join(' ')).toMatch(/arbre organisationnel/i);
  });

  it('@critique une mission express SANS questionnaire n’auto-valide pas la préparation', () => {
    const etapes = construirePilote({ ...EXPRESS, questions: 0 }).etapes;
    const preparation = etapes.find((e) => e.code === 'preparation');
    expect(preparation?.validee).toBe(false);
    expect(preparation?.manques.join(' ')).toMatch(/questionnaire/i);
  });

  it('@critique une validation HUMAINE survit à la sortie du parcours express (invariant 7)', () => {
    // La mission cesse d'être éligible (5 unités) : l'automatisme ne s'applique
    // plus. La validation posée par un humain, elle, ne bouge pas.
    const pilote = construirePilote({ ...EXPRESS, unites: 5 }, ['cadrage']);
    const cadrage = pilote.etapes.find((e) => e.code === 'cadrage');
    expect(cadrage?.validee).toBe(true);
    expect(cadrage?.origine).toBe('humaine');
  });

  it('@critique l’origine HUMAINE prévaut sur l’automatisme quand les deux s’appliquent', () => {
    const pilote = construirePilote(EXPRESS, ['cadrage']);
    expect(pilote.etapes.find((e) => e.code === 'cadrage')?.origine).toBe('humaine');
  });

  it('une étape non validée dit toujours ce qui manque — jamais un cadenas muet (03 §19.1)', () => {
    for (const etape of construirePilote({ ...EXPRESS, unites: 5 }).etapes) {
      if (!etape.validee) expect(etape.manques.length).toBeGreaterThan(0);
    }
  });
});

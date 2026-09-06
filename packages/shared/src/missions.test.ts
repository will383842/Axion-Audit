// =============================================================================
// TESTS DE LA MACHINE À ÉTATS DE MISSION — lot L3, incrément L3b.
//
// Écrits par A16 AVANT l'implémentation (09 §3-2), et par quelqu'un qui n'a écrit
// aucune des lignes testées (09 §5.6). À l'heure où ce fichier est livré,
// `missions.ts` ne porte QUE son contrat : `TRANSITIONS_MISSION` est vide et les
// deux fonctions lèvent `NON_IMPLEMENTE`. **Ces tests sont donc ROUGES, et c'est
// l'état attendu** — ils décrivent ce que l'implémentation devra rendre vrai.
//
// ── CE QUE CE FICHIER PROUVE, ET POURQUOI IL LE PROUVE AINSI ─────────────────
// `docs/conception/LOT_L3.md` §3b, verbatim : « La couverture se prouve par
// ÉNUMÉRATION DES 20 COUPLES (5×5 hors identités), pas par une liste de cas. »
// La nuance est décisive. Une suite qui vérifierait que les 7 transitions légales
// passent serait VERTE PAR VACUITÉ : elle resterait verte si l'implémentation
// autorisait aussi les dix-huit autres. C'est l'exhaustivité du REFUS qui porte le
// critère n° 4 du fichier 07 (« toute transition de statut interdite est rejetée
// avec motif »), pas l'exhaustivité de l'acceptation.
//
// Le jeu attendu des 7 couples est donc recopié EN DUR ci-dessous, comme une
// transcription du 03 §32.2 — pas dérivé de `TRANSITIONS_MISSION`. Un test qui
// lirait la table pour se donner ses attentes ne testerait plus rien : il
// vérifierait que la table est égale à elle-même, et suivrait docilement la
// première erreur de transcription. La table du code et la table du test sont deux
// lectures INDÉPENDANTES du même paragraphe ; leur confrontation est le test.
//
// ── LE PIÈGE QUE CE FICHIER EXISTE POUR FERMER ──────────────────────────────
// 03 §17.2 (V2.9) : « une condition dont la fonctionnalité porteuse n'est pas
// livrée est RÉPUTÉE SATISFAITE, jamais un verrou sur une feature absente. » Une
// clé ABSENTE d'`evaluees` vaut donc SATISFAITE ; seul un `false` EXPLICITE bloque.
// C'est l'inverse exact du réflexe défensif, et c'est précisément pour ça qu'un
// refactor bien intentionné la cassera un jour sans s'en apercevoir : traiter
// l'absence comme un échec ne fait planter aucun test « heureux », ça rend
// simplement `preparation → en_cours` définitivement infranchissable en Phase 1.
// §C ci-dessous est le seul garde-fou contre ce jour-là.
//
// Traçabilité : E43 (conventions d'API), critère n° 3-4 du lot L3 (fichier 07).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  CODES_CONDITION_MISSION,
  STATUTS_MISSION,
  TRANSITIONS_MISSION,
  evaluerTransitionMission,
  transitionMission,
  type CodeConditionMission,
  type DemandeTransitionMission,
  type MotifRefusTransition,
  type ResultatTransitionMission,
  type RoleMission,
  type StatutMission,
} from './missions.js';

// =============================================================================
// LA TRANSCRIPTION DU 03 §32.2 — lecture indépendante, recopiée à la main
// =============================================================================

/**
 * Une ligne attendue. `roles` n'y figure PAS, et c'est délibéré : voir §A5 pour
 * ce que le §32.2 dit des rôles (les retours) et ce qu'il ne dit pas (les avants).
 */
interface LigneAttendue {
  readonly depuis: StatutMission;
  readonly vers: StatutMission;
  readonly sens: 'avant' | 'retour';
  readonly conditions: readonly CodeConditionMission[];
  readonly motifRequis: boolean;
  readonly surchargeAdminMotivee: boolean;
}

/**
 * Les SEPT lignes du 03 §32.2, transcrites phrase par phrase.
 *
 * « Transitions autorisées (toute autre = rejetée avec motif) : `preparation →
 * en_cours` (conditions : étapes cadrage ET preparation validées dans
 * `step_validations`, questionnaire figé, plan d'entretiens existant) · `en_cours →
 * en_analyse` (étape collecte validée, ou override admin motivé) · `en_analyse →
 * livree` (export réalisé + validation humaine de livraison) · `livree → cloturee`
 * (rétrospective faite). Retours arrière (admin uniquement, motif obligatoire,
 * tracés `activity_log`) : `en_cours → preparation` · `en_analyse → en_cours` ·
 * `livree → en_analyse`. `cloturee` est TERMINAL. »
 *
 * `surchargeAdminMotivee` vient d'une SECONDE section : 03 §17.3, « passer "en
 * analyse" ou "livrée" affiche les manques ; l'admin peut forcer, avec motif
 * journalisé ». Deux transitions, et deux seulement — `preparation → en_cours` et
 * `livree → cloturee` n'y sont pas nommées, donc ne se forcent pas. Forcer n'est
 * pas un pouvoir général de l'administrateur : c'est une dérogation nommée, sur
 * deux passages nommés.
 */
const TRANSCRIPTION_32_2: readonly LigneAttendue[] = [
  {
    depuis: 'preparation',
    vers: 'en_cours',
    sens: 'avant',
    conditions: [
      'etape_cadrage_validee',
      'etape_preparation_validee',
      'questionnaire_fige',
      'plan_entretiens_etabli',
    ],
    motifRequis: false,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_cours',
    vers: 'en_analyse',
    sens: 'avant',
    conditions: ['etape_collecte_validee'],
    motifRequis: false,
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'en_analyse',
    vers: 'livree',
    sens: 'avant',
    conditions: ['export_realise', 'etape_livraison_validee'],
    motifRequis: false,
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'livree',
    vers: 'cloturee',
    sens: 'avant',
    conditions: ['retrospective_faite'],
    motifRequis: false,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_cours',
    vers: 'preparation',
    sens: 'retour',
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_analyse',
    vers: 'en_cours',
    sens: 'retour',
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'livree',
    vers: 'en_analyse',
    sens: 'retour',
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
];

/** Les trois retours arrière, isolés — §E les parcourt tous les trois. */
const RETOURS_ATTENDUS = TRANSCRIPTION_32_2.filter((ligne) => ligne.sens === 'retour');

/** Un motif de retour arrière plausible et NEUTRE (invariant 2 : zéro référence client). */
const MOTIF_VALIDE = 'Réouverture de la collecte : deux unités restent sans entretien.';

// =============================================================================
// OUTILLAGE — aucune magie, juste de quoi lire les cas sans bruit
// =============================================================================

interface OptionsDemande {
  readonly motif?: string;
  readonly surcharge?: boolean;
  readonly evaluees?: Readonly<Partial<Record<CodeConditionMission, boolean>>>;
}

/**
 * Construit une demande. `motif` et `surcharge` ne sont posés que s'ils sont
 * fournis : sous `exactOptionalPropertyTypes` (11 §1), écrire `motif: undefined`
 * n'est PAS la même chose qu'omettre la clé, et le contrat dit « `undefined` =
 * aucun motif ». On omet, pour que le cas testé soit le cas réel.
 */
function demande(
  depuis: StatutMission,
  vers: StatutMission,
  role: RoleMission,
  options: OptionsDemande = {},
): DemandeTransitionMission {
  return {
    depuis,
    vers,
    role,
    ...(options.motif === undefined ? {} : { motif: options.motif }),
    ...(options.surcharge === undefined ? {} : { surcharge: options.surcharge }),
    conditions: { evaluees: options.evaluees ?? {} },
  };
}

type RefusTransition = Extract<ResultatTransitionMission, { ok: false }>;
type SuccesTransition = Extract<ResultatTransitionMission, { ok: true }>;

/** Rétrécit un résultat à un refus, en disant ce que l'échec SIGNIFIE. */
function refusDe(resultat: ResultatTransitionMission): RefusTransition {
  if (resultat.ok) {
    throw new Error(
      'Une transition qui devait être refusée a été AUTORISÉE : la garde de statut laisse ' +
        'passer un changement d’état illégal, et le critère n° 3 du lot L3 tombe.',
    );
  }
  return resultat;
}

/** Rétrécit un résultat à un succès, en nommant le refus qui n'aurait pas dû venir. */
function succesDe(resultat: ResultatTransitionMission): SuccesTransition {
  if (!resultat.ok) {
    throw new Error(
      `Une transition légale a été REFUSÉE (« ${resultat.motifRefus} ») : le produit se ` +
        'verrouille sur sa propre garde, et la mission ne peut plus avancer.',
    );
  }
  return resultat;
}

/**
 * Compare deux listes de codes SANS contraindre leur ordre.
 *
 * Le 03 §32.2 énumère les conditions ; il n'en ordonne aucune. Exiger un ordre
 * ferait rougir l'implémentation pour une raison qui n'est écrite nulle part —
 * c'est-à-dire ferait de ce test une spécification clandestine.
 */
function codesTries(codes: readonly CodeConditionMission[]): readonly string[] {
  return [...codes].sort((a, b) => a.localeCompare(b));
}

// =============================================================================
// §A. LA TABLE EST UNE DONNÉE — donc elle se prouve SUR la donnée
// =============================================================================

describe('A. La table des transitions, comme donnée', () => {
  it('A1. porte exactement sept lignes — quatre « avant » et trois retours arrière', () => {
    expect(
      TRANSITIONS_MISSION.length,
      'La table ne compte pas sept lignes : soit une transition du §32.2 manque (et le ' +
        'cycle de vie est incomplet), soit une transition inventée s’y est glissée.',
    ).toBe(TRANSCRIPTION_32_2.length);
  });

  it('A2. ne nomme que des statuts existants en « depuis » et en « vers »', () => {
    for (const ligne of TRANSITIONS_MISSION) {
      expect(
        STATUTS_MISSION,
        `Le statut de départ « ${ligne.depuis} » n’est pas une valeur de missions.status : ` +
          'la table décrit un état que la base refuserait d’écrire.',
      ).toContain(ligne.depuis);
      expect(
        STATUTS_MISSION,
        `Le statut d’arrivée « ${ligne.vers} » n’est pas une valeur de missions.status : la ` +
          'transition mènerait la mission dans un état que le CHECK du fichier 04 rejette.',
      ).toContain(ligne.vers);
    }
  });

  it('A3. ne référence que des codes de condition du catalogue', () => {
    for (const ligne of TRANSITIONS_MISSION) {
      for (const code of ligne.conditions) {
        expect(
          CODES_CONDITION_MISSION,
          `La condition « ${code} » n’appartient pas à CODES_CONDITION_MISSION : personne ne ` +
            'l’évaluera jamais, et elle serait donc réputée satisfaite pour toujours.',
        ).toContain(code);
      }
    }
  });

  it('A4. n’a aucun couple (depuis, vers) en double', () => {
    const couples = TRANSITIONS_MISSION.map((ligne) => `${ligne.depuis}→${ligne.vers}`);
    expect(
      new Set(couples).size,
      'Deux lignes décrivent le même couple : la résolution dépendrait alors de l’ordre du ' +
        'tableau, et deux lecteurs de la table (la console et l’API) pourraient en retenir ' +
        'des règles différentes.',
    ).toBe(couples.length);
  });

  it('A5. réserve TOUS les retours arrière à l’administrateur, et à lui seul', () => {
    // 03 §32.2 : « Retours arrière (admin uniquement, motif obligatoire) ». « Uniquement »
    // se teste par une ÉGALITÉ, pas par une inclusion : `['admin', 'consultant']` contient
    // bien 'admin' et violerait pourtant la phrase.
    const retours = TRANSITIONS_MISSION.filter((l) => l.sens === 'retour');
    // Le décompte D'ABORD : une boucle sur une liste vide est verte sans rien prouver,
    // et c'est exactement ce qui arriverait si les trois retours étaient marqués « avant ».
    expect(
      retours.length,
      'Le nombre de retours arrière n’est pas trois : soit une réouverture du §32.2 manque, soit ' +
        'un retour a été marqué « avant » — et il échapperait alors à toutes les gardes ci-dessous.',
    ).toBe(3);
    for (const ligne of retours) {
      expect(
        [...ligne.roles],
        `Le retour ${ligne.depuis}→${ligne.vers} est ouvert à d’autres rôles que l’admin : le ` +
          '« admin uniquement » du §32.2 n’est plus tenu, et n’importe qui peut défaire une étape.',
      ).toEqual(['admin']);
    }
  });

  it('A6. exige un motif sur TOUS les retours arrière', () => {
    const retours = TRANSITIONS_MISSION.filter((l) => l.sens === 'retour');
    expect(retours.length, 'Aucun retour arrière à contrôler — voir A5.').toBe(3);
    for (const ligne of retours) {
      expect(
        ligne.motifRequis,
        `Le retour ${ligne.depuis}→${ligne.vers} accepte une demande sans motif : la trace ` +
          '`activity_log` exigée par le §32.2 ne dirait plus POURQUOI on est revenu en arrière, ' +
          'et l’invariant 7 (« toute correction est tracée ») tombe.',
      ).toBe(true);
    }
  });

  it('A7. n’expose JAMAIS « cloturee » en statut de départ — c’est ainsi que « terminal » s’écrit', () => {
    // Une propriété de la donnée se prouve SUR la donnée. Les quatre refus qui en
    // découlent (§B) sont une conséquence ; ils ne sont pas la preuve. Le jour où
    // quelqu'un ajoutera une ligne `cloturee → …`, c'est CE test qui doit le dire,
    // pas quatre tests de comportement qui basculeront ensemble sans expliquer pourquoi.
    const departs = TRANSITIONS_MISSION.map((ligne) => ligne.depuis);
    expect(
      departs,
      'Une transition part de « cloturee » : une mission clôturée peut être rouverte, alors que ' +
        'le §32.2 dit « jamais rouvert — la suite est un ré-audit, nouvelle mission §6.4 ».',
    ).not.toContain('cloturee');
  });

  it('A8. n’ouvre la surcharge admin que sur « en analyse » et « livrée » (03 §17.3)', () => {
    const surchargeables = TRANSITIONS_MISSION.filter((l) => l.surchargeAdminMotivee).map(
      (l) => `${l.depuis}→${l.vers}`,
    );
    expect(
      [...surchargeables].sort((a, b) => a.localeCompare(b)),
      'Le pouvoir de forcer déborde des deux passages que le §17.3 nomme (« passer en analyse ou ' +
        'livrée ») : forcer deviendrait un pouvoir général de l’admin, et les gardes du §32.2 ' +
        'ne seraient plus que des suggestions.',
    ).toEqual(['en_analyse→livree', 'en_cours→en_analyse']);
  });

  it('A9. utilise chaque code de condition au moins une fois — aucun code orphelin', () => {
    // CLAUDE.md §4 étape 6 : « tout code livré se rattache à E1-E47 — le code orphelin est
    // REFUSÉ ». Un code de condition que personne ne consomme est pire qu’inutile : il
    // laisse croire qu’une garde existe là où rien ne la lit.
    const utilises = new Set(TRANSITIONS_MISSION.flatMap((ligne) => [...ligne.conditions]));
    for (const code of CODES_CONDITION_MISSION) {
      expect(
        utilises.has(code),
        `Le code « ${code} » n’est utilisé par aucune transition : c’est une garde morte, qui ` +
          'donne l’illusion d’un contrôle inexistant.',
      ).toBe(true);
    }
  });
});

// =============================================================================
// §B. ÉNUMÉRATION DES 5×5 COUPLES — 20 hors identités, plus les 5 identités
// =============================================================================

describe('B. Énumération exhaustive des couples (5 statuts × 5 statuts)', () => {
  /**
   * Une demande MAXIMALEMENT favorable : rôle admin, motif fourni, aucune condition
   * explicitement fausse. Si un couple est refusé MALGRÉ cela, c'est bien son
   * inexistence qui le refuse — et non un rôle, un motif ou une condition.
   */
  const demandeIrreprochable = (depuis: StatutMission, vers: StatutMission) =>
    demande(depuis, vers, 'admin', { motif: MOTIF_VALIDE });

  for (const depuis of STATUTS_MISSION) {
    for (const vers of STATUTS_MISSION) {
      const attendue = TRANSCRIPTION_32_2.find((l) => l.depuis === depuis && l.vers === vers);

      if (depuis === vers) {
        // ── LES IDENTITÉS ────────────────────────────────────────────────────
        // Le §32.2 ne les nomme pas — ni pour les autoriser, ni pour les interdire.
        // Elles tombent donc sous « toute autre = rejetée avec motif », qui est une
        // phrase de fermeture et couvre littéralement tout ce qui n'est pas listé.
        // C'est aussi la seule lecture qui ait un sens produit : `preparation →
        // preparation` n'est pas un changement d'état, c'est un clic sans effet.
        // L'autoriser écrirait une ligne `activity_log` pour un non-événement, et
        // l'invariant 7 perdrait en lisibilité ce qu'il gagnerait en volume.
        // Elles ne font PAS partie des « 20 couples » de LOT_L3.md §3b, qui dit
        // explicitement « 5×5 HORS identités » : elles sont ici en surplus, et
        // portent le total énuméré à 25.
        it(`B. identité ${depuis} → ${vers} : refusée « transition_inexistante »`, () => {
          expect(
            transitionMission(depuis, vers),
            `Une ligne décrit l’identité ${depuis}→${vers} : le produit accepterait un ` +
              'changement de statut qui ne change rien, et le journal d’activité se remplirait ' +
              'de non-événements.',
          ).toBeUndefined();

          const refus = refusDe(evaluerTransitionMission(demandeIrreprochable(depuis, vers)));
          expect(
            refus.motifRefus,
            `Passer de ${depuis} à ${depuis} devrait être refusé comme inexistant.`,
          ).toBe<MotifRefusTransition>('transition_inexistante');
        });
        continue;
      }

      if (attendue !== undefined) {
        // ── LES 7 COUPLES LÉGAUX ─────────────────────────────────────────────
        it(`B. ${depuis} → ${vers} : LÉGALE, et sa ligne est conforme au §32.2`, () => {
          const ligne = transitionMission(depuis, vers);
          expect(
            ligne,
            `La transition ${depuis}→${vers} est absente de la table alors que le §32.2 ` +
              'l’autorise : le cycle de vie de la mission est cassé à cet endroit.',
          ).toBeDefined();
          if (ligne === undefined) return;

          expect(ligne.depuis, 'La ligne rendue ne part pas du statut demandé.').toBe(depuis);
          expect(ligne.vers, 'La ligne rendue ne mène pas au statut demandé.').toBe(vers);
          expect(
            ligne.sens,
            `Le sens de ${depuis}→${vers} est mal transcrit : un retour arrière pris pour une ` +
              'progression perdrait la garde « admin uniquement, motif obligatoire ».',
          ).toBe(attendue.sens);
          expect(
            codesTries(ligne.conditions),
            `Les conditions de ${depuis}→${vers} ne sont pas celles du §32.2 : une garde de ` +
              'trop bloque une mission légitime, une garde de moins laisse passer une mission ' +
              'incomplète.',
          ).toEqual(codesTries(attendue.conditions));
          expect(
            ligne.motifRequis,
            `L’obligation de motif de ${depuis}→${vers} est mal transcrite.`,
          ).toBe(attendue.motifRequis);
          expect(
            ligne.surchargeAdminMotivee,
            `Le droit de forcer ${depuis}→${vers} est mal transcrit : le §17.3 ne le donne que ` +
              'pour « passer en analyse ou livrée ».',
          ).toBe(attendue.surchargeAdminMotivee);
          expect(
            ligne.roles.length,
            `Aucun rôle ne peut demander ${depuis}→${vers} : la transition existe mais est ` +
              'inatteignable, ce qui est un verrou muet.',
          ).toBeGreaterThan(0);
        });
        continue;
      }

      // ── LES 13 COUPLES ILLÉGAUX HORS IDENTITÉ ──────────────────────────────
      // C'est ICI que la couverture se joue. Un test qui n'énumérerait que les 7
      // couples légaux resterait vert si l'implémentation autorisait tout.
      it(`B. ${depuis} → ${vers} : ILLÉGALE, refusée « transition_inexistante »`, () => {
        expect(
          transitionMission(depuis, vers),
          `La table décrit ${depuis}→${vers}, que le §32.2 n’autorise pas : « toute autre = ` +
            'rejetée » n’est plus respecté.',
        ).toBeUndefined();

        const refus = refusDe(evaluerTransitionMission(demandeIrreprochable(depuis, vers)));
        expect(
          refus.motifRefus,
          `Un administrateur muni d’un motif peut faire passer une mission de ${depuis} à ` +
            `${vers} : le cycle de vie n’est plus une machine à états mais une suggestion.`,
        ).toBe<MotifRefusTransition>('transition_inexistante');
        expect(
          refus.conditionsNonRemplies,
          'Un refus « transition_inexistante » énumère des conditions : on apprendrait au ' +
            'demandeur des conditions qui ne le concernent pas, pour une transition qui n’existe pas.',
        ).toEqual([]);
      });
    }
  }
});

// =============================================================================
// §C. LA CONDITION ABSENTE — le point le plus contre-intuitif du lot
// =============================================================================

describe('C. Une condition absente est RÉPUTÉE SATISFAITE (03 §17.2, V2.9)', () => {
  it('C1. autorise preparation → en_cours avec un état de conditions VIDE', () => {
    // Le cas réel de la Phase 1, pas un cas d'école : `plan_entretiens_etabli` n'a
    // aucune table où se poser et `export_realise` appartient à L7-min. Si l'absence
    // valait « faux », cette transition serait infranchissable pour toujours et le
    // produit se verrouillerait sur une fonctionnalité qu'il n'a pas encore.
    const resultat = succesDe(
      evaluerTransitionMission(demande('preparation', 'en_cours', 'admin')),
    );
    expect(
      resultat.transition.vers,
      'La transition autorisée ne mène pas au statut demandé.',
    ).toBe<StatutMission>('en_cours');
  });

  it('C2. autorise aussi les trois autres transitions « avant » sur un état vide', () => {
    for (const ligne of TRANSCRIPTION_32_2.filter((l) => l.sens === 'avant')) {
      const resultat = evaluerTransitionMission(demande(ligne.depuis, ligne.vers, 'admin'));
      expect(
        resultat.ok,
        `${ligne.depuis}→${ligne.vers} est refusée alors qu’AUCUNE condition n’a été mesurée : ` +
          'une fonctionnalité non livrée est devenue un verrou, ce que le §17.2 interdit.',
      ).toBe(true);
    }
  });

  it('C3. refuse sur une condition explicitement fausse, et la nomme EXACTEMENT', () => {
    const refus = refusDe(
      evaluerTransitionMission(
        demande('preparation', 'en_cours', 'admin', { evaluees: { questionnaire_fige: false } }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un « false » explicite ne bloque pas : la distinction entre « non mesuré » et « mesuré ' +
        'et manquant » a disparu, et les gardes du §32.2 ne servent plus à rien.',
    ).toBe<MotifRefusTransition>('conditions_non_remplies');
    expect(
      refus.conditionsNonRemplies,
      'Le refus ne nomme pas la condition fautive : l’utilisateur lit « transition impossible » ' +
        'sans savoir quoi corriger, et le message du §17.3 (« affiche les manques ») est vide.',
    ).toEqual<CodeConditionMission[]>(['questionnaire_fige']);
  });

  it('C4. énumère TOUTES les conditions fausses, pas seulement la première', () => {
    // LOT_L3.md §3b : « dans `details[]`, CHAQUE condition non remplie ». S'arrêter à
    // la première impose à l'utilisateur autant d'allers-retours qu'il y a de manques.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('preparation', 'en_cours', 'admin', {
          evaluees: { etape_cadrage_validee: false, plan_entretiens_etabli: false },
        }),
      ),
    );
    expect(refus.motifRefus).toBe<MotifRefusTransition>('conditions_non_remplies');
    expect(
      codesTries(refus.conditionsNonRemplies),
      'Le refus s’arrête à la première condition fausse : l’utilisateur corrigera un manque, ' +
        'réessaiera, découvrira le suivant, et ainsi de suite.',
    ).toEqual(codesTries(['etape_cadrage_validee', 'plan_entretiens_etabli']));
  });

  it('C5. ne bloque pas sur une condition fausse ÉTRANGÈRE à la transition demandée', () => {
    // `retrospective_faite` garde `livree → cloturee`, pas `preparation → en_cours`.
    // Un moteur qui lirait tout `evaluees` au lieu des seules conditions de sa ligne
    // rendrait chaque transition dépendante de l'état de toutes les autres.
    const resultat = evaluerTransitionMission(
      demande('preparation', 'en_cours', 'admin', {
        evaluees: { retrospective_faite: false, export_realise: false },
      }),
    );
    expect(
      resultat.ok,
      'Une condition qui ne garde pas cette transition l’a pourtant bloquée : les gardes ne ' +
        'sont plus attachées à leur transition, et l’avancement d’une mission dépend de conditions ' +
        'sans rapport.',
    ).toBe(true);
  });

  it('C6. laisse passer les conditions explicitement VRAIES', () => {
    const resultat = evaluerTransitionMission(
      demande('en_analyse', 'livree', 'admin', {
        evaluees: { export_realise: true, etape_livraison_validee: true },
      }),
    );
    expect(
      resultat.ok,
      'Une condition mesurée à « true » bloque quand même : la garde est inversée, et plus rien ' +
        'ne peut avancer.',
    ).toBe(true);
  });
});

// =============================================================================
// §D. L'ORDRE DES REFUS — existence → rôle → motif → conditions
// =============================================================================

describe('D. L’ordre des refus est stable (contrat de `evaluerTransitionMission`)', () => {
  // Cet ordre décide de ce que l'utilisateur LIT EN PREMIER. Un ordre non testé
  // dérive au premier refactor — et la dérive est invisible : chaque refus reste
  // « un refus », seul le message change. C'est exactement le genre de régression
  // qu'aucun test de comportement heureux n'attrape.

  it('D1. l’inexistence prime sur tout le reste (quatre motifs applicables à la fois)', () => {
    // Couple inexistant (cloturee est terminal) + rôle sans droit + motif absent
    // + condition explicitement fausse. Un seul motif doit sortir : le premier.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('cloturee', 'preparation', 'lecteur', {
          evaluees: { retrospective_faite: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un couple qui n’existe pas est refusé pour une autre raison : on enseignerait au ' +
        'demandeur des rôles, des motifs et des conditions attachés à une transition imaginaire.',
    ).toBe<MotifRefusTransition>('transition_inexistante');
  });

  it('D2. le rôle prime sur le motif manquant', () => {
    const refus = refusDe(evaluerTransitionMission(demande('livree', 'en_analyse', 'consultant')));
    expect(
      refus.motifRefus,
      'Un consultant sans motif s’entend reprocher son motif plutôt que son rôle : on lui ' +
        'suggère de fournir un motif pour une action qui lui sera de toute façon refusée.',
    ).toBe<MotifRefusTransition>('role_insuffisant');
  });

  it('D3. le rôle prime sur les conditions non remplies', () => {
    // `lecteur` : 03 §34.1 ne lui accorde que « lecture livrés » — aucun rôle ne peut
    // être moins autorisé à faire avancer une mission.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('preparation', 'en_cours', 'lecteur', {
          evaluees: { questionnaire_fige: false, etape_cadrage_validee: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un lecteur s’entend énumérer les manques d’une mission qu’il n’a de toute façon pas le ' +
        'droit de faire avancer : c’est une fuite d’information autant qu’un message inutile.',
    ).toBe<MotifRefusTransition>('role_insuffisant');
    expect(
      refus.conditionsNonRemplies,
      'Le refus de rôle transporte quand même la liste des conditions manquantes.',
    ).toEqual([]);
  });

  it('D4. le motif manquant prime sur les conditions non remplies', () => {
    // Un admin qui FORCE sans motiver : c'est le motif qui manque d'abord. Lui
    // répondre « conditions non remplies » serait absurde — il le sait, c'est
    // précisément pour ça qu'il force.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', {
          surcharge: true,
          evaluees: { etape_collecte_validee: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un forçage sans motif est refusé sur les conditions plutôt que sur le motif : l’admin ne ' +
        'comprend pas qu’il lui suffit de motiver, et le §17.3 (« forcer, avec motif journalisé ») ' +
        'devient inatteignable.',
    ).toBe<MotifRefusTransition>('motif_manquant');
    expect(
      refus.conditionsNonRemplies,
      'Un refus « motif_manquant » énumère des conditions qui ne sont pas la cause du refus.',
    ).toEqual([]);
  });
});

// =============================================================================
// §E. LES RETOURS ARRIÈRE — admin uniquement, motif obligatoire
// =============================================================================

describe('E. Retours arrière : admin uniquement, motif obligatoire (03 §32.2)', () => {
  for (const retour of RETOURS_ATTENDUS) {
    const nom = `${retour.depuis} → ${retour.vers}`;

    it(`E1. ${nom} — un consultant est refusé « role_insuffisant », même motivé`, () => {
      const refus = refusDe(
        evaluerTransitionMission(
          demande(retour.depuis, retour.vers, 'consultant', { motif: MOTIF_VALIDE }),
        ),
      );
      expect(
        refus.motifRefus,
        `Un consultant peut défaire ${nom} : le « admin uniquement » du §32.2 ne tient plus, et ` +
          'n’importe quel auditeur peut renvoyer une mission en arrière depuis la console.',
      ).toBe<MotifRefusTransition>('role_insuffisant');
    });

    it(`E2. ${nom} — un admin SANS motif est refusé « motif_manquant »`, () => {
      const refus = refusDe(evaluerTransitionMission(demande(retour.depuis, retour.vers, 'admin')));
      expect(
        refus.motifRefus,
        `${nom} passe sans motif : la ligne \`activity_log\` exigée par le §32.2 ne dira jamais ` +
          'POURQUOI la mission est revenue en arrière, et l’invariant 7 devient déclaratif.',
      ).toBe<MotifRefusTransition>('motif_manquant');
    });

    for (const blanc of ['', '   ', '\n\t ']) {
      it(`E3. ${nom} — un motif fait de blancs (${JSON.stringify(blanc)}) est refusé`, () => {
        // Un motif obligatoire qui accepte du blanc n'est pas obligatoire : c'est un
        // champ qu'on valide avec la barre d'espace. La garde deviendrait un rituel.
        const refus = refusDe(
          evaluerTransitionMission(demande(retour.depuis, retour.vers, 'admin', { motif: blanc })),
        );
        expect(
          refus.motifRefus,
          `${nom} accepte un motif vide de sens : l’obligation de motiver se contourne avec la ` +
            'barre d’espace, et la trace d’audit ne porte plus rien.',
        ).toBe<MotifRefusTransition>('motif_manquant');
      });
    }

    it(`E4. ${nom} — un admin avec motif est AUTORISÉ, sans surcharge`, () => {
      const resultat = succesDe(
        evaluerTransitionMission(
          demande(retour.depuis, retour.vers, 'admin', { motif: MOTIF_VALIDE }),
        ),
      );
      expect(resultat.transition.depuis, 'Le retour rendu ne part pas du statut demandé.').toBe(
        retour.depuis,
      );
      expect(resultat.transition.vers, 'Le retour rendu ne mène pas au statut demandé.').toBe(
        retour.vers,
      );
      expect(
        resultat.surchargeUtilisee,
        'Un retour arrière est marqué « forcé » alors qu’aucune condition n’a été outrepassée : ' +
          'le journal ferait passer une correction normale pour une dérogation.',
      ).toBe(false);
    });
  }
});

// =============================================================================
// §F. LA SURCHARGE ADMIN MOTIVÉE — une dérogation nommée, pas un pouvoir général
// =============================================================================

describe('F. Surcharge admin motivée (03 §17.3)', () => {
  it('F1. en_cours → en_analyse : un admin motivé force malgré la collecte non validée', () => {
    const resultat = succesDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', {
          surcharge: true,
          motif: 'Collecte arrêtée en accord avec le client : deux sites resteront non audités.',
          evaluees: { etape_collecte_validee: false },
        }),
      ),
    );
    expect(
      resultat.surchargeUtilisee,
      'Le forçage a réussi sans être marqué comme tel : la dérogation devient indistinguable ' +
        'd’un passage normal, et le §17.3 (« motif journalisé ») perd son objet.',
    ).toBe(true);
  });

  it('F2. en_analyse → livree : la surcharge y vaut aussi (« en analyse OU livrée »)', () => {
    const resultat = succesDe(
      evaluerTransitionMission(
        demande('en_analyse', 'livree', 'admin', {
          surcharge: true,
          motif: 'Livraison anticipée à la demande du commanditaire, export produit à la main.',
          evaluees: { export_realise: false, etape_livraison_validee: false },
        }),
      ),
    );
    expect(
      resultat.surchargeUtilisee,
      'Le §17.3 nomme « analyse OU livrée » : ne l’appliquer qu’à l’analyse rend la moitié de ' +
        'la phrase inopérante.',
    ).toBe(true);
  });

  it('F3. forcer SANS motif est refusé « motif_manquant »', () => {
    const refus = refusDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', {
          surcharge: true,
          evaluees: { etape_collecte_validee: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'On peut forcer sans motiver : le §17.3 dit « l’admin peut forcer, AVEC motif journalisé » — ' +
        'sans le motif, la dérogation ne laisse aucune trace exploitable.',
    ).toBe<MotifRefusTransition>('motif_manquant');
  });

  it('F4. un motif fait de blancs ne suffit pas non plus à forcer', () => {
    const refus = refusDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', {
          surcharge: true,
          motif: '   ',
          evaluees: { etape_collecte_validee: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un forçage se justifie avec des espaces : la seule garde du §17.3 se contourne au clavier.',
    ).toBe<MotifRefusTransition>('motif_manquant');
  });

  it('F5. un CONSULTANT ne force pas : la surcharge est un pouvoir d’administrateur', () => {
    // Le refus attendu est « conditions_non_remplies » et non « role_insuffisant » :
    // le consultant a bien le droit de DEMANDER le passage en analyse ; ce qu'il n'a
    // pas, c'est le droit de passer outre les manques. Les deux refus disent des
    // choses différentes, et les confondre effacerait la distinction.
    //
    // ⚠ CE TEST SUPPOSE QUE `consultant` FIGURE DANS LES `roles` DE
    // `en_cours → en_analyse`. Le 03 §32.2 est MUET sur les rôles des transitions
    // « avant » (il ne les nomme que pour les retours arrière) ; le §34.1 dit par
    // ailleurs « la console est ADMIN SEUL » en V1. Si l'implémentation retient
    // `['admin']` partout, ce test rougira en « role_insuffisant » : ce sera alors un
    // DÉSACCORD DE SPEC à trancher dans `DECISIONS.md`, pas un défaut du code testé.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'consultant', {
          surcharge: true,
          motif: MOTIF_VALIDE,
          evaluees: { etape_collecte_validee: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un consultant a forcé une transition : le pouvoir de dérogation du §17.3, réservé à ' +
        'l’admin, s’est étendu à tout le monde.',
    ).toBe<MotifRefusTransition>('conditions_non_remplies');
    expect(
      codesTries(refus.conditionsNonRemplies),
      'Le refus ne nomme pas le manque qui l’a causé.',
    ).toEqual(codesTries(['etape_collecte_validee']));
  });

  it('F6. preparation → en_cours ne se force PAS, même par un admin motivé', () => {
    // La transition la plus tentante à forcer, et celle où le §17.3 se tait. Forcer
    // ici ferait démarrer une collecte sur un questionnaire non figé — c'est-à-dire
    // sur des questions qui peuvent encore changer sous les pieds des auditeurs, ce
    // que tout le dispositif de figeage (LOT_L3.md §3a) existe pour empêcher.
    const refus = refusDe(
      evaluerTransitionMission(
        demande('preparation', 'en_cours', 'admin', {
          surcharge: true,
          motif: 'Le terrain démarre demain, le questionnaire sera figé dans la journée.',
          evaluees: { questionnaire_fige: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'Un admin a forcé un démarrage de collecte sans questionnaire figé : forcer est devenu un ' +
        'pouvoir général au lieu de la dérogation nommée du §17.3, et la garde de figeage tombe.',
    ).toBe<MotifRefusTransition>('conditions_non_remplies');
    expect(codesTries(refus.conditionsNonRemplies)).toEqual(codesTries(['questionnaire_fige']));
  });

  it('F7. livree → cloturee ne se force pas non plus — la clôture est irréversible', () => {
    const refus = refusDe(
      evaluerTransitionMission(
        demande('livree', 'cloturee', 'admin', {
          surcharge: true,
          motif: 'Rétrospective planifiée la semaine prochaine.',
          evaluees: { retrospective_faite: false },
        }),
      ),
    );
    expect(
      refus.motifRefus,
      'On peut forcer la clôture : un état dont on ne revient JAMAIS (§32.2) s’atteindrait en ' +
        'passant outre sa seule condition — l’erreur y serait définitive.',
    ).toBe<MotifRefusTransition>('conditions_non_remplies');
  });
});

// =============================================================================
// §G. LE DRAPEAU `surchargeUtilisee` — il doit distinguer quelque chose
// =============================================================================

describe('G. Le drapeau `surchargeUtilisee`', () => {
  it('G1. vaut false sur un cas nominal, sans demande de surcharge', () => {
    // Sans ce test, un drapeau constamment à `true` passerait §F sans être remarqué,
    // et le journal marquerait « forcé » tous les passages en analyse du produit.
    const resultat = succesDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', { evaluees: { etape_collecte_validee: true } }),
      ),
    );
    expect(
      resultat.surchargeUtilisee,
      'Une transition parfaitement régulière est marquée « forcée » : la dérogation ne se ' +
        'distingue plus du fonctionnement normal, et le journal ment.',
    ).toBe(false);
  });

  it('G2. vaut false quand la surcharge est demandée mais N’A RIEN eu à outrepasser', () => {
    // « Utilisée » se lit : elle a effectivement PORTÉ la décision. Une surcharge
    // demandée sur une transition qui passait de toute façon n'a rien porté ; la
    // marquer produirait une trace de dérogation là où aucune règle n'a été pliée.
    // ⚠ Point NON tranché par le pack : le §17.3 nomme le pouvoir de forcer, jamais
    // la sémantique du drapeau. Lecture retenue ici, à confirmer en revue croisée.
    const resultat = succesDe(
      evaluerTransitionMission(
        demande('en_cours', 'en_analyse', 'admin', {
          surcharge: true,
          motif: MOTIF_VALIDE,
          evaluees: { etape_collecte_validee: true },
        }),
      ),
    );
    expect(
      resultat.surchargeUtilisee,
      'Une surcharge demandée mais inutile est comptée comme utilisée : les revues d’audit ' +
        'compteraient des dérogations qui n’ont jamais eu lieu.',
    ).toBe(false);
  });

  it('G3. vaut false sur une transition « avant » qui n’est pas surchargeable', () => {
    const resultat = succesDe(
      evaluerTransitionMission(
        demande('livree', 'cloturee', 'admin', {
          surcharge: true,
          motif: MOTIF_VALIDE,
          evaluees: { retrospective_faite: true },
        }),
      ),
    );
    expect(
      resultat.surchargeUtilisee,
      'Une transition non surchargeable rend quand même le drapeau levé : le drapeau suit la ' +
        'DEMANDE au lieu de suivre l’effet, et ne prouve plus rien.',
    ).toBe(false);
  });
});

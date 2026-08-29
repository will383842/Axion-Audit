// =============================================================================
// LA POLITIQUE DE REDACTION DU JOURNAL, ÉPROUVÉE SUR UNE VRAIE INSTANCE PINO.
//
// Écrit par A76, qui n'a produit AUCUNE des lignes testées et n'a pas lu
// `packages/shared/src/redaction.ts` (09 §5.6 : le code de test n'est jamais écrit
// par l'agent qui a écrit le code testé). Les cas ci-dessous sont dérivés de la
// SPÉCIFICATION, pas de l'implémentation — c'est la seule façon qu'un test a de
// contredire son sujet.
//
// ── CE QUI EST GARDÉ ─────────────────────────────────────────────────────────
// Contrat 11 §2 : « Aucune donnée personnelle dans les logs : person_name, emails,
// contenus de réponse interdits dans pino (redaction configurée). »
// Le cas réel qui a motivé ce fichier : une violation d'unicité PostgreSQL. Le
// pilote `pg` remonte une erreur dont le message et le `detail` ont la forme
//     Key (person_name)=(Jean Dupont) already exists.
// Journaliser `{ err }` déverse alors une identité dans un fichier qui part en
// clair à l'agrégation. La forme `Failing row contains (…)` est pire encore :
// elle recopie la LIGNE ENTIÈRE.
//
// ── LE PIÈGE, ET POURQUOI CHAQUE CAS REGARDE LA SORTIE ENTIÈRE ───────────────
// `err.stack` REPREND `err.message` dans sa première ligne. Un correctif qui ne
// nettoierait que `message` laisserait la donnée fuir par la pile, et un test qui
// ne lirait que `message` le déclarerait vert. Les assertions portent donc sur la
// CHAÎNE JOURNALISÉE COMPLÈTE, et un cas dédié éprouve la pile explicitement —
// avec un témoin qui prouve d'abord que la pile contenait bien la donnée.
//
// ── ET LA MOITIÉ QU'ON OUBLIE : CE QUI DOIT SURVIVRE ─────────────────────────
// Un correctif qui masque tout serait un faux succès : sans le SQLSTATE (`23505`),
// sans le NOM de la colonne et sans le NOM de la contrainte, `{ err }` ne
// diagnostique plus rien et l'exploitation devient aveugle. Ces conservations sont
// testées aussi sévèrement que les masquages.
//
// ── POURQUOI CE FICHIER VIT DANS `apps/api/src/` ET NON DANS `packages/shared/` ─
// `OPTIONS_REDACTION_JOURNAL` est défini dans `packages/shared`, mais ce paquet ne
// dépend PAS de pino (voir son `package.json`) : sous pnpm, `import 'pino'` y est
// irrésoluble. Or éprouver la politique SANS pino reviendrait à réimplémenter la
// sémantique de `redact` — donc à tester une imitation. `apps/api` est le premier
// consommateur réel de la politique (`apps/api/src/logger.ts`) et y résout pino ;
// le harnais reproduit à l'identique l'expression posée en production :
//     redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] }
// Ajouter pino aux dépendances de `packages/shared` aurait touché le manifeste et
// le lockfile partagés — hors périmètre d'un agent de test (11 §8-1).
//
// Traçabilité : E33, E42 (RGPD renforcé) · CLAUDE.md §2 · 06 §10.2 et §10.4.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { pino, type Logger } from 'pino';
import { z } from 'zod';
import { OPTIONS_REDACTION_JOURNAL } from '@axion/shared';

// -----------------------------------------------------------------------------
// SENTINELLES — aucune n'est une donnée réelle, et aucune ne ressemble à un mot
// que le code produirait par lui-même : si l'une apparaît en sortie, elle ne peut
// venir que de ce qu'on a journalisé.
// -----------------------------------------------------------------------------
const NOM = 'Jean Dupont';
const NOM_COMPOSITE = 'Marie Curie';
const COURRIEL = 'jean.dupont@exemple.fr';
const VALEUR_OPAQUE = 'VALEUR_SENTINELLE_XYZ';
const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
const CONTRAINTE = 'users_email_key';
const SQLSTATE = '23505';

interface Banc {
  /** Le journal sous test, configuré comme `apps/api/src/logger.ts`. */
  readonly journal: Logger;
  /** TOUT ce qui a été écrit, brut : messages, champs, piles. */
  readonly sortie: () => string;
  /** La dernière ligne, analysée. */
  readonly ligne: () => Ligne;
}

const schemaLigne = z.object({
  level: z.number(),
  msg: z.string(),
  err: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string(),
      code: z.string().optional(),
      constraint: z.string().optional(),
      column: z.string().optional(),
      detail: z.string().optional(),
    })
    .optional(),
});

type Ligne = z.infer<typeof schemaLigne>;

/**
 * Une instance pino NUE, avec la seule politique de redaction et un flux capturé.
 * Nue à dessein : on éprouve la POLITIQUE, pas l'assemblage de `logger.ts` — ce
 * dernier y ajoute `base`, l'horodatage ISO et le niveau, qui ne changent rien à
 * ce qui est masqué.
 */
function banc(): Banc {
  const bouts: string[] = [];
  const journal = pino(
    {
      level: 'trace',
      // EXACTEMENT l'expression de production (`apps/api/src/logger.ts`) : la copie
      // de `paths` n'est pas cosmétique, pino exige un tableau mutable.
      redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
    },
    {
      write(morceau: string): void {
        bouts.push(morceau);
      },
    },
  );
  const sortie = (): string => bouts.join('');
  const ligne = (): Ligne => {
    const dernier = bouts.at(-1);
    if (dernier === undefined) throw new Error('Aucune ligne journalisée.');
    return schemaLigne.parse(JSON.parse(dernier));
  };
  return { journal, sortie, ligne };
}

/**
 * Une erreur telle que le pilote `pg` la remonte sur une violation de contrainte.
 * Les champs `code`, `detail`, `constraint`, `column`, `table` sont ceux que `pg`
 * recopie du protocole PostgreSQL ; le sérialiseur d'erreur de pino les emporte.
 */
function erreurPostgres(message: string, extras: Record<string, string> = {}): Error {
  const erreur = new Error(message);
  Object.assign(erreur, { code: SQLSTATE, ...extras });
  return erreur;
}

/** Le sous-arbre `err` de la dernière ligne, ou un échec explicite. */
function erreurJournalisee(ligne: Ligne): NonNullable<Ligne['err']> {
  const { err } = ligne;
  if (err === undefined) {
    throw new Error(
      'La ligne journalisée ne porte pas de sous-arbre `err` : le cas ne prouve rien.',
    );
  }
  return err;
}

// =============================================================================
// 1 · LA FUITE — la partie VALEUR de `Key (<colonne>)=(<valeur>)` ne doit
//     apparaître NULLE PART dans la ligne journalisée.
// =============================================================================
describe("violation d'unicité PostgreSQL : la valeur ne doit pas atteindre le journal", () => {
  it("@critique la valeur d'un `Key (person_name)=(…)` est absente de la ligne ENTIÈRE", () => {
    const { journal, sortie } = banc();
    journal.error(
      {
        err: erreurPostgres(`Key (person_name)=(${NOM}) already exists.`, {
          constraint: 'persons_mission_name_key',
          column: 'person_name',
          detail: `Key (person_name)=(${NOM}) already exists.`,
        }),
      },
      'Erreur interne',
    );

    expect(sortie()).not.toContain(NOM);
  });

  it('@critique la PILE ne recopie pas la valeur — le piège central de ce correctif', () => {
    const { journal, ligne } = banc();
    const err = erreurPostgres(`Key (person_name)=(${NOM}) already exists.`, {
      column: 'person_name',
    });

    // TÉMOIN. Sans lui, ce cas pourrait passer au vert parce que la pile ne
    // contenait pas la donnée — et non parce qu'elle en a été nettoyée.
    expect(err.stack ?? '').toContain(NOM);

    journal.error({ err }, 'Erreur interne');
    const journalisee = erreurJournalisee(ligne());

    // La pile reste une PILE : un correctif qui la viderait passerait `not.toContain`
    // sans rien préserver. On exige les deux.
    expect(journalisee.stack).toContain('Error:');
    expect(journalisee.stack).not.toContain(NOM);
    expect(journalisee.message).not.toContain(NOM);
  });

  it('@critique le champ `detail` de `pg` est nettoyé comme le message', () => {
    const { journal, ligne } = banc();
    journal.error(
      {
        err: erreurPostgres(`duplicate key value violates unique constraint "${CONTRAINTE}"`, {
          detail: `Key (person_name)=(${NOM}) already exists.`,
        }),
      },
      'Erreur interne',
    );

    expect(erreurJournalisee(ligne()).detail ?? '').not.toContain(NOM);
  });

  it('@critique une colonne INCONNUE est masquée aussi : la règle porte sur la forme, pas sur une liste', () => {
    const { journal, sortie } = banc();
    journal.error(
      { err: erreurPostgres(`Key (reference_interne)=(${VALEUR_OPAQUE}) already exists.`) },
      'Erreur interne',
    );

    expect(sortie()).not.toContain(VALEUR_OPAQUE);
  });

  it('@critique une clé COMPOSITE masque TOUTES ses valeurs, pas seulement la première', () => {
    const { journal, sortie } = banc();
    journal.error(
      {
        err: erreurPostgres(
          `Key (mission_id, person_name)=(01ARZ3NDEKTSV4RRFFQ69G5FAV, ${NOM_COMPOSITE}) already exists.`,
        ),
      },
      'Erreur interne',
    );

    expect(sortie()).not.toContain(NOM_COMPOSITE);
    // La PARTIE VALEUR est masquée en entier, identifiant technique compris : la
    // règle porte sur la FORME `Key (…)=(…)`, pas sur la nature de chaque valeur.
    // Hors de cette forme, le même identifiant doit continuer de passer intact —
    // c'est ce que prouve « Mission 01ARZ… chargée » dans la section 3.
    expect(sortie()).not.toContain('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('@critique `Failing row contains (…)` ne déverse pas la ligne entière', () => {
    const { journal, sortie } = banc();
    journal.error(
      {
        err: erreurPostgres(
          `Failing row contains (01ARZ3NDEKTSV4RRFFQ69G5FAV, ${NOM}, ${COURRIEL}, 2026-01-01).`,
        ),
      },
      'Erreur interne',
    );

    expect(sortie()).not.toContain(NOM);
    expect(sortie()).not.toContain(COURRIEL);
  });
});

// =============================================================================
// 2 · LE JETON NU — un JWT qui ne s'appuie sur AUCUN mot voisin.
//
// ── COMMENT CE CAS A ÉTÉ TROUVÉ, ET POURQUOI LA MESURE D'ORIGINE MENTAIT ─────
// La politique était réputée « nettoyer les JWT (mesuré) ». L'échantillon qui
// l'avait établi disait `refresh token eyJ…` : c'est le mot **token** adjacent qui
// déclenchait l'assainisseur, PAS le jeton. La sonde répondait à une autre question
// que celle qu'on croyait poser. Mesure refaite, sur cette politique :
//     `Bearer eyJ…`                       → nettoyé  (c'est `Bearer` qui déclenche)
//     `invalid signature for token eyJ…`  → nettoyé  (c'est `token` qui déclenche)
//     `jwt malformed: eyJ…`               → **FUITE**
//     `Vérification refusée … eyJ… émis`  → **FUITE**
// Un message de bibliothèque JWT, ou n'importe quelle phrase française où le jeton
// ne côtoie aucun mot-clé anglais, sortait donc en clair — dans `message` ET dans
// la pile. Les cas ci-dessous n'emploient AUCUN mot déclencheur à côté du jeton :
// c'est la seule façon d'éprouver la reconnaissance du jeton LUI-MÊME.
//
// ── POURQUOI CETTE FAMILLE SE TRAITE PAR MOTIF, LÀ OÙ LE NOM NE LE PEUT PAS ──
// Un nom de personne n'a pas de forme : le détecter par ressemblance serait une
// devinette, et le pack le refuse. Un JWT, si — trois segments base64url séparés
// par des points, le premier commençant par `eyJ`. La reconnaître est honnête.
// C'est ce qui a permis de trancher cette fuite en micro-amélioration (09 §5.9
// étage 1) plutôt qu'en fiche à arbitrer : une fuite de secret n'attend pas.
// =============================================================================
describe('un jeton JWT nu ne doit pas atteindre le journal', () => {
  it('@critique un jeton dans `err.message` est masqué, sans mot voisin pour aider', () => {
    const { journal, sortie } = banc();
    journal.error({ err: new Error(`jwt malformed: ${JETON}`) }, 'Authentification refusée');

    expect(sortie()).not.toContain(JETON);
  });

  it('@critique la PILE ne recopie pas le jeton — même piège que pour le nom', () => {
    const { journal, ligne } = banc();
    const err = new Error(`jwt malformed: ${JETON}`);

    // TÉMOIN, comme pour `person_name` : sans lui, ce cas passerait au vert parce
    // que la pile ne portait pas le jeton, et non parce qu'elle en a été nettoyée.
    expect(err.stack ?? '').toContain(JETON);

    journal.error({ err }, 'Authentification refusée');
    const journalisee = erreurJournalisee(ligne());

    expect(journalisee.stack).toContain('Error:');
    expect(journalisee.stack).not.toContain(JETON);
    expect(journalisee.message).not.toContain(JETON);
  });

  it('@critique un jeton nu dans un message libre est masqué', () => {
    const { journal, sortie } = banc();
    journal.info(`Jeton reçu : ${JETON}`);

    expect(sortie()).not.toContain(JETON);
  });

  it('@critique le jeton part, la phrase qui l’entoure reste', () => {
    const { journal, ligne } = banc();
    // Formulation ENTIÈREMENT française : aucun `Bearer`, aucun `token`, aucun
    // `authorization` pour déclencher l'assainisseur à la place du jeton.
    journal.warn(`Vérification refusée pour le jeton ${JETON} émis le 2026-08-27`);

    const { msg } = ligne();
    expect(msg).not.toContain(JETON);
    // Un correctif qui masquerait la phrase entière serait un FAUX SUCCÈS : sans
    // le motif du refus ni la date d'émission, la ligne ne diagnostique plus rien.
    expect(msg).toContain('Vérification refusée pour le jeton');
    expect(msg).toContain('émis le 2026-08-27');
  });

  it('@critique un jeton porté par un champ non listé est masqué lui aussi', () => {
    const { journal, sortie } = banc();
    journal.info({ trace_technique: `échec sur ${JETON}` }, 'Authentification refusée');

    expect(sortie()).not.toContain(JETON);
  });
});

// =============================================================================
// 2bis · CE QUE LE MASQUAGE DES JETONS NE DOIT PAS EMPORTER.
//        Contrepoids exact de la section précédente : un correctif qui hacherait
//        le message d'erreur entier ferait disparaître la seule chose qui permet
//        de distinguer « jeton expiré » de « signature invalide » — c'est-à-dire
//        « l'utilisateur doit se reconnecter » de « quelqu'un forge des jetons ».
// =============================================================================
describe('le diagnostic d’authentification survit au masquage du jeton', () => {
  /** Une erreur de bibliothèque JWT : un type propre, un motif dans le message. */
  class ErreurJeton extends Error {}

  it('le motif « jwt malformed » survit à côté du jeton masqué', () => {
    const { journal, ligne } = banc();
    journal.error({ err: new ErreurJeton(`jwt malformed: ${JETON}`) }, 'Authentification refusée');

    const err = erreurJournalisee(ligne());
    expect(err.message).toContain('jwt malformed');
    expect(err.message).not.toContain(JETON);
  });

  it('le motif « invalid signature » survit', () => {
    const { journal, ligne } = banc();
    journal.error(
      { err: new ErreurJeton(`invalid signature: ${JETON}`) },
      'Authentification refusée',
    );

    const err = erreurJournalisee(ligne());
    expect(err.message).toContain('invalid signature');
    expect(err.message).not.toContain(JETON);
  });

  it('le motif « jwt expired » survit, avec sa date d’expiration', () => {
    const { journal, ligne } = banc();
    journal.error(
      { err: new ErreurJeton(`jwt expired at 2026-08-27T10:00:00Z — ${JETON}`) },
      'Authentification refusée',
    );

    const err = erreurJournalisee(ligne());
    expect(err.message).toContain('jwt expired at 2026-08-27T10:00:00Z');
    expect(err.message).not.toContain(JETON);
  });

  it('le TYPE de l’erreur survit — c’est lui qui range l’incident', () => {
    const { journal, ligne } = banc();
    journal.error({ err: new ErreurJeton(`jwt malformed: ${JETON}`) }, 'Authentification refusée');

    expect(erreurJournalisee(ligne()).type).toBe('ErreurJeton');
  });
});

// =============================================================================
// 3 · CE QUE LE CORRECTIF NE DOIT PAS EMPORTER.
//     Un masquage total serait un faux succès : `{ err }` doit rester
//     diagnosticable (06 §10.2). Ces cas sont l'exact contrepoids des précédents.
// =============================================================================
describe("le diagnostic survit : ce qu'un masquage trop large détruirait", () => {
  /** Le cas complet, tel que `pg` le remonte réellement. */
  function bancComplet(): Banc {
    const b = banc();
    b.journal.error(
      {
        err: erreurPostgres(`Key (person_name)=(${NOM}) already exists.`, {
          constraint: CONTRAINTE,
          column: 'person_name',
          table: 'persons',
          detail: `Key (person_name)=(${NOM}) already exists.`,
        }),
      },
      'Erreur interne',
    );
    return b;
  }

  it('le SQLSTATE 23505 survit — sans lui on ne sait plus de quelle erreur il s’agit', () => {
    const b = bancComplet();
    expect(erreurJournalisee(b.ligne()).code).toBe(SQLSTATE);
    expect(b.sortie()).toContain(SQLSTATE);
  });

  it('le NOM de la colonne survit — dans le champ `column` ET dans le message', () => {
    const b = bancComplet();
    const err = erreurJournalisee(b.ligne());
    expect(err.column).toBe('person_name');
    // La colonne est le seul repère qui reste dans la forme `Key (…)=(…)` une fois
    // la valeur masquée : la masquer avec sa valeur rendrait le message inutile.
    expect(err.message).toContain('person_name');
  });

  it('le NOM de la contrainte survit — c’est lui qui désigne l’index fautif', () => {
    const b = bancComplet();
    expect(erreurJournalisee(b.ligne()).constraint).toBe(CONTRAINTE);
    expect(b.sortie()).toContain(CONTRAINTE);
  });

  it('le nom de contrainte survit AUSSI quand il n’est que dans le message', () => {
    const { journal, ligne } = banc();
    journal.error(
      { err: erreurPostgres(`duplicate key value violates unique constraint "${CONTRAINTE}"`) },
      'Erreur interne',
    );
    expect(erreurJournalisee(ligne()).message).toContain(CONTRAINTE);
  });

  it('la ligne reste structurée : niveau, message et type d’erreur intacts', () => {
    const b = bancComplet();
    const l = b.ligne();
    expect(l.level).toBe(50);
    expect(l.msg).toBe('Erreur interne');
    expect(erreurJournalisee(l).type).toBe('Error');
  });
});

// =============================================================================
// 4 · UN JOURNAL QUI RESTE LISIBLE.
//     Si un message ordinaire est haché, l'exploitation perd sa raison d'être et
//     l'équipe finit par ignorer les journaux — ce qui coûte plus cher que la
//     fuite qu'on prétendait éviter.
// =============================================================================
describe('les messages sans donnée personnelle traversent INTACTS', () => {
  const ordinaires = [
    'Migration 0007 appliquée en 42 ms',
    'Connexion à la base établie (pool : 10 connexions)',
    'Mission 01ARZ3NDEKTSV4RRFFQ69G5FAV chargée — 30 questions, 1 entretien',
    'duplicate key value violates unique constraint "answers_interview_question_key"',
    "Échec de l'envoi : le service distant a répondu 503 après 3 tentatives",
    // LES TROIS SUIVANTS GARDENT LE MASQUAGE DES JETONS CONTRE SES DÉGÂTS COLLATÉRAUX.
    // Un jeton JWT se reconnaît à une forme RIGIDE : trois segments base64url séparés
    // par des points, le premier commençant par `eyJ` (c'est-à-dire `{"` encodé).
    // Une expression qui se contenterait de « trois groupes séparés par des points »
    // mangerait tout ce qui suit — un chemin de module, un numéro de version, une
    // empreinte. Le journal deviendrait illisible là où il n'y a AUCUN secret.
    'Module chargé : apps.api.logger',
    'Version du schéma : 2026.08.27-b3',
    'Empreinte : c2hhMjU2.YWJj.ZGVm',
  ] as const;

  for (const message of ordinaires) {
    it(`« ${message.slice(0, 46)}… » n’est pas altéré`, () => {
      const { journal, ligne } = banc();
      journal.info(message);
      expect(ligne().msg).toBe(message);
    });
  }
});

// =============================================================================
// 5 · NON-RÉGRESSION — mesuré propre AVANT les correctifs, doit le rester APRÈS.
//     Ces cas ne testent aucun correctif : ils vérifient qu'aucun n'a cassé ce qui
//     protégeait déjà. Sans eux, une politique réécrite pourrait rouvrir une brèche
//     déjà fermée sans qu'aucun test ne bronche.
//
//     Les trois formes de jeton ci-dessous (`Bearer …`, champ `authorization`,
//     paramètre `?token=`) sont précisément celles qui étaient déjà propres — et
//     qui ont fait croire, à tort, que TOUS les jetons l'étaient (voir §2). Elles
//     doivent le rester : le nouveau masquage par motif s'AJOUTE aux déclencheurs
//     par mot voisin, il ne les remplace pas.
// =============================================================================
describe('non-régression : ce qui était déjà masqué le reste', () => {
  it('@critique une adresse e-mail dans un message libre est masquée', () => {
    const { journal, sortie } = banc();
    journal.info(`Contact du répondant : ${COURRIEL}`);
    expect(sortie()).not.toContain(COURRIEL);
  });

  it('@critique une adresse e-mail dans une erreur est masquée dans le message ET dans la pile', () => {
    const { journal, ligne } = banc();
    const err = new Error(`utilisateur ${COURRIEL} introuvable`);
    expect(err.stack ?? '').toContain(COURRIEL);

    journal.error({ err }, 'Erreur interne');
    const journalisee = erreurJournalisee(ligne());
    expect(journalisee.message).not.toContain(COURRIEL);
    expect(journalisee.stack).not.toContain(COURRIEL);
  });

  const telephones = ['06 12 34 56 78', '06.12.34.56.78', '0612345678', '+33612345678'] as const;

  for (const telephone of telephones) {
    it(`@critique le numéro « ${telephone} » est masqué`, () => {
      const { journal, sortie } = banc();
      journal.info(`Téléphone de l'interlocuteur : ${telephone}`);
      expect(sortie()).not.toContain(telephone);
    });
  }

  it('@critique un jeton porteur dans un message libre est masqué', () => {
    const { journal, sortie } = banc();
    journal.info(`En-tête reçu : Bearer ${JETON}`);
    expect(sortie()).not.toContain(JETON);
  });

  it("@critique le champ `authorization` d'un objet journalisé est masqué", () => {
    const { journal, sortie } = banc();
    journal.info({ authorization: `Bearer ${JETON}` }, 'Requête entrante');
    expect(sortie()).not.toContain(JETON);
  });

  it("@critique un jeton passé en paramètre d'URL est masqué", () => {
    const { journal, sortie } = banc();
    journal.info({ req: { url: `/v1/missions?token=${JETON}` } }, 'Requête entrante');
    expect(sortie()).not.toContain(JETON);
  });

  it('@critique un champ `person_name` d’objet est masqué, à toute profondeur', () => {
    const { journal, sortie } = banc();
    journal.info({ mission: { entretien: { person_name: NOM } } }, 'Entretien ouvert');
    expect(sortie()).not.toContain(NOM);
  });

  it('@critique un contenu de réponse (`answer`) est masqué', () => {
    const { journal, sortie } = banc();
    journal.info({ answer: VALEUR_OPAQUE }, 'Réponse enregistrée');
    expect(sortie()).not.toContain(VALEUR_OPAQUE);
  });
});

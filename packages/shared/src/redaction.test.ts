// =============================================================================
// REDACTION DU JOURNAL — le contenant que le masquage par NOM ne pouvait pas voir.
//
// ── CE QUE CE FICHIER PROUVE, ET POURQUOI IL EXISTE ─────────────────────────
// La revue de sécurité A51 du 2026-09-02 (constat F-12, MAJEUR) a mesuré, sonde à
// l'appui, qu'une `DrizzleQueryError` republiait **la requête ET tous ses
// paramètres** dans les fichiers de pino : le gabarit `Failed query: … / params: …`
// n'appartenait à aucun contenant du §6 de `redaction.ts`, et `params` est un
// tableau **POSITIONNEL** — sans clés, donc invisible pour une politique qui masque
// par NOM DE CHAMP. Les tests reproduisent la sonde : une erreur de requête portant
// une donnée personnelle en paramètre ne doit plus laisser cette donnée dans la
// ligne journalisée.
//
// ── POURQUOI PAS PINO ICI ───────────────────────────────────────────────────
// `packages/shared` ne dépend PAS de pino, et l'y ajouter serait une dépendance
// hors de la liste épinglée du 11 §1 — escalade, pas décision d'agent. Ces tests
// éprouvent donc les DEUX briques que pino appelle, séparément et directement :
// `nettoyerTexteJournal` (la ceinture « contenant ») et le censeur
// d'`OPTIONS_REDACTION_JOURNAL` (la ceinture « nom de champ »). Le branchement
// pino↔politique, lui, est déjà couvert côté API par
// `apps/api/src/redaction-journal*.test.ts`, qui charge pino pour de bon.
//
// ── LES DEUX CEINTURES SONT TESTÉES SÉPARÉMENT, ET C'EST LE POINT ───────────
// pino sérialise le MESSAGE de l'erreur **et** ses propriétés propres. Une seule
// des deux ceintures laisserait donc passer l'autre moitié de la fuite : le message
// est traité par le gabarit, `params` par le masquage de champ. Un test qui n'en
// vérifierait qu'une déclarerait le trou fermé alors qu'il resterait ouvert de
// moitié.
// Traçabilité : E33 (sécurité / RGPD) · E42 (RGPD renforcé) · E43 (conventions).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  CENSEUR_JOURNAL,
  CENSEUR_TEXTE_JOURNAL,
  CHAMPS_MASQUES_JOURNAL,
  OPTIONS_REDACTION_JOURNAL,
  assainirJournal,
  nettoyerPileJournal,
  nettoyerTexteJournal,
} from './redaction.js';

/**
 * Le message exact que produit `DrizzleQueryError` — requête, saut de ligne,
 * `params:`, puis les valeurs jointes par des virgules.
 *
 * ⚠ **AUCUNE DE CES VALEURS N'EST AUTO-DESCRIPTIVE**, et c'est délibéré : un nom de
 * personne n'a ni arobase, ni préfixe, ni forme. C'est précisément ce qu'A51
 * reproche au masquage par nom de champ — devant un tableau positionnel, il n'a
 * rien à quoi se raccrocher. Un test qui n'utiliserait qu'une adresse e-mail
 * passerait au vert grâce au motif des e-mails, sans rien prouver du gabarit.
 */
function messageDrizzle(valeurs: string): string {
  return (
    'Failed query: insert into "org_units" ("id","mission_id","name","headcount") ' +
    'values ($1,$2,$3,$4)\nparams: ' +
    valeurs
  );
}

describe('redaction — le gabarit `Failed query: … / params: …` de Drizzle (A51, F-12)', () => {
  it('retire les paramètres et conserve la requête', () => {
    const nettoye = nettoyerTexteJournal(
      messageDrizzle('0199-uuid,0199-uuid,Direction Régionale,12'),
    );

    expect(nettoye).not.toContain('Direction Régionale');
    // Le diagnostic entier survit : quelle table, quelles colonnes, quelle forme.
    expect(nettoye).toContain('insert into "org_units"');
    expect(nettoye).toContain('values ($1,$2,$3,$4)');
    expect(nettoye).toContain('params: [4 paramètres masqués]');
  });

  it("ne laisse passer aucune valeur, même quand aucune n'a de forme reconnaissable", () => {
    // La sonde d'A51, au mot près : une cellule de fichier client en paramètre.
    const nettoye = nettoyerTexteJournal(messageDrizzle('Sophie Bernard,STAGIAIRE,null'));

    expect(nettoye).not.toContain('Sophie Bernard');
    expect(nettoye).not.toContain('STAGIAIRE');
  });

  it('retire une adresse e-mail passée en paramètre — la sonde nominale', () => {
    const nettoye = nettoyerTexteJournal(messageDrizzle('jean.dupont@exemple.fr,12'));

    expect(nettoye).not.toContain('jean.dupont@exemple.fr');
    expect(nettoye).not.toContain('@exemple.fr');
  });

  it("masque jusqu'à la fin de la chaîne, trames comprises — et c'est le correctif F-20", () => {
    const avecPile =
      messageDrizzle('Sophie Bernard,12') +
      '\n    at Object.<anonymous> (/app/apps/api/src/domaines/org-units/depot.js:1:1)' +
      '\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)';

    const nettoye = nettoyerTexteJournal(avecPile);

    expect(nettoye).not.toContain('Sophie Bernard');
    // ⚠ CETTE ASSERTION A CHANGÉ DE SENS, ET C'EST LE CŒUR DE F-20. La version
    // précédente vérifiait que les trames SURVIVAIENT à ce nettoyage-ci — le motif
    // s'arrêtait alors sur `\n    at `, un terminateur qu'une cellule de CSV peut
    // contenir. Sur une CHAÎNE NUE, rien ne distingue une vraie trame d'une fausse :
    // on masque donc jusqu'au bout. Les vraies trames sont récupérées AILLEURS, par
    // `nettoyerPileJournal`, qui dispose d'une borne que l'appelant ne contrôle pas.
    expect(nettoye).not.toContain('depot.js:1:1');
    expect(nettoye).toContain('params: [4 paramètres masqués]');
  });

  it('ne se laisse pas terminer par une fausse trame glissée dans une valeur (A51, F-20)', () => {
    // Une cellule de CSV entre guillemets peut porter un saut de ligne (RFC 4180,
    // admis par `analyserCsvArbre`) : l'appelant peut donc écrire ce qui RESSEMBLE à
    // une trame de pile, puis continuer. Tout ce qui suivait repartait en clair.
    const piegee = 'Direction\n    at feint (/app/x.js:1:1)\nSophie Bernard,SECRET-42';
    const nettoye = nettoyerTexteJournal(messageDrizzle('0199-uuid,' + piegee));

    expect(nettoye).not.toContain('Sophie Bernard');
    expect(nettoye).not.toContain('SECRET-42');
    expect(nettoye).not.toContain('feint');
  });

  it('préserve les VRAIES trames par la longueur du message, pas par un motif', () => {
    const message = messageDrizzle('0199-uuid,Sophie Bernard,12');
    const pile =
      'DrizzleQueryError: ' +
      message +
      '\n    at Object.<anonymous> (/app/apps/api/src/domaines/org-units/depot.js:12:9)' +
      '\n    at run (/app/y.js:2:2)';

    const nettoyee = nettoyerPileJournal(message, pile);

    expect(nettoyee).not.toContain('Sophie Bernard');
    // La borne est la LONGUEUR du message — une propriété de l'erreur, pas un motif
    // que la donnée pourrait imiter. Les trames réelles survivent donc intactes.
    expect(nettoyee).toContain('org-units/depot.js:12:9');
    expect(nettoyee).toContain('at run (/app/y.js:2:2)');
  });

  it('masque la pile ENTIÈRE quand le message est introuvable dedans', () => {
    // Repli sûr : on ne préserve rien qu'on ne sait pas délimiter.
    const nettoyee = nettoyerPileJournal('un message absent', messageDrizzle('Sophie Bernard'));
    expect(nettoyee).not.toContain('Sophie Bernard');
  });

  it('retire une valeur qui contient elle-même un saut de ligne', () => {
    // Le cas d'usage du lot L3 : une cellule de CSV entre guillemets peut porter un
    // saut de ligne. Un bornage à la ligne aurait laissé fuiter la suite.
    const nettoye = nettoyerTexteJournal(
      'Failed query: insert into "org_units" values ($1)\nparams: Direction\nSud',
    );

    expect(nettoye).not.toContain('Sud');
    expect(nettoye).toContain('params: [1 paramètre masqué]');
  });

  it('accorde son décompte en français, et se tait quand il ne sait pas compter', () => {
    expect(nettoyerTexteJournal('Failed query: select $1\nparams: X')).toContain(
      '[1 paramètre masqué]',
    );
    expect(nettoyerTexteJournal('Failed query: select $1,$2\nparams: X,Y')).toContain(
      '[2 paramètres masqués]',
    );
    // Aucun emplacement dans la requête : on ne devine pas un décompte sur les
    // virgules des VALEURS — « Direction, Sud » en contient une.
    expect(nettoyerTexteJournal('Failed query: select 1\nparams: X')).toContain(
      '[paramètres masqués]',
    );
  });

  it('ne touche pas à une chaîne ordinaire qui contient le mot « params »', () => {
    const ordinaire = 'requête traitée, params validés';
    expect(nettoyerTexteJournal(ordinaire)).toBe(ordinaire);
  });

  it('laisse intacts les trois contenants PostgreSQL déjà couverts', () => {
    expect(nettoyerTexteJournal('Key (email)=(jean@exemple.fr) already exists.')).toBe(
      `Key (email)=(${CENSEUR_TEXTE_JOURNAL}) already exists.`,
    );
    expect(nettoyerTexteJournal('Failing row contains (4, 12, Sophie Bernard).')).toBe(
      `Failing row contains (${CENSEUR_TEXTE_JOURNAL}).`,
    );
  });
});

describe('redaction — `params` masqué par NOM de champ (la seconde ceinture)', () => {
  it('déclare `params` dans la politique de masquage', () => {
    expect(CHAMPS_MASQUES_JOURNAL).toContain('params');
  });

  it('masque le tableau positionnel exposé par une erreur de requête', () => {
    const masque = assainirJournal({
      params: ['0199-uuid', 'Sophie Bernard', '12'],
      query: 'insert into "org_units" values ($1,$2,$3)',
    });

    expect(masque).toEqual({
      params: CENSEUR_JOURNAL,
      // La requête SURVIT : identifiants SQL et emplacements numérotés seulement.
      query: 'insert into "org_units" values ($1,$2,$3)',
    });
  });

  it('masque `params` par le censeur que pino appelle réellement', () => {
    const censure = OPTIONS_REDACTION_JOURNAL.censor(['Sophie Bernard', '12'], ['params']);
    expect(JSON.stringify(censure)).not.toContain('Sophie Bernard');
  });

  it('nettoie le message ET masque les paramètres sur une même erreur sérialisée', () => {
    // Ce que pino remet réellement au censeur : le message aplati par son
    // sérialiseur d'erreur, ET les propriétés propres de l'erreur. Une seule des
    // deux ceintures laisserait passer l'autre moitié.
    const journalise = JSON.stringify(
      assainirJournal({
        err: {
          message: messageDrizzle('0199-uuid,Sophie Bernard,12'),
          query: 'insert into "org_units" values ($1,$2,$3)',
          params: ['0199-uuid', 'Sophie Bernard', '12'],
        },
      }),
    );

    expect(journalise).not.toContain('Sophie Bernard');
    expect(journalise).toContain('org_units');
  });
});

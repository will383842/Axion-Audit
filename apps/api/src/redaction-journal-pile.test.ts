// =============================================================================
// F-20 — LA CELLULE PIÉGÉE : ON NE BORNE JAMAIS UN MASQUAGE PAR UN MOTIF QUE LA
// DONNÉE PEUT CONTENIR.
//
// ── QUI ÉCRIT CE FICHIER, ET POURQUOI CE N'EST PAS L'AUTEUR DU CORRECTIF ─────
// 09 §5.6. `packages/shared/src/redaction.ts` a été corrigé par A15 dans `58231bb`
// (`RX_DRIZZLE_PARAMS` masque jusqu'à la fin de la chaîne, `nettoyerPileJournal`
// récupère les trames par la LONGUEUR du message). Ce fichier est écrit par A16
// (testeur) sur la SEULE base de la sonde d'A51 recopiée dans `DECISIONS.md` du
// 2026-09-02 : « `RX_DRIZZLE_PARAMS` s'arrête sur `\n    at ` — un terminateur
// qu'une cellule CSV entre guillemets peut contenir (retour à la ligne admis,
// RFC 4180), et tout ce qui suit repart EN CLAIR au journal ».
//
// ── CE QU'IL AJOUTE À `packages/shared/src/redaction.test.ts` ───────────────
// Là-bas, les sondes appellent `nettoyerTexteJournal` / `nettoyerPileJournal`
// DIRECTEMENT. Ici, rien n'est appelé à la main : on journalise `{ err }` avec un
// PINO RÉEL portant la politique de production, sur une `Error` dont la pile est
// celle que V8 a réellement construite. C'est le chemin exact de la fuite —
// sérialiseur d'erreur de pino, PUIS censure — et c'est le seul endroit où il
// s'éprouve. `packages/shared` ne dépend pas de pino (11 §1) : ce fichier ne peut
// donc pas vivre ailleurs qu'ici.
//
// ── LES DEUX MOITIÉS SONT ASSÉRÉES ENSEMBLE, ET C'EST LE POINT ──────────────
// « Rien ne fuit » se satisferait d'un journal qui masquerait TOUT, piles
// comprises — et 06 §10.2 exige un journal diagnosticable. Chaque cas porte donc
// son TÉMOIN : une trame RÉELLE de ce fichier doit survivre dans la même ligne.
// Un test qui n'assérerait que le masquage laisserait passer la faute opposée.
//
// Invariant 2 : les valeurs piégées sont des libellés factices, jamais un client.
// Traçabilité : E33 (sécurité / RGPD), E42 (RGPD renforcé), E46 (import CSV §35.2)
// · CLAUDE.md §2 (« aucune donnée personnelle dans les logs »).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { pino, type Logger } from 'pino';
import { OPTIONS_REDACTION_JOURNAL } from '@axion/shared';
import { z } from 'zod';

/**
 * Les valeurs que le journal ne doit JAMAIS porter. Aucune n'est auto-descriptive
 * — ni arobase, ni préfixe, ni forme — pour la raison qu'A51 oppose au masquage
 * par nom de champ : devant un tableau positionnel, il n'a rien à quoi se
 * raccrocher. Une adresse e-mail passerait au vert grâce au motif des e-mails,
 * sans rien prouver du gabarit.
 */
const NOM = 'Sophie Bernard';
const SECRET = 'VALEUR-SENTINELLE-42';

/**
 * LA CELLULE PIÉGÉE, littéralement celle de la sonde A51. `analyserCsvArbre`
 * admet le saut de ligne dans une cellule entre guillemets (RFC 4180) : le nom
 * d'une unité peut donc contenir ce qui RESSEMBLE à une trame de pile. Avec
 * l'ancien terminateur, le masquage s'arrêtait ICI, et tout ce qui suit repartait
 * en clair.
 */
const CELLULE_PIEGEE = `Direction factice\n    at feint (/app/x.js:1:1)\n${NOM},${SECRET}`;

/** Le message exact d'une `DrizzleQueryError` : requête, puis `params:`. */
function messageDrizzle(valeurs: string): string {
  return (
    'Failed query: insert into "org_units" ("id","mission_id","name","headcount") ' +
    'values ($1,$2,$3,$4)\nparams: ' +
    valeurs
  );
}

const schemaLigne = z.object({
  level: z.number(),
  msg: z.string(),
  err: z.object({ type: z.string(), message: z.string(), stack: z.string() }).optional(),
});

interface Banc {
  readonly journal: Logger;
  readonly sortie: () => string;
}

/** Une instance pino NUE portant EXACTEMENT la politique de production. */
function banc(): Banc {
  const bouts: string[] = [];
  const journal = pino(
    {
      level: 'trace',
      redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
    },
    {
      write(morceau: string): void {
        bouts.push(morceau);
      },
    },
  );
  return { journal, sortie: () => bouts.join('') };
}

describe('journal — une fausse trame glissée dans une donnée ne termine pas le masquage (A51, F-20)', () => {
  it('@critique une `Error` réelle dont le message porte la cellule piégée ne fuit pas', () => {
    // La pile est celle de V8, pas une chaîne fabriquée : `new Error` ici, dans ce
    // fichier, produit un `stack` qui commence par « Error: <message> » puis porte
    // les trames de ce test. C'est ce couple-là que pino sérialise.
    const { journal, sortie } = banc();
    const erreur = new Error(messageDrizzle(`0199-uuid,${CELLULE_PIEGEE},12`));

    journal.error({ err: erreur }, 'Erreur interne');

    const brut = sortie();
    expect(brut, 'le nom placé APRÈS la fausse trame ne doit pas atteindre le journal').not.toContain(
      NOM,
    );
    expect(brut, 'ni la valeur qui le suit').not.toContain(SECRET);
    expect(brut, 'ni la fausse trame elle-même, qui est une donnée d’appelant').not.toContain(
      'feint',
    );

    // TÉMOIN — 06 §10.2 : le journal reste diagnosticable. Une trame RÉELLE de ce
    // fichier survit, et c'est ce qui distingue un masquage correct d'un journal
    // vidé de sa substance.
    const ligne = schemaLigne.parse(JSON.parse(sortie().trim().split('\n').at(-1) ?? '{}'));
    expect(ligne.err?.stack, 'les vraies trames sont conservées').toContain(
      'redaction-journal-pile.test.ts',
    );
    expect(ligne.err?.message, 'les paramètres sont annoncés masqués, pas supprimés').toContain(
      'params:',
    );
  });

  it('@critique la même cellule piégée dans une erreur DÉJÀ sérialisée ne fuit pas non plus', () => {
    // pino appelle son sérialiseur d'erreur AVANT la censure : ce qui arrive à la
    // politique n'est pas toujours une `Error` mais parfois un objet ordinaire
    // `{ type, message, stack }`. C'est un CHEMIN DISTINCT du précédent — celui que
    // le correctif a dû rattraper à part — et une seule des deux branches suffirait
    // à laisser la fuite ouverte de moitié.
    const { journal, sortie } = banc();
    const message = messageDrizzle(`0199-uuid,${CELLULE_PIEGEE},12`);

    journal.error(
      {
        err: {
          type: 'DrizzleQueryError',
          message,
          stack: `DrizzleQueryError: ${message}\n    at reel (/app/apps/api/src/db.js:42:9)`,
        },
      },
      'Erreur interne',
    );

    const brut = sortie();
    expect(brut).not.toContain(NOM);
    expect(brut).not.toContain(SECRET);
    expect(brut).not.toContain('feint');
    // TÉMOIN : la trame réelle, elle, survit — la borne est la longueur du message,
    // pas un motif que la donnée pourrait imiter.
    expect(brut, 'la trame réelle survit').toContain('db.js:42:9');
  });

  it('une cellule piégée sans donnée sensible ne vide pas la pile pour autant', () => {
    // Contre-épreuve du témoin : sans elle, une implémentation qui masquerait TOUTE
    // pile passerait les deux cas ci-dessus. On journalise ici une erreur ordinaire,
    // sans gabarit Drizzle : rien ne doit être masqué.
    const { journal, sortie } = banc();
    journal.error({ err: new Error('Rupture de connexion à la base') }, 'Erreur interne');

    const brut = sortie();
    expect(brut).toContain('Rupture de connexion');
    expect(brut).toContain('redaction-journal-pile.test.ts');
  });
});

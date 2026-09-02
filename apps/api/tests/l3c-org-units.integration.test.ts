// =============================================================================
// LOT L3 / INCRÉMENT L3c — L'ARBRE `org_units` ET SON IMPORT CSV, ÉPROUVÉS SUR UN
// POSTGRESQL RÉEL.
//
// `GET|POST /v1/missions/:id/org-units` · `PATCH /v1/org-units/:id` ·
// `POST /v1/missions/:id/org-units/import` (+ `?verification=true`) ·
// `POST /v1/org-units/:id/validate` · `POST /v1/org-units/:id/merge`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRIT AVANT LE CODE (TDD, 09 §3 étape 2 · 09 §5.6). CE FICHIER NE DÉCALQUE RIEN.
// ═══════════════════════════════════════════════════════════════════════════════
// Aucune ligne de `apps/api/src/domaines/org-units/**` ni de
// `apps/api/src/routes/org-units.ts` n'existait au moment d'écrire ceci, et aucune
// n'a été lue. Les attentes viennent EXCLUSIVEMENT de :
//   · 03 §35.2 — format du CSV de l'arbre, NORMATIF, transcrit colonne par colonne
//     dans `COLONNES_35_2` ci-dessous ;
//   · 03 §25.3 — proposition d'unité depuis le terrain (statuts `proposee` /
//     `fusionnee`, valider / fusionner, ré-rattachement automatique des entretiens) ;
//   · 03 §26.3 et 04 (table `org_units`) — les SEPT `kind`, jusqu'à `poste` ;
//   · 03 §34.1 / §34.3 — matrice d'accès (« la console est ADMIN SEUL » en V1 ;
//     le LEAD qualifie les unités proposées de SA mission) ;
//   · 11 §3 — format d'erreur unique, keyset partout, camelCase en TS ;
//   · `docs/conception/LOT_L3.md` §2 (curseur `org_units` = `position,id`), §3c
//     (import en DEUX PASSES), §3e (fusion sans perte) ;
//   · `DECISIONS.md` 2026-08-29 « Les quatre codes d'erreur du lot » et « Les
//     quatre routes hors §8/§24.2 » — arbitrages d'A01 qui FONT FOI ici ;
//   · 07, ligne L3, critère d'acceptation n° 1 : « Import CSV de l'arbre conforme
//     au format §35.2 (atomique + rapport d'erreurs) ».
//
// Le format §35.2 est TRANSCRIT, jamais importé de `@axion/shared` : importer la
// liste du code testé ferait passer ce fichier quelle que soit la liste, y compris
// fausse. Une divergence entre le pack et le code DOIT faire rougir la suite.
//
// ── LES SIX PIÈGES QUE CE FICHIER FERME, ET POURQUOI CHACUN EXISTE ───────────
//
// ① « ATOMIQUE » N'EST PAS « ARRÊT À LA PREMIÈRE ERREUR ». Un fichier à UNE seule
//    erreur ne distingue pas les deux mondes : les deux refusent tout. Le fichier
//    d'atomicité porte donc QUATRE erreurs, sur QUATRE lignes ÉLOIGNÉES et QUATRE
//    colonnes différentes — dont la DERNIÈRE ligne du fichier. Une implémentation
//    qui s'arrêterait à la première n'en rapporterait qu'une, et rougirait.
// ② « ATOMIQUE » N'EST PAS NON PLUS « ROLLBACK APRÈS COUP ». Cent lignes, l'erreur
//    en 74ᵉ ligne de tableur : une implémentation qui insère ligne à ligne, ou qui
//    commet par lots de 50, laisse des unités derrière elle. Le test relit
//    `count(*) FROM org_units` — PAS la réponse HTTP.
// ③ « TOUT REFUSER » PASSE TOUS LES TESTS DE REFUS. Chaque refus a donc sa
//    contre-épreuve : le MÊME fichier, ses quatre défauts corrigés, DOIT s'importer,
//    et les colonnes écrites sont relues une à une en base.
// ④ UN NUMÉRO DE LIGNE FAUX EST PIRE QU'ABSENT. Les refs du fichier d'épreuve sont
//    ALPHABÉTIQUES (`uaa`…`udv`) et les noms sans un seul chiffre : le SEUL nombre
//    qu'une entrée de rapport peut contenir est son numéro de ligne. Une assertion
//    « le rapport mentionne 74 » ne peut donc pas passer par hasard.
// ⑤ UN MODE À BLANC QUI MENT EST PIRE QU'ABSENT. Il ne suffit pas qu'il n'écrive
//    rien : il doit annoncer EXACTEMENT ce que l'import réel ferait. Les deux
//    passages tournent donc sur le MÊME fichier et leurs rapports sont comparés
//    couple (ligne, colonne) par couple (ligne, colonne).
// ⑥ « RIEN N'EST JAMAIS SILENCIEUSEMENT ÉCRASÉ NI SUPPRIMÉ » (invariant 7). Une
//    unité fusionnée doit DISPARAÎTRE DE L'ARBRE ACTIF tout en SURVIVANT EN BASE.
//    Les deux moitiés sont assérées ensemble : chacune seule laisse passer la
//    faute opposée.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit plutôt que sous-entendu ─────────────
//   · rien sur le fuseau d'AFFICHAGE (§22.2) : `timezone` est vérifiée comme
//     DONNÉE (vide = héritage, donc NULL en base), jamais comme rendu ;
//   · rien sur un fichier mal ENCODÉ (latin-1, octets invalides) : le transport
//     retenu est du JSON, qui ne peut pas porter d'octets non-UTF-8. C'est une
//     conséquence assumée de l'hypothèse d'interface, pas un oubli — voir
//     `TRANSPORT_IMPORT` ;
//   · rien sur la COHÉRENCE `kind`/parent (un `poste` peut-il porter un `service` ?)
//     : ni §35.2, ni §26.3, ni le 04 ne définissent d'ordre entre les sept valeurs.
//     La note de conception l'invente ; un test ne devine pas ;
//   · rien sur les performances de l'import (aucune durée mesurée : un seuil de
//     temps est intermittent en CI, et une suite intermittente finit ignorée).
//
// Invariant 2 : toutes les fixtures portent des libellés NEUTRES. L'exemple CSV du
// §35.2 est recopié SANS ses noms — le pack lui-même y nomme un client.
// Traçabilité : E46 (format CSV d'import d'arbre, §35), E19 (avant-vente : cadrage
// de l'étendue — entreprise complète / services / filiales), E43 (conventions d'API
// épinglées), E21 (auditeurs : jamais accès aux montants, RBAC testé), E45 (pouvoirs
// du lead énumérés), E31 (aucune référence client), E33 (sécurité/RGPD)
// · critère d'acceptation n° 1 du 07, ligne L3.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
import {
  balayerSentinellesFinancieres,
  decrireRapport,
  detecterSentinelles,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
} from './aide/sentinelle-financiere.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '5c'.repeat(32);
const SECRET_RAFRAICHISSEMENT = 'a7'.repeat(32);
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';

const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l3c@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// =============================================================================
// LE FORMAT §35.2 — TRANSCRIT DU PACK, COLONNE PAR COLONNE, DANS SON ORDRE
// =============================================================================
// « UTF-8, séparateur `;` (ou `,` détecté), en-têtes OBLIGATOIRES, import ATOMIQUE
//   (une erreur = rien d'importé + rapport d'erreurs ligne par ligne). Colonnes :
//   `ref` (identifiant de ligne, libre, unique) · `name`* · `kind`*
//   (groupe|filiale|etablissement|direction|service|equipe|poste) · `parent_ref`
//   (vide = racine) · `country_code` · `headcount` · `service_code` (taxonomie des
//   11 fonctions, fichier 11 §5) · `sector_code` · `timezone` (vide = héritage). »
//
// NEUF colonnes, dans CET ordre. L'étoile du pack marque `name` et `kind` comme
// obligatoires EN VALEUR ; `ref` ne porte pas d'étoile mais est structurellement
// indispensable (c'est la cible de `parent_ref`), et le pack l'écrit en tête de son
// exemple. Ce fichier traite donc `ref`, `name` et `kind` comme des valeurs dues.
const COLONNES_35_2 = [
  'ref',
  'name',
  'kind',
  'parent_ref',
  'country_code',
  'headcount',
  'service_code',
  'sector_code',
  'timezone',
] as const;

type Colonne35_2 = (typeof COLONNES_35_2)[number];
type LigneCsv = Partial<Record<Colonne35_2, string>>;

/**
 * Les SEPT `kind`, dans l'ordre du §35.2 et du `CHECK` du 04. `poste` est le
 * dernier — et c'est nommément ce que le brief du lot exige (« `kind` jusqu'à
 * `poste` ») : une implémentation qui s'arrêterait à `equipe` doit rougir.
 */
const KINDS_35_2 = [
  'groupe',
  'filiale',
  'etablissement',
  'direction',
  'service',
  'equipe',
  'poste',
] as const;

/**
 * Le BOM UTF-8 qu'un tableur FR pose en tête de tout CSV. Construit par son point
 * de code plutôt qu'écrit tel quel : un caractère INVISIBLE en dur dans un source
 * est exactement ce que `no-irregular-whitespace` existe pour empêcher — et il
 * survivrait mal à un copier-coller entre éditeurs.
 */
const BOM_UTF8 = String.fromCharCode(0xfe_ff);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HYPOTHÈSE D'INTERFACE N° 1 — LE TRANSPORT DE L'IMPORT. À LIRE AVANT DE DÉBOGUER.
 * ═══════════════════════════════════════════════════════════════════════════════
 * NI le pack NI la note de conception ne disent COMMENT le fichier arrive à la
 * route. Trois formes étaient plausibles : `multipart/form-data`, un corps brut
 * `text/csv`, ou du JSON portant le contenu en chaîne.
 *
 * JSON est retenu, et le motif est mesurable plutôt que de goût : `@fastify/multipart`
 * N'EST PAS installé dans `apps/api/package.json` (relevé le 2026-09-01), tandis que
 * 11 §3 impose que « chaque route déclare son schéma Zod in/out ». Un corps brut
 * `text/csv` sortirait de ce cadre ; le multipart exigerait d'ajouter une dépendance.
 *
 * ⚠ SI L'IMPLÉMENTEUR A CHOISI AUTREMENT, ce n'est PAS un défaut du produit : c'est
 * une ambiguïté de spécification, remontée comme telle dans le rapport A16. Une
 * SEULE fonction de ce fichier change alors — `corpsImport` ci-dessous — et rien
 * d'autre. Le test « le transport de l'import est celui-ci » existe pour rendre ce
 * diagnostic immédiat au lieu de le faire découvrir à travers quinze échecs.
 */
const TRANSPORT_IMPORT = 'application/json — { csv: <contenu du fichier> }';

function corpsImport(contenu: string): Readonly<Record<string, unknown>> {
  return { csv: contenu };
}

/** Échappement RFC 4180, appliqué au séparateur RÉELLEMENT utilisé par la fixture. */
function cellule(valeur: string, separateur: string): string {
  const doitProteger = valeur.includes('"') || /[\r\n]/.test(valeur) || valeur.includes(separateur);
  return doitProteger ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

interface OptionsCsv {
  /** `;` par défaut — le séparateur nommé en premier par le §35.2. */
  readonly separateur?: string;
  /** BOM en tête : ce qu'écrit un tableur FR. Vrai par défaut, comme la réalité. */
  readonly bom?: boolean;
  /** Fin de ligne. CRLF par défaut : ce qu'écrit un tableur FR. */
  readonly finDeLigne?: string;
  /** Colonnes réellement écrites — sert aux cas « colonne manquante » et « ordre ». */
  readonly colonnes?: readonly Colonne35_2[];
  /** Saut de ligne final : un tableur en pose un. Vrai par défaut. */
  readonly sautFinal?: boolean;
}

/** Fabrique un CSV §35.2. Les valeurs par défaut sont celles d'un vrai tableur FR. */
function fichierCsv(lignes: readonly LigneCsv[], options: OptionsCsv = {}): string {
  const separateur = options.separateur ?? ';';
  const finDeLigne = options.finDeLigne ?? '\r\n';
  const colonnes = options.colonnes ?? COLONNES_35_2;
  const entete = colonnes.join(separateur);
  const corps = lignes.map((ligne) =>
    colonnes.map((colonne) => cellule(ligne[colonne] ?? '', separateur)).join(separateur),
  );
  const tete = (options.bom ?? true) ? BOM_UTF8 : '';
  const queue = (options.sautFinal ?? true) ? finDeLigne : '';
  return `${tete}${[entete, ...corps].join(finDeLigne)}${queue}`;
}

// -----------------------------------------------------------------------------
// REFS ET NOMS SANS UN SEUL CHIFFRE — piège ④ de l'en-tête
// -----------------------------------------------------------------------------
// Le rapport d'erreurs doit nommer LA LIGNE. Pour qu'une assertion « le rapport
// mentionne 74 » ne puisse pas passer par accident, aucune autre valeur de la
// fixture ne doit contenir de chiffre : refs alphabétiques, noms alphabétiques,
// `headcount` laissé VIDE partout où le test lit un numéro de ligne.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function refAlphabetique(index: number): string {
  const haut = ALPHABET[Math.floor(index / ALPHABET.length)];
  const bas = ALPHABET[index % ALPHABET.length];
  if (haut === undefined || bas === undefined) throw new Error('index de ref hors alphabet');
  return `u${haut}${bas}`;
}

function nomDepuisRef(ref: string): string {
  return `Unité factice ${ref.toUpperCase()}`;
}

/**
 * Numéro de ligne TABLEUR d'un enregistrement : l'en-tête est la ligne 1, donc le
 * n-ième enregistrement (0-indexé) est la ligne n+2.
 *
 * ── POURQUOI CETTE NUMÉROTATION, ET NON L'INDEX D'ENREGISTREMENT ─────────────
 * §35.2 dit « rapport d'erreurs ligne par ligne » sans trancher la convention.
 * Le précédent MAISON tranche : `l4-import-banque.integration.test.ts` exige
 * explicitement « le numéro attendu est celui du TABLEUR, pas celui de
 * l'enregistrement », parce qu'un rapport sert à corriger un fichier OUVERT DANS UN
 * TABLEUR. Deux imports du même produit qui numéroteraient différemment seraient un
 * défaut à eux seuls. AMBIGUÏTÉ REMONTÉE dans le rapport A16.
 */
function ligneTableur(indexEnregistrement: number): number {
  return indexEnregistrement + 2;
}

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// APPELS HTTP
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
}

/**
 * L'enveloppe d'erreur du 11 §3, RÉÉCRITE ici plutôt qu'importée de
 * `@axion/shared` : demander au sujet de valider sa propre réponse laisserait
 * disparaître une clé des deux côtés le même jour.
 *
 * `details[].code` est déclaré OPTIONNEL parce que l'arbitrage du 2026-08-29 l'ajoute
 * à `errorDetailSchema` pour le rapport d'import — et qu'il n'existait pas encore
 * dans `packages/shared/src/errors.ts` au moment d'écrire ce fichier (relevé le
 * 2026-09-01). Il est DÛ à ce lot ; son absence est remontée au rapport A16.
 */
const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.looseObject({ path: z.string(), message: z.string(), code: z.string().optional() }))
      .optional(),
  }),
});

/**
 * Une adresse par appel — le quota global (300 req/min, 11 §3) est clé sur le sujet
 * du jeton, ou sur `request.ip` en repli. Sans adresse distincte, l'ORDRE des `it`
 * déciderait des verdicts, et une suite dont le résultat dépend de son ordre ne
 * prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.61.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

type MethodeTestee = 'GET' | 'POST' | 'PATCH';

async function appeler(
  methode: MethodeTestee,
  url: string,
  options: { readonly jeton?: string; readonly charge?: Readonly<Record<string, unknown>> } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
    ...(options.charge === undefined ? {} : { payload: options.charge }),
  });

  let code: string | null = null;
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(analyserJson(reponse.body));
    if (analyse.success) code = analyse.data.error.code;
  }
  return { statut: reponse.statusCode, code, corps: reponse.body };
}

/** `JSON.parse` qui rend `undefined` au lieu de lever — le corps peut ne pas être du JSON. */
function analyserJson(texte: string): unknown {
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    return undefined;
  }
}

// =============================================================================
// LECTURE TOLÉRANTE DU RAPPORT D'ERREURS — ET POURQUOI ELLE EST TOLÉRANTE
// =============================================================================
// §35.2 impose le CONTENU du rapport (« ligne par ligne »), et l'arbitrage du
// 2026-08-29 impose sa forme logique (`{ligne, colonne, code, message}` porté par
// `details[]`). Aucun des deux ne fixe le NOM des clés ni la mise en forme du
// `path`. Un test qui exigerait `details[0].path === 'ligne 74, colonne kind'`
// n'éprouverait plus la spécification : il éprouverait une convention qu'il aurait
// lui-même inventée, et rougirait sur une implémentation parfaitement conforme.
//
// On lit donc les ENTRÉES du rapport, où qu'elles soient dans le corps (`details[]`
// d'une erreur 422, ou tableau du corps de succès d'un passage à blanc), et on
// éprouve ce que la spécification EXIGE VRAIMENT : que chaque entrée nomme sa ligne,
// sa colonne et une raison.
//
// CE QUE CETTE TOLÉRANCE NE COÛTE PAS : les assertions restent DISCRIMINANTES parce
// qu'elles portent sur des COMPTES EXACTS (« exactement quatre entrées »), sur des
// couples (ligne, colonne) précis, ET sur l'absence de mention des lignes SAINES.
// Un rapport vide, un rapport à une seule entrée, un rapport qui dénoncerait une
// ligne valide : les trois rougissent.

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/**
 * Toutes les entrées de rapport du corps : chaque objet ÉLÉMENT D'UN TABLEAU, rendu
 * sous sa forme JSON. Un rapport est nécessairement une liste d'objets — c'est la
 * seule chose que la spécification impose de sa structure.
 */
function entreesDeRapport(corps: string): string[] {
  const entrees: string[] = [];
  const visiter = (valeur: unknown, elementDeTableau: boolean): void => {
    if (Array.isArray(valeur)) {
      for (const element of valeur) visiter(element, true);
      return;
    }
    if (!estObjet(valeur)) return;
    if (elementDeTableau) entrees.push(JSON.stringify(valeur));
    for (const sousValeur of Object.values(valeur)) visiter(sousValeur, false);
  };
  visiter(analyserJson(corps), false);
  return entrees;
}

/**
 * Le nombre `n` apparaît-il dans le texte SANS être un morceau d'un nombre plus
 * long ? `74` ne doit pas être trouvé dans `1074` — sans quoi le contrôle de
 * numérotation de ligne deviendrait décoratif.
 */
function mentionneNombre(texte: string, n: number): boolean {
  return new RegExp(`(?<!\\d)${String(n)}(?!\\d)`).test(texte);
}

/** Une entrée qui nomme À LA FOIS sa ligne et sa colonne — les deux, jamais l'une. */
function entreeNommant(entrees: readonly string[], ligne: number, colonne: string): boolean {
  return entrees.some((entree) => mentionneNombre(entree, ligne) && entree.includes(colonne));
}

/** Les couples (ligne, colonne) qu'un rapport dénonce, pour la liste attendue donnée. */
function couplesDenonces(
  entrees: readonly string[],
  candidats: readonly { readonly ligne: number; readonly colonne: string }[],
): string[] {
  return candidats
    .filter((candidat) => entreeNommant(entrees, candidat.ligne, candidat.colonne))
    .map((candidat) => `ligne ${String(candidat.ligne)} / ${candidat.colonne}`)
    .sort();
}

/** Tous les nombres du corps, valeurs numériques ET chaînes purement numériques. */
function nombresDuCorps(corps: string): number[] {
  const nombres: number[] = [];
  const visiter = (valeur: unknown): void => {
    if (typeof valeur === 'number') {
      nombres.push(valeur);
      return;
    }
    if (typeof valeur === 'string') {
      if (/^\d+$/.test(valeur)) nombres.push(Number(valeur));
      return;
    }
    if (Array.isArray(valeur)) {
      for (const element of valeur) visiter(element);
      return;
    }
    if (estObjet(valeur)) for (const sousValeur of Object.values(valeur)) visiter(sousValeur);
  };
  visiter(analyserJson(corps));
  return nombres;
}

// =============================================================================
// LE CONTRAT DE SORTIE D'UNE UNITÉ — le NOYAU SÉMANTIQUE, pas la forme complète
// =============================================================================
// Cinq champs sont exigés, et chacun pour une raison qui se dit :
//   · `id`    — sans lui rien n'est adressable ;
//   · `name`, `kind` — les deux colonnes étoilées du §35.2 ;
//   · `parentId` — sans lui l'arbre n'est pas un arbre, c'est une liste ;
//   · `status` — sans lui la console ne peut pas qualifier une unité proposée
//     (§25.3), et une unité `proposee` deviendrait indiscernable d'une `active`.
// Le reste (`inScope`, `position`, `headcount`, `serviceRefId`, `sectorId`,
// `timezone`, `countryCode`, horodatages) n'est pas exigé de la RÉPONSE : le pack ne
// fixe pas la forme de sortie de cette ressource, et l'inventer ferait rougir une
// implémentation conforme. Ces colonnes-là sont relues EN BASE, qui est de toute
// façon la seule vérité sur ce qui a été écrit.
const uniteSchema = z.looseObject({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(KINDS_35_2),
  parentId: z.uuid().nullable(),
  status: z.enum(['active', 'proposee', 'fusionnee']),
});
type Unite = z.infer<typeof uniteSchema>;

/** Enveloppe de page du 11 §3 — convention de dépôt, pas invention de ce fichier. */
const pageUnitesSchema = z.object({
  items: z.array(uniteSchema),
  nextCursor: z.string().nullable(),
});

/**
 * Extrait l'unité d'une réponse — À LA RACINE, ou dans une enveloppe à une clé.
 *
 * ── POURQUOI CETTE TOLÉRANCE, ET CE QU'ELLE NE RELÂCHE PAS ──────────────────
 * `POST /v1/companies` (L3a) rend `{ company, secteurAQualifier,
 * doublonsNomPossibles }` : l'enveloppe existe dans ce dépôt, parce que la création
 * y transporte un AVERTISSEMENT. Rien ne dit si `org_units` en aura une. Exiger la
 * racine ferait rougir une implémentation qui envelopperait, exiger l'enveloppe
 * ferait rougir celle qui n'enveloppe pas : dans les deux cas, le test aurait
 * tranché une question que le pack laisse ouverte.
 *
 * Ce qui n'est PAS relâché : les cinq champs du noyau sémantique restent exigés, où
 * qu'ils soient. Une réponse qui ne porterait pas de `status` échoue ici, enveloppe
 * ou pas.
 */
function unite(reponse: Reponse): Unite {
  const racine = analyserJson(reponse.corps);
  const directe = uniteSchema.safeParse(racine);
  if (directe.success) return directe.data;
  if (estObjet(racine)) {
    for (const valeur of Object.values(racine)) {
      const enveloppee = uniteSchema.safeParse(valeur);
      if (enveloppee.success) return enveloppee.data;
    }
  }
  throw new Error(
    'La réponse ne porte aucune unité reconnaissable. Les cinq champs du noyau\n' +
      'sémantique sont dus (id, name, kind, parentId, status), à la racine ou dans\n' +
      `une enveloppe à une clé.\nCorps reçu : ${reponse.corps}`,
  );
}

function page(reponse: Reponse): z.infer<typeof pageUnitesSchema> {
  return pageUnitesSchema.parse(analyserJson(reponse.corps));
}

// =============================================================================
// COMPTES, MISSIONS, UNITÉS — semés PAR SQL, jamais par la route testée
// =============================================================================
// Fabriquer l'état par SQL est une fabrication d'ÉTAT, jamais de RÉSULTAT : la
// route `POST /v1/missions` appartient à l'incrément L3b, qui n'existait pas au
// moment d'écrire ceci. Semer par SQL évite d'ancrer cette suite à un incrément
// voisin — et évite qu'un défaut de L3b fasse rougir L3c.

type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte et frappe son jeton d'accès, sans passer par `/v1/auth/login` :
 * le quota de 10 req/min/IP de `/v1/auth/*` ferait dépendre cette suite d'un plafond
 * qui ne la concerne pas, et chaque connexion coûte une dérivation Argon2id. Le
 * jeton est signé par `app.jwt.sign`, donc par LA MÊME clé que la route de
 * connexion ; le crochet ③ relit le rôle EN BASE, rien n'est court-circuité.
 */
async function creerCompte(role: RoleUtilisateur, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [id, `Compte ${suffixe}`, `compte.l3c.${suffixe}@exemple.test`, role],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurMission = 0;

/** Sème entreprise + mission, ARBRE VIDE. Rend l'identifiant de la mission. */
async function semerMission(marqueur: string, createur: string): Promise<string> {
  compteurMission += 1;
  const suffixe = `${marqueur}-${String(compteurMission)}`;
  const entrepriseId = uuidv7();
  await bd().query(`INSERT INTO companies (id, name) VALUES ($1, $2)`, [
    entrepriseId,
    `Entreprise factice ${suffixe}`,
  ]);
  const missionId = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                           timezone, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'diagnostic_cadrage', 'preparation',
             'Europe/Paris', $4, now(), now())`,
    [missionId, entrepriseId, `Mission factice ${suffixe}`, createur],
  );
  return missionId;
}

async function affecter(
  missionId: string,
  utilisateurId: string,
  role: RoleSurMission,
): Promise<void> {
  await bd().query(
    `INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)`,
    [missionId, utilisateurId, role],
  );
}

interface SemisUnite {
  readonly missionId: string;
  readonly nom: string;
  readonly kind?: (typeof KINDS_35_2)[number];
  readonly parentId?: string | null;
  readonly status?: 'active' | 'proposee' | 'fusionnee';
  readonly position?: number | null;
  readonly proposePar?: string | null;
}

/** Sème une unité directement en base et rend son identifiant (UUID v7 CLIENT). */
async function semerUnite(semis: SemisUnite): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, status, position,
                            proposed_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      semis.missionId,
      semis.parentId ?? null,
      semis.kind ?? 'service',
      semis.nom,
      semis.status ?? 'active',
      semis.position ?? null,
      semis.proposePar ?? null,
    ],
  );
  return id;
}

// -----------------------------------------------------------------------------
// LECTURES DIRECTES — la seule vérité sur ce que la base contient
// -----------------------------------------------------------------------------

async function compterUnitesDeLaMission(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM org_units WHERE mission_id = $1',
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterToutesLesUnites(): Promise<number> {
  const resultat = await bd().query<{ total: string }>('SELECT count(*) AS total FROM org_units');
  return Number(resultat.rows[0]?.total ?? '0');
}

interface LigneUnite {
  readonly id: string;
  readonly parent_id: string | null;
  readonly kind: string;
  readonly name: string;
  readonly country_code: string | null;
  readonly timezone: string | null;
  readonly headcount: number | null;
  readonly service_ref_id: string | null;
  readonly sector_id: string | null;
  readonly in_scope: boolean;
  readonly status: string;
  readonly proposed_by: string | null;
  readonly merged_into_id: string | null;
  readonly position: number | null;
}

async function lireUnites(missionId: string): Promise<LigneUnite[]> {
  const resultat = await bd().query<LigneUnite>(
    `SELECT id, parent_id, kind, name, country_code, timezone, headcount, service_ref_id,
            sector_id, in_scope, status, proposed_by, merged_into_id, position
       FROM org_units WHERE mission_id = $1 ORDER BY name`,
    [missionId],
  );
  return resultat.rows;
}

async function lireUnite(id: string): Promise<LigneUnite | undefined> {
  const resultat = await bd().query<LigneUnite>(
    `SELECT id, parent_id, kind, name, country_code, timezone, headcount, service_ref_id,
            sector_id, in_scope, status, proposed_by, merged_into_id, position
       FROM org_units WHERE id = $1`,
    [id],
  );
  return resultat.rows[0];
}

/**
 * Photographie EXACTE d'un arbre : tout ce qui pourrait bouger, sérialisé et trié.
 * Comparer deux photographies prouve qu'un refus n'a RIEN touché — pas seulement
 * qu'il n'a rien ajouté. Une unité renommée puis refusée passerait un simple
 * `count(*)`.
 */
async function photographierArbre(missionId: string): Promise<string> {
  const lignes = await lireUnites(missionId);
  return JSON.stringify(lignes);
}

async function idService(code: string): Promise<string> {
  const resultat = await bd().query<{ id: string }>('SELECT id FROM services WHERE code = $1', [
    code,
  ]);
  const trouve = resultat.rows[0]?.id;
  if (trouve === undefined) throw new Error(`fonction « ${code} » absente du seed`);
  return trouve;
}

async function idSecteur(code: string): Promise<string> {
  const resultat = await bd().query<{ id: string }>('SELECT id FROM sectors WHERE code = $1', [
    code,
  ]);
  const trouve = resultat.rows[0]?.id;
  if (trouve === undefined) throw new Error(`secteur « ${code} » absent du seed`);
  return trouve;
}

/** Le journal complet, sérialisé — pour prouver ce qui N'Y EST PAS. */
async function journalSerialise(): Promise<string> {
  const resultat = await bd().query<Record<string, unknown>>('SELECT * FROM activity_log');
  return JSON.stringify(resultat.rows);
}

async function compterEntreesJournal(entiteId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM activity_log WHERE entity_id = $1',
    [entiteId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

// -----------------------------------------------------------------------------
// RACCOURCIS D'APPEL
// -----------------------------------------------------------------------------

function urlListe(missionId: string): string {
  return `/v1/missions/${missionId}/org-units`;
}

function urlImport(missionId: string, aBlanc = false): string {
  return `/v1/missions/${missionId}/org-units/import${aBlanc ? '?verification=true' : ''}`;
}

async function importer(
  missionId: string,
  contenu: string,
  options: { readonly jeton: string; readonly aBlanc?: boolean },
): Promise<Reponse> {
  return appeler('POST', urlImport(missionId, options.aBlanc ?? false), {
    jeton: options.jeton,
    charge: corpsImport(contenu),
  });
}

/** Parcourt TOUTES les pages et rend les identifiants, dans l'ordre de lecture. */
async function tousLesIdentifiants(
  missionId: string,
  jeton: string,
  limite: number,
): Promise<string[]> {
  const identifiants: string[] = [];
  let curseur: string | null = null;
  for (let garde = 0; garde < 100; garde += 1) {
    const url =
      curseur === null
        ? `${urlListe(missionId)}?limit=${String(limite)}`
        : `${urlListe(missionId)}?limit=${String(limite)}&after=${encodeURIComponent(curseur)}`;
    const reponse = await appeler('GET', url, { jeton });
    expect(reponse.statut, `lecture de page refusée : ${reponse.corps}`).toBe(200);
    const lue = page(reponse);
    identifiants.push(...lue.items.map((item) => item.id));
    curseur = lue.nextCursor;
    if (curseur === null) return identifiants;
  }
  throw new Error('la pagination ne s’est pas terminée en 100 pages');
}

// -----------------------------------------------------------------------------
// UUID v7 — le contrôle de version, écrit ICI et non emprunté au code testé
// -----------------------------------------------------------------------------

/**
 * Vrai si `valeur` est un UUID de VERSION 7 et de variante RFC 4122.
 *
 * Invariant 1 / P1-4 : `org_units` est une entité CRÉABLE HORS LIGNE (§25.3), donc
 * son identifiant est un UUID v7 généré côté APPLICATIF. Un `DEFAULT
 * gen_random_uuid()` posé « pour aller vite » produirait un v4 — non ordonnable,
 * donc un curseur keyset faux et un upsert de sync bancal. Le nibble de version est
 * le 13ᵉ caractère hexadécimal ; la variante occupe les deux bits de poids fort du
 * 17ᵉ.
 */
function estUuidV7(valeur: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur)) return false;
  const sansTirets = valeur.replace(/-/g, '').toLowerCase();
  const version = sansTirets[12];
  const variante = sansTirets[16];
  if (version === undefined || variante === undefined) return false;
  return version === '7' && ['8', '9', 'a', 'b'].includes(variante);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l3c_org_units');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  // Le seed est INDISPENSABLE : c'est lui qui peuple `services` (les 11 fonctions,
  // 11 §5) et `sectors`. Sans référentiel, le contrôle de `service_code` /
  // `sector_code` n'aurait rien à trouver, et le cas « code CONNU » — le seul qui
  // prouve que la table est réellement consultée — serait vert par vacuité.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = TTL_ACCES;
  process.env.JWT_REFRESH_TTL = TTL_RAFRAICHISSEMENT;
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// LE FICHIER D'ÉPREUVE — cent lignes, des refs sans un seul chiffre
// =============================================================================

const NB_LIGNES_EPREUVE = 100;

interface DefautInjecte {
  /** Index d'ENREGISTREMENT, 0-indexé. La ligne de tableur vaut `index + 2`. */
  readonly index: number;
  readonly colonne: Colonne35_2;
  readonly valeur: string;
  readonly pourquoi: string;
}

/**
 * QUATRE défauts, QUATRE colonnes, QUATRE lignes ÉLOIGNÉES — dont la DERNIÈRE du
 * fichier. C'est la disposition qui distingue « atomique » de « arrêt à la première
 * erreur » : une implémentation qui s'arrête au premier défaut n'en rapporte qu'un,
 * et une implémentation qui ne valide que les N premières lignes rate le quatrième.
 */
const DEFAUTS_EPREUVE: readonly DefautInjecte[] = [
  {
    index: 11,
    colonne: 'name',
    valeur: '',
    pourquoi: '`name` est étoilé au §35.2 : une unité sans nom n’existe pas',
  },
  {
    index: 39,
    colonne: 'parent_ref',
    valeur: 'uzz',
    pourquoi: '`parent_ref` pointe une `ref` absente du fichier — le rattachement est impossible',
  },
  {
    index: 72,
    colonne: 'kind',
    valeur: 'departement',
    pourquoi: '`kind` hors des SEPT valeurs énumérées par le §35.2',
  },
  {
    index: 99,
    colonne: 'service_code',
    valeur: 'plomberie',
    pourquoi: '`service_code` absent de la taxonomie des 11 fonctions (11 §5)',
  },
];

/** Les couples (ligne de tableur, colonne) que le rapport DOIT dénoncer. */
const COUPLES_ATTENDUS = DEFAUTS_EPREUVE.map((defaut) => ({
  ligne: ligneTableur(defaut.index),
  colonne: defaut.colonne,
}));

/**
 * Cent enregistrements : une racine et 99 services rattachés à elle. Aucun chiffre
 * nulle part — ni dans les refs, ni dans les noms, et `headcount` reste VIDE. Le
 * seul nombre qu'une entrée de rapport peut donc contenir est un numéro de ligne.
 */
function lignesEpreuve(defauts: readonly DefautInjecte[] = []): LigneCsv[] {
  const racine = refAlphabetique(0);
  const lignes: LigneCsv[] = [];
  for (let index = 0; index < NB_LIGNES_EPREUVE; index += 1) {
    const ref = refAlphabetique(index);
    lignes.push(
      index === 0
        ? { ref, name: nomDepuisRef(ref), kind: 'groupe' }
        : { ref, name: nomDepuisRef(ref), kind: 'service', parent_ref: racine },
    );
  }
  for (const defaut of defauts) {
    const ligne = lignes[defaut.index];
    if (ligne === undefined) throw new Error('défaut injecté hors du fichier');
    const modifiee: LigneCsv = { ...ligne };
    modifiee[defaut.colonne] = defaut.valeur;
    lignes[defaut.index] = modifiee;
  }
  return lignes;
}

/** Assère qu'un arbre n'a pas bougé D'UN OCTET depuis sa photographie. */
async function attendreArbreInchange(
  missionId: string,
  photoAvant: string,
  motif: string,
): Promise<void> {
  expect(await photographierArbre(missionId), motif).toBe(photoAvant);
}

// =============================================================================
// 1. LE FORMAT §35.2 — CHAQUE COLONNE ATTERRIT DANS SA COLONNE
// =============================================================================
describe('POST /v1/missions/:id/org-units/import — le format §35.2', () => {
  it('@critique un fichier conforme s’importe, et les NEUF colonnes atterrissent chacune à sa place', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // C'EST LA CONTRE-ÉPREUVE DE TOUT LE RESTE DU FICHIER (piège ③).
    // ═════════════════════════════════════════════════════════════════════════
    // Une implémentation qui REFUSERAIT TOUT passerait chacun des tests de refus de
    // cette suite. Celui-ci est le seul qui l'en empêche : il exige un import qui
    // réussit ET dont chaque cellule est relue en base, colonne par colonne.
    //
    // Il éprouve aussi le TRANSPORT (voir `TRANSPORT_IMPORT`). S'il échoue seul,
    // avec un 400 ou un 415, lire l'hypothèse d'interface n° 1 AVANT de chercher
    // ailleurs : c'est le contenu du corps de requête qui est en cause, pas l'import.
    //
    // La STRUCTURE de l'exemple du §35.2 est recopiée (groupe → filiale → service,
    // refs NUMÉRIQUES, `service_code` renseigné sur la seule feuille), mais PAS ses
    // noms : le pack y nomme un client, et l'invariant 2 l'interdit dans le code.
    // Les refs numériques ne sont pas décoratives — elles prouvent que `ref` est un
    // identifiant LIBRE, et non l'indice de la ligne.
    const admin = await creerCompte('admin', 'import-conforme');
    const missionId = await semerMission('import-conforme', admin.id);

    const contenu = fichierCsv([
      { ref: '1', name: 'Groupe factice', kind: 'groupe', country_code: 'FR', headcount: '6500' },
      {
        ref: '2',
        name: 'Filiale factice France',
        kind: 'filiale',
        parent_ref: '1',
        country_code: 'FR',
        headcount: '3200',
        sector_code: 'industrie',
      },
      {
        ref: '3',
        name: 'Feuille logistique factice',
        kind: 'service',
        parent_ref: '2',
        country_code: 'FR',
        headcount: '85',
        service_code: 'logistique_operations',
        timezone: 'Europe/Lisbon',
      },
    ]);

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(
      [200, 201],
      `L’import d’un fichier PARFAITEMENT conforme au §35.2 a été refusé.\n` +
        `Transport employé par ce test : ${TRANSPORT_IMPORT}\n` +
        `Statut ${String(reponse.statut)} · corps : ${reponse.corps}`,
    ).toContain(reponse.statut);

    const unites = await lireUnites(missionId);
    expect(unites, 'trois lignes de données, trois unités').toHaveLength(3);

    const parNom = new Map(unites.map((ligne) => [ligne.name, ligne]));
    const groupe = parNom.get('Groupe factice');
    const filiale = parNom.get('Filiale factice France');
    const feuille = parNom.get('Feuille logistique factice');
    expect(groupe, 'la racine doit exister').toBeDefined();
    expect(filiale, 'la filiale doit exister').toBeDefined();
    expect(feuille, 'la feuille doit exister').toBeDefined();
    if (groupe === undefined || filiale === undefined || feuille === undefined) return;

    // --- `kind` : les trois valeurs du fichier, non normalisées ---------------
    expect(groupe.kind).toBe('groupe');
    expect(filiale.kind).toBe('filiale');
    expect(feuille.kind).toBe('service');

    // --- `parent_ref` : « vide = racine », et la chaîne est reconstruite ------
    expect(
      groupe.parent_id,
      '§35.2 : « `parent_ref` (vide = racine) ». Une racine n’a PAS de parent — et\n' +
        'surtout pas un parent inventé (la mission elle-même, ou une racine implicite).',
    ).toBeNull();
    expect(filiale.parent_id, 'la filiale pend au groupe').toBe(groupe.id);
    expect(feuille.parent_id, 'la feuille pend à la filiale').toBe(filiale.id);

    // --- `country_code`, `headcount` -----------------------------------------
    expect(groupe.country_code).toBe('FR');
    expect(groupe.headcount).toBe(6500);
    expect(filiale.headcount).toBe(3200);
    expect(feuille.headcount).toBe(85);

    // --- `service_code` et `sector_code` : RÉSOLUS en identifiants ------------
    // Le CSV porte des CODES, la base porte des identifiants : c'est une résolution,
    // pas une recopie. Un import qui écrirait le code tel quel dans une colonne UUID
    // échouerait à l'insertion ; un import qui l'IGNORERAIT rendrait NULL sans rien
    // dire, et la feuille n'entrerait dans aucun ciblage par fonction (moteur M2).
    expect(
      feuille.service_ref_id,
      '`service_code = logistique_operations` doit être résolu en `service_ref_id`.\n' +
        'NULL ici signifie que la taxonomie des 11 fonctions n’a jamais été consultée.',
    ).toBe(await idService('logistique_operations'));
    expect(feuille.sector_id, 'aucun `sector_code` sur cette ligne').toBeNull();
    expect(filiale.sector_id, '`sector_code = industrie` doit être résolu').toBe(
      await idSecteur('industrie'),
    );
    expect(filiale.service_ref_id, 'aucun `service_code` sur cette ligne').toBeNull();

    // --- `timezone` : « vide = héritage » ------------------------------------
    expect(
      groupe.timezone,
      '§35.2 : « `timezone` (vide = héritage) ». L’héritage est porté par le NULL\n' +
        '(04 : « héritage par l’arbre : NULL = fuseau de la mission »). Recopier ici le\n' +
        'fuseau de la mission FIGERAIT la valeur : changer le fuseau de la mission ne\n' +
        'toucherait plus les unités, et la §22.2 deviendrait fausse en silence.',
    ).toBeNull();
    expect(feuille.timezone, 'un fuseau EXPLICITE est conservé tel quel').toBe('Europe/Lisbon');

    // --- Colonnes que le CSV ne porte pas, et leurs défauts -------------------
    for (const ligne of unites) {
      expect(
        ligne.in_scope,
        '`in_scope` n’est PAS une colonne du §35.2 : une unité importée est dans le\n' +
          'périmètre par défaut (04 : `in_scope BOOL DEFAULT true`). L’importer à `false`\n' +
          'exclurait toute la mission du scoring et de la couverture sans le dire.',
      ).toBe(true);
      expect(ligne.status, 'une unité importée par le siège est `active`, jamais `proposee`').toBe(
        'active',
      );
      expect(ligne.proposed_by, '`proposed_by` ne concerne que le terrain (§25.3)').toBeNull();
      expect(ligne.merged_into_id).toBeNull();
      expect(
        ligne.position,
        'Le curseur de la liste est `(position, id)` (conception L3 §2). Une `position`\n' +
          'NULLE sur une unité importée rendrait l’ordre de l’arbre dépendant du hasard —\n' +
          'et un keyset sur une colonne nulle saute des lignes en silence.',
      ).not.toBeNull();
      expect(
        estUuidV7(ligne.id),
        `L’identifiant « ${ligne.id} » n’est pas un UUID v7.\n` +
          'Invariant 1 / P1-4 : `org_units` est créable HORS LIGNE (§25.3), donc son id est\n' +
          'un v7 généré côté APPLICATIF. Un `DEFAULT gen_random_uuid()` produit un v4 : non\n' +
          'ordonnable, donc un curseur keyset faux et un upsert de sync bancal.',
      ).toBe(true);
    }
  });

  it('@critique le BOM d’un tableur FR ne fait pas disparaître la colonne `ref`', async () => {
    // LE DÉFAUT QUE CE TEST ATTRAPE, ET C'EST LE PIRE REFUS QUI SOIT.
    // Un tableur FR écrit U+FEFF puis « ref;name;… ». Un parseur qui compare
    // naïvement le premier en-tête à « ref » lit « <BOM>ref » et conclut « colonne
    // `ref` manquante » — sur un fichier PARFAITEMENT VALIDE que le sponsor vient
    // d'enregistrer depuis son organigramme. L'utilisateur ne peut pas corriger ce
    // qu'il ne voit pas : le caractère est invisible.
    //
    // Les deux moitiés sont éprouvées dans le même test : AVEC BOM et SANS BOM
    // doivent donner le MÊME arbre. Sans la moitié « sans BOM », un parseur qui
    // retirerait aveuglément le premier caractère de l'en-tête passerait.
    const admin = await creerCompte('admin', 'import-bom');
    const lignes: readonly LigneCsv[] = [
      { ref: 'ra', name: 'Racine factice BOM', kind: 'groupe' },
      { ref: 'rb', name: 'Feuille factice BOM', kind: 'service', parent_ref: 'ra' },
    ];

    const avecBom = await semerMission('import-avec-bom', admin.id);
    const reponseAvec = await importer(avecBom, fichierCsv(lignes, { bom: true }), {
      jeton: admin.jeton,
    });
    expect(
      [200, 201],
      'Un CSV enregistré par un tableur FR commence par un BOM UTF-8. Le refuser, ' +
        `c’est refuser le format réel du §35.2 : ${reponseAvec.corps}`,
    ).toContain(reponseAvec.statut);
    expect(await compterUnitesDeLaMission(avecBom)).toBe(2);

    const sansBom = await semerMission('import-sans-bom', admin.id);
    const reponseSans = await importer(sansBom, fichierCsv(lignes, { bom: false }), {
      jeton: admin.jeton,
    });
    expect(
      [200, 201],
      `un fichier sans BOM doit s’importer aussi : ${reponseSans.corps}`,
    ).toContain(reponseSans.statut);
    expect(await compterUnitesDeLaMission(sansBom)).toBe(2);

    const noms = (lignesLues: readonly LigneUnite[]): string[] =>
      lignesLues.map((ligne) => ligne.name).sort();
    expect(
      noms(await lireUnites(avecBom)),
      'Le BOM ne doit RIEN changer au contenu — pas même un caractère invisible collé\n' +
        'au nom de la première unité.',
    ).toStrictEqual(noms(await lireUnites(sansBom)));
  });

  it('@critique l’ORDRE des colonnes ne compte pas : les en-têtes sont NOMMÉS, pas positionnels', async () => {
    // « en-têtes OBLIGATOIRES » (§35.2) n'a de sens que si les en-têtes SERVENT.
    // Un parseur POSITIONNEL — qui lit la 3ᵉ cellule comme un `kind` parce que
    // `kind` est la 3ᵉ colonne du pack — accepterait le fichier canonique et
    // écrirait n'importe quoi sur un fichier réordonné : le `kind` dans `name`, le
    // `name` dans `parent_ref`. Rien ne planterait, et l'arbre serait faux.
    //
    // Un sponsor qui remplit un tableau à la main réordonne ses colonnes : le cas
    // n'est pas tordu, c'est le cas normal.
    const admin = await creerCompte('admin', 'import-ordre');
    const missionId = await semerMission('import-ordre', admin.id);

    const colonnesInversees = [...COLONNES_35_2].reverse();
    const contenu = fichierCsv(
      [
        { ref: 'oa', name: 'Racine factice ordre', kind: 'groupe', country_code: 'FR' },
        {
          ref: 'ob',
          name: 'Équipe factice ordre',
          kind: 'equipe',
          parent_ref: 'oa',
          headcount: '12',
        },
      ],
      { colonnes: colonnesInversees },
    );

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect([200, 201], `colonnes réordonnées, import refusé : ${reponse.corps}`).toContain(
      reponse.statut,
    );

    const unites = await lireUnites(missionId);
    expect(unites).toHaveLength(2);
    const equipe = unites.find((ligne) => ligne.name === 'Équipe factice ordre');
    const racine = unites.find((ligne) => ligne.name === 'Racine factice ordre');
    expect(equipe, 'l’équipe doit exister sous son NOM, pas sous une autre cellule').toBeDefined();
    expect(racine).toBeDefined();
    expect(equipe?.kind, 'le `kind` vient de la colonne NOMMÉE `kind`').toBe('equipe');
    expect(equipe?.headcount).toBe(12);
    expect(equipe?.parent_id, 'la parenté survit au réordonnancement').toBe(racine?.id);
  });

  it('le séparateur `,` est détecté, et un `;` protégé par des guillemets reste dans le nom', async () => {
    // §35.2 : « séparateur `;` (ou `,` détecté) ». La détection est donc DUE.
    // Le second volet est la contre-épreuve d'une détection trop zélée : dans un
    // fichier à `;`, une virgule est un caractère ORDINAIRE d'un nom d'unité
    // (« Direction commerciale, Nord »), et un `;` entre guillemets ne sépare rien.
    const admin = await creerCompte('admin', 'import-separateur');

    const virgule = await semerMission('import-virgule', admin.id);
    const reponseVirgule = await importer(
      virgule,
      fichierCsv(
        [
          { ref: 'va', name: 'Racine factice virgule', kind: 'groupe' },
          { ref: 'vb', name: 'Direction factice, Nord', kind: 'direction', parent_ref: 'va' },
        ],
        { separateur: ',' },
      ),
      { jeton: admin.jeton },
    );
    expect(
      [200, 201],
      `Séparateur virgule non détecté (§35.2 l’exige) : ${reponseVirgule.corps}`,
    ).toContain(reponseVirgule.statut);
    const nomsVirgule = (await lireUnites(virgule)).map((ligne) => ligne.name);
    expect(
      nomsVirgule,
      'La virgule DANS le nom était protégée par des guillemets : elle ne sépare rien.',
    ).toContain('Direction factice, Nord');

    const pointVirgule = await semerMission('import-point-virgule', admin.id);
    const reponsePv = await importer(
      pointVirgule,
      fichierCsv([
        { ref: 'pa', name: 'Racine factice point-virgule', kind: 'groupe' },
        { ref: 'pb', name: 'Service factice; annexe', kind: 'service', parent_ref: 'pa' },
      ]),
      { jeton: admin.jeton },
    );
    expect([200, 201], `séparateur par défaut refusé : ${reponsePv.corps}`).toContain(
      reponsePv.statut,
    );
    expect((await lireUnites(pointVirgule)).map((ligne) => ligne.name)).toContain(
      'Service factice; annexe',
    );
  });

  it('les accents et l’apostrophe typographique traversent l’import intacts', async () => {
    // §35.2 impose UTF-8. Un import qui perdrait les accents rendrait l'arbre
    // illisible dans le rapport final — et l'invariant 5 (« interface 100 % en
    // français ») ne survit pas à une mojibake dans un nom d'unité.
    const admin = await creerCompte('admin', 'import-encodage');
    const missionId = await semerMission('import-encodage', admin.id);
    const nomAccentue = 'Unité d’Ingénierie — Été, Sûreté & Qualité';

    const reponse = await importer(
      missionId,
      fichierCsv([{ ref: 'ea', name: nomAccentue, kind: 'direction' }]),
      { jeton: admin.jeton },
    );
    expect([200, 201], `import refusé : ${reponse.corps}`).toContain(reponse.statut);
    expect(
      (await lireUnites(missionId))[0]?.name,
      'Le nom doit être identique au CARACTÈRE près — apostrophe typographique et\n' +
        'tiret cadratin compris. Une normalisation « pour faire propre » est une\n' +
        'altération silencieuse de la donnée du client (invariant 7).',
    ).toBe(nomAccentue);
  });

  it('une ligne VIDE ne crée jamais d’unité fantôme', async () => {
    // ── CE QUE CE TEST AFFIRME, ET CE QU'IL S'INTERDIT D'AFFIRMER ────────────
    // §35.2 ne dit RIEN des lignes vides. Deux comportements sont donc défendables :
    // les ignorer (tolérance de tableur) ou les rejeter avec leur numéro. Ce test
    // n'en impose AUCUN — deviner ici produirait un faux verdict.
    //
    // Ce qu'il impose est ce sur quoi les deux lectures s'accordent, et qui est un
    // vrai défaut : une ligne vide ne doit JAMAIS produire une unité. Une unité sans
    // nom entre dans la couverture, dans le plan d'entretiens et dans le scoring
    // sans que personne ne sache d'où elle vient.
    const admin = await creerCompte('admin', 'import-ligne-vide');
    const missionId = await semerMission('import-ligne-vide', admin.id);

    const base = fichierCsv([
      { ref: 'la', name: 'Racine factice ligne vide', kind: 'groupe' },
      { ref: 'lb', name: 'Service factice ligne vide', kind: 'service', parent_ref: 'la' },
    ]);
    // Une ligne intégralement vide est INSÉRÉE entre l'en-tête et la première
    // donnée : c'est ce qu'un tableur produit quand on efface le contenu d'une
    // ligne sans supprimer la ligne.
    const lignes = base.split('\r\n');
    const avecVide = [lignes[0] ?? '', '', ...lignes.slice(1)].join('\r\n');

    const reponse = await importer(missionId, avecVide, { jeton: admin.jeton });
    const unites = await lireUnites(missionId);

    if (reponse.statut === 422) {
      expect(
        unites,
        'Refuser est légitime — mais alors RIEN n’est écrit (atomicité §35.2).',
      ).toHaveLength(0);
      expect(
        entreesDeRapport(reponse.corps).length,
        'Un refus doit être MOTIVÉ ligne par ligne, jamais un « import échoué » nu.',
      ).toBeGreaterThan(0);
      return;
    }

    expect([200, 201], `ni import ni refus motivé : ${reponse.corps}`).toContain(reponse.statut);
    expect(
      unites.map((ligne) => ligne.name).sort(),
      'Tolérer la ligne vide est légitime — la MATÉRIALISER ne l’est pas. Une unité\n' +
        'sans nom entrerait dans la couverture, le plan d’entretiens et le scoring sans\n' +
        'que personne ne sache d’où elle vient.',
    ).toStrictEqual(['Racine factice ligne vide', 'Service factice ligne vide']);
  });

  it('@critique une colonne étoilée ABSENTE de l’en-tête est refusée, et le rapport la NOMME', async () => {
    // « en-têtes OBLIGATOIRES » (§35.2). `kind` est étoilé : sans lui, aucune ligne
    // du fichier n'est interprétable.
    //
    // CE QUE LE TEST ATTRAPE : un parseur qui lirait `ligne['kind']` sur un fichier
    // sans cette colonne obtiendrait `undefined`, et une implémentation permissive
    // écrirait cent unités d'un `kind` inventé (« service » par défaut) sans rien
    // dire. Le rapport doit donc NOMMER la colonne manquante — un « fichier
    // invalide » nu laisserait l'administrateur relire neuf en-têtes à l'œil.
    //
    // Le statut est 422 et non 400, sur l'arbitrage du 2026-08-29 : « sur la route
    // d'import, 400 est déjà consommé par le compilateur Zod. Faire cohabiter
    // "votre appel HTTP est malformé" et "votre document a été lu et rejeté" sous un
    // statut unique rendrait la distinction dépendante du seul code. »
    const admin = await creerCompte('admin', 'import-colonne-absente');
    const missionId = await semerMission('import-colonne-absente', admin.id);

    const sansKind = COLONNES_35_2.filter((colonne) => colonne !== 'kind');
    const contenu = fichierCsv(
      [
        { ref: 'ka', name: 'Racine factice sans kind' },
        { ref: 'kb', name: 'Service factice sans kind', parent_ref: 'ka' },
      ],
      { colonnes: sansKind },
    );

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(reponse.statut, `en-tête amputé, refus attendu : ${reponse.corps}`).toBe(422);
    expect(
      reponse.code,
      'Code arbitré le 2026-08-29 : `IMPORT_REJECTED` (renommé depuis\n' +
        '`CSV_IMPORT_REJECTED` — « CSV nomme le médium, pas le sujet »).',
    ).toBe('IMPORT_REJECTED');
    expect(
      reponse.corps.includes('kind'),
      'Le refus doit NOMMER la colonne manquante. Sans elle, l’administrateur relit\n' +
        'neuf en-têtes à l’œil pour trouver laquelle manque.',
    ).toBe(true);
    expect(
      await compterUnitesDeLaMission(missionId),
      'Un en-tête amputé n’écrit rien — pas même les lignes « lisibles ».',
    ).toBe(0);
  });
});

// =============================================================================
// 2. ATOMICITÉ ET RAPPORT D'ERREURS — LE CRITÈRE D'ACCEPTATION N° 1 DU 07
// =============================================================================
// « Import CSV de l'arbre conforme au format §35.2 (atomique + rapport d'erreurs) ».
// C'est la section qui décide du lot.
describe('POST /v1/missions/:id/org-units/import — atomicité (07, critère n° 1)', () => {
  it('@critique cent lignes, la 73ᵉ invalide : la base ne contient RIEN de plus qu’avant', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE QUE CE TEST ATTRAPE.
    // ═════════════════════════════════════════════════════════════════════════
    // Un import écrit « naturellement » boucle sur les lignes et insère au fil de
    // l'eau — parce que c'est ce qu'on écrit quand on pense au cas passant :
    //
    //     for (const ligne of lignes) { valider(ligne); await inserer(ligne); }
    //
    // Cette forme est VERTE sur tout fichier valide, verte sur un fichier dont la
    // PREMIÈRE ligne est fautive, et verte sur tout test qui se contente de lire la
    // réponse HTTP. Elle laisse pourtant SOIXANTE-DOUZE unités derrière elle quand
    // le défaut est en 73ᵉ position — un demi-arbre, que personne ne distingue d'un
    // arbre complet, et sur lequel le questionnaire sera figé.
    // La même remarque vaut pour un import qui commettrait par lots de 50 : la
    // moitié du fichier resterait.
    //
    // C'est pourquoi ce test NE REGARDE PAS la réponse pour conclure : il compte les
    // lignes EN BASE, sur la mission ET sur la table entière (un import qui se
    // tromperait de mission ne doit pas passer non plus).
    //
    // La 73ᵉ ligne de DONNÉES est la ligne 74 du TABLEUR — voir `ligneTableur`.
    const admin = await creerCompte('admin', 'atomicite-une-erreur');
    const missionId = await semerMission('atomicite-une-erreur', admin.id);

    const defautUnique = DEFAUTS_EPREUVE.filter((defaut) => defaut.index === 72);
    expect(defautUnique, 'le défaut de la 73ᵉ ligne de données doit exister').toHaveLength(1);

    const totalAvant = await compterToutesLesUnites();
    const contenu = fichierCsv(lignesEpreuve(defautUnique));

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });

    expect(reponse.statut, `refus attendu : ${reponse.corps}`).toBe(422);
    expect(reponse.code).toBe('IMPORT_REJECTED');
    expect(
      await compterUnitesDeLaMission(missionId),
      'ATOMICITÉ ROMPUE. Cent lignes, une seule fautive en 74ᵉ ligne de tableur, et la\n' +
        'mission porte pourtant des unités. Un import « atomique » qui laisse des lignes\n' +
        'derrière lui est le pire des deux mondes : l’utilisateur voit un échec, la base\n' +
        'contient un demi-arbre, et le questionnaire sera figé dessus.',
    ).toBe(0);
    expect(
      await compterToutesLesUnites(),
      'Aucune unité n’a le droit d’apparaître AILLEURS non plus : un import qui se\n' +
        'tromperait de mission ne doit pas passer sous prétexte que la mission visée est\n' +
        'restée vide.',
    ).toBe(totalAvant);
  });

  it('@critique quatre défauts sur quatre lignes éloignées : les QUATRE sont rapportés, chacun avec sa ligne et sa colonne', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE QUE CE TEST ATTRAPE — ET C'EST UNE
    // AUTRE QUE LA PRÉCÉDENTE.
    // ═════════════════════════════════════════════════════════════════════════
    // Une validation écrite en « échec rapide » —
    //
    //     for (const ligne of lignes) { const faute = valider(ligne); if (faute) throw faute; }
    //
    // — est ATOMIQUE (elle n'a rien écrit) et passe donc intégralement le test
    // précédent. Elle ne rapporte pourtant QU'UNE SEULE erreur : celle de la ligne
    // 13. L'administrateur corrige, ré-importe, découvre la ligne 41, corrige,
    // ré-importe, découvre la 74… Quatre allers-retours pour un fichier de cent
    // lignes ; sur un arbre de groupe à 150 unités remplies à la main avec le
    // sponsor, la boucle devient impraticable et le format §35.2 rate son but
    // déclaré (« fait pour être saisissable à la main »).
    //
    // C'est exactement ce que la note de conception §3c appelle la PASSE 1 :
    // « entièrement en mémoire, zéro écriture — TOUTES les lignes sont évaluées,
    // jamais d'arrêt à la première erreur ».
    //
    // Les quatre défauts portent sur QUATRE COLONNES DIFFÉRENTES et sont posés en
    // lignes 13, 41, 74 et 101 — dont la DERNIÈRE ligne du fichier, qu'une
    // validation tronquée (« on ne valide que les 100 premiers enregistrements
    // moins un ») raterait.
    const admin = await creerCompte('admin', 'atomicite-quatre');
    const missionId = await semerMission('atomicite-quatre', admin.id);

    const totalAvant = await compterToutesLesUnites();
    const reponse = await importer(missionId, fichierCsv(lignesEpreuve(DEFAUTS_EPREUVE)), {
      jeton: admin.jeton,
    });

    expect(reponse.statut, `refus attendu : ${reponse.corps}`).toBe(422);
    expect(reponse.code).toBe('IMPORT_REJECTED');

    const entrees = entreesDeRapport(reponse.corps);
    expect(
      entrees.length,
      'Le rapport doit porter UNE ENTRÉE PAR DÉFAUT — quatre, ni plus ni moins.\n' +
        'Une seule entrée = arrêt à la première erreur (voir l’en-tête de ce test).\n' +
        'Zéro entrée = « import échoué » nu, que §35.2 refuse nommément (« rapport\n' +
        `d’erreurs ligne par ligne »).\nRapport reçu : ${reponse.corps}`,
    ).toBe(DEFAUTS_EPREUVE.length);

    const denonces = couplesDenonces(entrees, COUPLES_ATTENDUS);
    const attendus = COUPLES_ATTENDUS.map(
      (couple) => `ligne ${String(couple.ligne)} / ${couple.colonne}`,
    ).sort();
    expect(
      denonces,
      'Chaque entrée doit nommer SA LIGNE (numérotation de tableur, en-tête = ligne 1)\n' +
        'ET SA COLONNE. Un rapport qui dit « ligne 74 : erreur » envoie l’administrateur\n' +
        'relire neuf cellules ; un rapport qui dit « colonne kind invalide » sans numéro\n' +
        'l’envoie relire cent lignes.\n' +
        DEFAUTS_EPREUVE.map(
          (defaut) =>
            `  · ligne ${String(ligneTableur(defaut.index))}, colonne ${defaut.colonne} — ${defaut.pourquoi}`,
        ).join('\n') +
        `\nRapport reçu : ${reponse.corps}`,
    ).toStrictEqual(attendus);

    // ── LE RAPPORT NE DOIT PAS DÉNONCER DE LIGNE SAINE ────────────────────────
    // Sans cette moitié, un rapport qui listerait les CENT lignes passerait les
    // assertions ci-dessus par force brute — il « nommerait » les quatre défauts au
    // milieu de 96 accusations infondées.
    for (const ligneSaine of [3, 25, 60, 90]) {
      expect(
        entrees.some((entree) => mentionneNombre(entree, ligneSaine)),
        `La ligne ${String(ligneSaine)} est parfaitement valide et ne doit pas figurer au\n` +
          'rapport. Un rapport qui accuse tout le fichier ne se lit pas.',
      ).toBe(false);
    }

    expect(await compterUnitesDeLaMission(missionId), 'quatre défauts, zéro écriture').toBe(0);
    expect(await compterToutesLesUnites()).toBe(totalAvant);
  });

  it('@critique contre-épreuve : le MÊME fichier, ses quatre défauts corrigés, s’importe INTÉGRALEMENT', async () => {
    // SANS CE TEST, TOUTE LA SECTION EST VERTE POUR UNE IMPLÉMENTATION QUI REFUSE
    // TOUT. « Rien n'a été écrit » est trivialement vrai d'un import qui n'écrit
    // jamais. C'est la contre-épreuve exacte du test précédent : même générateur,
    // même volume, même structure — la seule différence est l'absence de défauts.
    const admin = await creerCompte('admin', 'atomicite-contre-epreuve');
    const missionId = await semerMission('atomicite-contre-epreuve', admin.id);

    const reponse = await importer(missionId, fichierCsv(lignesEpreuve()), { jeton: admin.jeton });
    expect([200, 201], `le fichier corrigé doit passer : ${reponse.corps}`).toContain(
      reponse.statut,
    );

    const unites = await lireUnites(missionId);
    expect(unites, 'cent lignes de données, cent unités').toHaveLength(NB_LIGNES_EPREUVE);

    const racine = unites.find((ligne) => ligne.name === nomDepuisRef(refAlphabetique(0)));
    expect(racine, 'la racine du fichier doit exister').toBeDefined();
    expect(racine?.parent_id, '`parent_ref` vide = racine').toBeNull();
    expect(
      unites.filter((ligne) => ligne.parent_id === racine?.id),
      'les 99 autres pendent à la racine',
    ).toHaveLength(NB_LIGNES_EPREUVE - 1);

    // Les quatre lignes qui portaient un défaut sont maintenant présentes et
    // correctes : c'est la preuve que la correction a été RELUE, pas contournée.
    for (const defaut of DEFAUTS_EPREUVE) {
      const ref = refAlphabetique(defaut.index);
      const ligne = unites.find((candidate) => candidate.name === nomDepuisRef(ref));
      expect(
        ligne,
        `la ligne ${String(ligneTableur(defaut.index))} doit être importée`,
      ).toBeDefined();
      expect(ligne?.kind, 'toutes ces lignes sont des services sauf la racine').toBe(
        defaut.index === 0 ? 'groupe' : 'service',
      );
    }

    // Le curseur de la liste est `(position, id)` : sur cent unités, deux positions
    // identiques ou nulles feraient sauter des lignes à la pagination.
    const positions = unites.map((ligne) => ligne.position);
    expect(
      positions.every((position) => position !== null),
      'aucune `position` nulle après un import — le curseur keyset s’appuie dessus',
    ).toBe(true);
  });
});

// =============================================================================
// 3. LES CAS PIÉGEUX DU §35.2 — ceux qu'un fichier rempli à la main produit
// =============================================================================
describe('POST /v1/missions/:id/org-units/import — cas piégeux', () => {
  it('@critique un parent déclaré APRÈS son enfant est résolu, pas refusé', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : résoudre `parent_ref` en cherchant
    // dans ce qui est DÉJÀ INSÉRÉ.
    // ═════════════════════════════════════════════════════════════════════════
    //     for (const ligne of lignes) {
    //       const parent = dejaInserees.get(ligne.parent_ref);   // ← undefined ici
    //       ...
    //     }
    // Elle marche sur l'exemple du §35.2, où le groupe précède la filiale qui
    // précède le service — et échoue sur tout fichier saisi dans un autre ordre,
    // c'est-à-dire sur la majorité des organigrammes recopiés à la main, où l'on
    // note d'abord les feuilles qu'on connaît puis les niveaux au-dessus.
    //
    // §35.2 n'impose AUCUN ordre : il dit « `parent_ref` (vide = racine) », rien de
    // plus. La note de conception §3c le confirme (« résolution des `parent_ref` »
    // en passe 1, « insertion parents-avant-enfants » en passe 2 : c'est l'IMPORT
    // qui trie, pas l'utilisateur).
    const admin = await creerCompte('admin', 'import-ordre-parent');
    const missionId = await semerMission('import-ordre-parent', admin.id);

    // Ordre DÉLIBÉRÉMENT inversé : le poste d'abord, la racine en dernier.
    const contenu = fichierCsv([
      { ref: 'pc', name: 'Poste factice aval', kind: 'poste', parent_ref: 'pb' },
      { ref: 'pb', name: 'Équipe factice médiane', kind: 'equipe', parent_ref: 'pa' },
      { ref: 'pa', name: 'Racine factice amont', kind: 'groupe' },
    ]);

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(
      [200, 201],
      `Un parent déclaré après son enfant doit être RÉSOLU : ${reponse.corps}`,
    ).toContain(reponse.statut);

    const unites = await lireUnites(missionId);
    const parNom = new Map(unites.map((ligne) => [ligne.name, ligne]));
    const racine = parNom.get('Racine factice amont');
    const mediane = parNom.get('Équipe factice médiane');
    const poste = parNom.get('Poste factice aval');
    expect(racine?.parent_id).toBeNull();
    expect(mediane?.parent_id).toBe(racine?.id);
    expect(
      poste?.parent_id,
      'La chaîne est reconstruite sur TROIS niveaux, dans l’ordre inverse du fichier.',
    ).toBe(mediane?.id);
    expect(
      poste?.kind,
      '`poste` est le SEPTIÈME et dernier `kind` du §35.2 — le brief du lot le nomme\n' +
        'expressément (« kind jusqu’à poste »). Un import qui s’arrêterait à `equipe`\n' +
        'refuserait la granularité la plus fine de l’arbre.',
    ).toBe('poste');
  });

  it('@critique un cycle de parenté est refusé, et le rapport nomme les lignes du cycle', async () => {
    // Le corollaire du test précédent : puisque l'ordre du fichier ne compte plus,
    // rien n'empêche syntaxiquement d'écrire A parent de B et B parent de A. Une
    // implémentation qui résout les `parent_ref` par table de correspondance sans
    // chercher de cycle accepterait le fichier, écrirait deux lignes qui se
    // pointent mutuellement, et l'arbre deviendrait INFINI : tout parcours
    // récursif du siège (affichage, couverture, scoring par unité) boucle sans
    // fin. Une contrainte de base ne peut pas l'attraper — un `FOREIGN KEY` sur
    // `parent_id` est parfaitement satisfait par un cycle.
    //
    // Le cycle est à TROIS branches, pas deux : un contrôle qui ne regarderait que
    // « mon parent me pointe-t-il ? » passerait sur un cycle de longueur 2 mais
    // pas sur celui-ci — et c'est l'inverse qu'on veut prouver.
    const admin = await creerCompte('admin', 'import-cycle');
    const missionId = await semerMission('import-cycle', admin.id);

    const contenu = fichierCsv([
      { ref: 'ca', name: 'Cycle factice A', kind: 'direction', parent_ref: 'cc' },
      { ref: 'cb', name: 'Cycle factice B', kind: 'service', parent_ref: 'ca' },
      { ref: 'cc', name: 'Cycle factice C', kind: 'equipe', parent_ref: 'cb' },
    ]);

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(reponse.statut, `un cycle doit être refusé : ${reponse.corps}`).toBe(422);
    expect(reponse.code).toBe('IMPORT_REJECTED');
    expect(await compterUnitesDeLaMission(missionId), 'un cycle n’écrit rien').toBe(0);

    const entrees = entreesDeRapport(reponse.corps);
    expect(
      entrees.length,
      `Le refus doit être MOTIVÉ ligne par ligne : ${reponse.corps}`,
    ).toBeGreaterThan(0);
    expect(
      entrees.some(
        (entree) =>
          entree.includes('parent_ref') &&
          [2, 3, 4].some((ligne) => mentionneNombre(entree, ligne)),
      ),
      'Le rapport doit désigner la colonne `parent_ref` ET au moins une des lignes du\n' +
        'cycle (2, 3 ou 4). « Arbre invalide » sans coordonnées oblige à relire tout le\n' +
        `fichier.\nRapport reçu : ${reponse.corps}`,
    ).toBe(true);
  });

  it('@critique une unité déclarée son PROPRE parent est refusée', async () => {
    // Le cycle de longueur 1 : `parent_ref` égale sa propre `ref`. C'est la faute
    // de frappe la plus fréquente d'un tableur rempli à la main (recopie de
    // cellule), et un contrôle de cycle écrit « je remonte tant que j'ai un
    // parent » boucle infiniment DESSUS avant même d'écrire quoi que ce soit :
    // la requête ne rend jamais, et le test le verrait comme un dépassement de
    // délai plutôt que comme un refus.
    const admin = await creerCompte('admin', 'import-auto-parent');
    const missionId = await semerMission('import-auto-parent', admin.id);

    const reponse = await importer(
      missionId,
      fichierCsv([
        { ref: 'sa', name: 'Unité factice son propre parent', kind: 'service', parent_ref: 'sa' },
      ]),
      { jeton: admin.jeton },
    );
    expect(reponse.statut, `auto-parenté, refus attendu : ${reponse.corps}`).toBe(422);
    expect(await compterUnitesDeLaMission(missionId)).toBe(0);
    expect(
      entreesDeRapport(reponse.corps).some((entree) => entree.includes('parent_ref')),
      'le rapport nomme la colonne fautive',
    ).toBe(true);
  });

  it('une `ref` en double est refusée, et le rapport nomme la ligne du doublon', async () => {
    // §35.2 : « `ref` (identifiant de ligne, libre, UNIQUE) ». Deux lignes de même
    // `ref` rendent tout `parent_ref` qui les vise AMBIGU — et une implémentation
    // qui construirait sa table de correspondance par `Map.set` garderait
    // silencieusement la DERNIÈRE, rattachant des unités à un parent que
    // l'utilisateur n'a pas choisi.
    const admin = await creerCompte('admin', 'import-doublon-ref');
    const missionId = await semerMission('import-doublon-ref', admin.id);

    const contenu = fichierCsv([
      { ref: 'da', name: 'Racine factice doublon', kind: 'groupe' },
      { ref: 'db', name: 'Premier porteur factice', kind: 'service', parent_ref: 'da' },
      { ref: 'db', name: 'Second porteur factice', kind: 'service', parent_ref: 'da' },
    ]);

    const reponse = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(reponse.statut, `doublon de ref, refus attendu : ${reponse.corps}`).toBe(422);
    expect(await compterUnitesDeLaMission(missionId)).toBe(0);
    expect(
      entreeNommant(entreesDeRapport(reponse.corps), 4, 'ref'),
      'La SECONDE occurrence est en ligne 4 du tableur : c’est elle que\n' +
        'l’administrateur doit corriger, et c’est donc elle que le rapport doit nommer,\n' +
        `avec sa colonne (ref).\nRapport reçu : ${reponse.corps}`,
    ).toBe(true);
  });

  it('@critique un `service_code` CONNU est résolu, un `service_code` INCONNU est refusé', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // LES DEUX MOITIÉS, ET POURQUOI L'UNE SANS L'AUTRE NE PROUVE RIEN.
    // ═════════════════════════════════════════════════════════════════════════
    // Un contrôle INERTE — qui ne consulterait jamais la table `services` et
    // laisserait `service_ref_id` à NULL — passerait le cas « code connu » si
    // celui-ci se contentait d'exiger un 201. Et un contrôle qui refuserait TOUT
    // code passerait le cas « inconnu ». Les deux moitiés sont donc éprouvées
    // ensemble, et la moitié « connue » va jusqu'à relire l'identifiant résolu en
    // base et le comparer à celui du référentiel semé.
    //
    // C'est le même piège que R4 (NAF → secteur) sur `companies`, où il avait été
    // mesuré : un mécanisme entièrement inerte rend poliment « à qualifier » sans
    // que la table soit lue une seule fois.
    const admin = await creerCompte('admin', 'import-service-code');
    const codeConnu = 'juridique_conformite';
    const identifiantAttendu = await idService(codeConnu);

    const missionConnue = await semerMission('import-service-connu', admin.id);
    const reponseConnue = await importer(
      missionConnue,
      fichierCsv([
        { ref: 'sa', name: 'Racine factice fonction', kind: 'groupe' },
        {
          ref: 'sb',
          name: 'Service factice juridique',
          kind: 'service',
          parent_ref: 'sa',
          service_code: codeConnu,
        },
      ]),
      { jeton: admin.jeton },
    );
    expect([200, 201], `un code CONNU doit passer : ${reponseConnue.corps}`).toContain(
      reponseConnue.statut,
    );
    const feuille = (await lireUnites(missionConnue)).find(
      (ligne) => ligne.name === 'Service factice juridique',
    );
    expect(
      feuille?.service_ref_id,
      'Un `service_code` de la taxonomie des 11 fonctions (11 §5) doit être RÉSOLU.\n' +
        'NULL ici = le référentiel n’a jamais été consulté, et le ciblage par fonction\n' +
        'du moteur M2 sera vide sur toute la mission — sans le moindre message.',
    ).toBe(identifiantAttendu);

    const missionInconnue = await semerMission('import-service-inconnu', admin.id);
    const reponseInconnue = await importer(
      missionInconnue,
      fichierCsv([
        { ref: 'sa', name: 'Racine factice fonction bis', kind: 'groupe' },
        {
          ref: 'sb',
          name: 'Service factice hors taxonomie',
          kind: 'service',
          parent_ref: 'sa',
          service_code: 'plomberie',
        },
      ]),
      { jeton: admin.jeton },
    );
    expect(
      reponseInconnue.statut,
      `un code INCONNU doit être refusé : ${reponseInconnue.corps}`,
    ).toBe(422);
    expect(
      await compterUnitesDeLaMission(missionInconnue),
      'atomicité : la racine parfaitement valide de la ligne 2 ne doit pas être écrite',
    ).toBe(0);
    expect(
      entreeNommant(entreesDeRapport(reponseInconnue.corps), 3, 'service_code'),
      'Le rapport doit nommer la ligne 3 et la colonne `service_code`. Une taxonomie\n' +
        'fermée dont on ne dit pas quelle valeur a été refusée est inutilisable :\n' +
        `il y a ONZE codes possibles.\nRapport reçu : ${reponseInconnue.corps}`,
    ).toBe(true);
  });

  it('un `sector_code` CONNU est résolu, un `sector_code` INCONNU est refusé', async () => {
    // Même mécanique que `service_code`, sur l'autre référentiel. `sector_code`
    // porte la surcharge R6 (« secteur surchargé par unité, holdings
    // multi-activités », 04) : une résolution muette y ferait perdre le seul moyen
    // de coter différemment deux branches d'un même groupe.
    const admin = await creerCompte('admin', 'import-sector-code');
    const identifiantAttendu = await idSecteur('sante');

    const missionConnue = await semerMission('import-secteur-connu', admin.id);
    const reponseConnue = await importer(
      missionConnue,
      fichierCsv([
        { ref: 'ta', name: 'Racine factice secteur', kind: 'groupe', sector_code: 'sante' },
      ]),
      { jeton: admin.jeton },
    );
    expect([200, 201], `un secteur CONNU doit passer : ${reponseConnue.corps}`).toContain(
      reponseConnue.statut,
    );
    expect((await lireUnites(missionConnue))[0]?.sector_id).toBe(identifiantAttendu);

    const missionInconnue = await semerMission('import-secteur-inconnu', admin.id);
    const reponseInconnue = await importer(
      missionInconnue,
      fichierCsv([
        {
          ref: 'ta',
          name: 'Racine factice secteur bis',
          kind: 'groupe',
          sector_code: 'aeronavale',
        },
      ]),
      { jeton: admin.jeton },
    );
    expect(
      reponseInconnue.statut,
      `un secteur INCONNU doit être refusé : ${reponseInconnue.corps}`,
    ).toBe(422);
    expect(await compterUnitesDeLaMission(missionInconnue)).toBe(0);
    expect(
      entreeNommant(entreesDeRapport(reponseInconnue.corps), 2, 'sector_code'),
      `le rapport nomme la ligne 2 et la colonne sector_code : ${reponseInconnue.corps}`,
    ).toBe(true);
  });

  it('@critique un second import sur un arbre NON VIDE est refusé, et l’arbre existant est INCHANGÉ', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // CE QUE CE TEST PROTÈGE : L'INVARIANT 7, PAS UNE PRÉFÉRENCE D'ERGONOMIE.
    // ═════════════════════════════════════════════════════════════════════════
    // « Rien n'est jamais silencieusement écrasé ou supprimé. » Un ré-import écrit
    // « proprement » commence par `DELETE FROM org_units WHERE mission_id = …` —
    // c'est la forme naturelle d'un « remplacer l'arbre ». Elle emporte avec elle
    // les unités PROPOSÉES par le terrain (§25.3), les rattachements d'entretiens
    // déjà conduits, et les scores par unité. Rien ne le signale : l'appel rend 200.
    //
    // §35.2 ne dit rien du ré-import ; la note de conception §3c pose la règle
    // (« re-import refusé sauf si l'arbre ne contient que la racine par défaut »),
    // et l'arbitrage du 2026-08-29 la CONSERVE tout en refusant de lui donner un
    // code dédié : « le code générique porte tout ». D'où `CONFLICT` / 409.
    //
    // L'assertion qui compte n'est PAS le statut : c'est la PHOTOGRAPHIE de l'arbre,
    // relue après coup et comparée au bit près. Un refus qui aurait quand même
    // effacé quelque chose avant de refuser passerait un simple `count(*)` si le
    // fichier importé avait le même nombre de lignes.
    const admin = await creerCompte('admin', 'import-arbre-non-vide');
    const missionId = await semerMission('import-arbre-non-vide', admin.id);

    const racine = await semerUnite({
      missionId,
      nom: 'Racine factice préexistante',
      kind: 'groupe',
      position: 1,
    });
    await semerUnite({
      missionId,
      nom: 'Unité factice proposée par le terrain',
      kind: 'service',
      parentId: racine,
      status: 'proposee',
      position: 2,
      proposePar: admin.id,
    });

    const photoAvant = await photographierArbre(missionId);

    const reponse = await importer(
      missionId,
      fichierCsv([
        { ref: 'na', name: 'Racine factice de remplacement', kind: 'groupe' },
        { ref: 'nb', name: 'Service factice de remplacement', kind: 'service', parent_ref: 'na' },
      ]),
      { jeton: admin.jeton },
    );

    expect(
      reponse.statut,
      `Un ré-import sur un arbre habité doit être refusé : ${reponse.corps}`,
    ).toBe(409);
    expect(
      reponse.code,
      'Code générique arbitré le 2026-08-29 : `TREE_NOT_EMPTY` a été REFUSÉ comme\n' +
        'redondant (« une seule issue possible pour l’utilisateur : vider l’arbre ou\n' +
        'éditer à la main. Aucun branchement à gagner »).',
    ).toBe('CONFLICT');

    await attendreArbreInchange(
      missionId,
      photoAvant,
      'L’ARBRE EXISTANT A BOUGÉ pendant un import REFUSÉ. Invariant 7 : rien n’est\n' +
        'jamais silencieusement écrasé ni supprimé. L’unité PROPOSÉE par le terrain\n' +
        'était le cas le plus coûteux : elle porte des entretiens déjà conduits que\n' +
        'personne ne saurait rattacher après coup.',
    );
  });

  it('@critique deux imports SIMULTANÉS sur une mission neuve : un seul aboutit, et il n’y a qu’UN arbre', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // LE CAS QUE LE TEST PRÉCÉDENT NE COUVRE PAS : LA COURSE SUR UN ARBRE VIDE.
    // ═════════════════════════════════════════════════════════════════════════
    // Le test précédent prouve que le garde « arbre non vide → 409 » EXISTE. Il ne
    // prouve pas qu'il est SÉRIALISÉ. Or l'implémentation plausible mais fausse est
    // celle-ci, en trois temps : (1) `SELECT count(*) FROM org_units WHERE
    // mission_id = …` → 0 ; (2) décider « le garde passe » ; (3) ouvrir la
    // transaction et insérer. Un « lire-décider-écrire » SANS VERROU. Elle est
    // correcte dans 99,9 % des exécutions et fausse dans le cas qui arrive
    // vraiment : le DOUBLE-CLIC sur « Importer », ou le RETRY RÉSEAU d'un
    // navigateur dont la première requête a été coupée après l'envoi mais avant la
    // réponse. Deux requêtes lisent zéro, deux passent le garde, deux insèrent — et
    // la mission se retrouve avec DEUX ARBRES COMPLETS, chaque unité en double sous
    // deux identifiants distincts.
    //
    // POURQUOI C'EST PIRE ICI QU'AILLEURS. Il n'existe AUCUNE route pour réparer :
    // pas de `DELETE /v1/org-units/:id`, pas de `deleted_at` sur `org_units` (04),
    // et le ré-import est lui-même refusé sur un arbre habité (test précédent). Le
    // double arbre est donc DÉFINITIF pour l'utilisateur : tout entretien conduit,
    // tout score par unité, se rattacherait au hasard à l'un des deux jumeaux.
    //
    // CE QUE LE CODE DOIT FAIRE POUR PASSER (LOT_L3 §3.a, même remède que le
    // figeage du questionnaire) : `SELECT … FOR UPDATE` sur la ligne `missions` EN
    // TÊTE de la transaction d'import réel, AVANT le comptage. Le second import
    // attend le verrou, relit un arbre plein, et refuse en `CONFLICT`.
    //
    // ── SUR LA NON-DÉTERMINATION DE LA COURSE ────────────────────────────────
    // Avec `singleFork`, rien ne garantit que les deux requêtes s'entrelacent à
    // chaque exécution : l'une peut avoir entièrement commité avant que l'autre ne
    // lise. Les statuts `[200, 409]` sont alors vrais avec OU sans sérialisation.
    // C'est pourquoi l'assertion QUI COMPTE est la dernière : le compte d'unités en
    // base, qui est vrai que la course ait eu lieu ou non — et qui, le jour où elle
    // a lieu, dénonce le double arbre. Un test dont le verdict dépend d'un hasard
    // d'ordonnancement ne prouve rien ; un test qui assère la PROPRIÉTÉ FINALE
    // prouve la même chose à chaque passage.
    const admin = await creerCompte('admin', 'import-course');
    const missionId = await semerMission('import-course', admin.id);

    const lignes: readonly LigneCsv[] = [
      { ref: 'ca', name: 'Racine factice de course', kind: 'groupe' },
      { ref: 'cb', name: 'Filiale factice de course', kind: 'filiale', parent_ref: 'ca' },
      { ref: 'cc', name: 'Direction factice de course', kind: 'direction', parent_ref: 'cb' },
      { ref: 'cd', name: 'Service factice de course', kind: 'service', parent_ref: 'cc' },
      { ref: 'ce', name: 'Équipe factice de course', kind: 'equipe', parent_ref: 'cd' },
    ];
    const contenu = fichierCsv(lignes);

    // `semerMission` sème un arbre VIDE ; ce compte est relu plutôt que présumé,
    // pour que l'attendu final s'exprime en « avant + fichier » : si une racine
    // d'office existait sur la mission, elle serait comptée ici et non oubliée.
    const compteAvant = await compterUnitesDeLaMission(missionId);
    expect(compteAvant, 'la mission semée par SQL commence sans aucune unité').toBe(0);

    const [premiere, seconde] = await Promise.all([
      importer(missionId, contenu, { jeton: admin.jeton }),
      importer(missionId, contenu, { jeton: admin.jeton }),
    ]);

    const statuts = [premiere.statut, seconde.statut].sort((a, b) => a - b);
    expect(
      statuts,
      'Deux imports simultanés du MÊME fichier sur une mission neuve doivent donner\n' +
        'EXACTEMENT un 200 et un 409. Deux 200 signifient que le garde n’est pas\n' +
        'sérialisé (lire-décider-écrire sans verrou) ; deux 409 qu’aucun n’a abouti\n' +
        '(le verrou refuse au lieu d’attendre) ; un 500 que la collision a été laissée\n' +
        `remonter brute.\nCorps : ${premiere.corps.slice(0, 200)} | ${seconde.corps.slice(0, 200)}`,
    ).toStrictEqual([200, 409]);

    const refusee = premiere.statut === 409 ? premiere : seconde;
    expect(
      refusee.code,
      'Le refus du second import est le garde « arbre non vide » du test précédent :\n' +
        'code générique `CONFLICT` (arbitrage du 2026-08-29), pas un code inventé.',
    ).toBe('CONFLICT');

    // ── L'ASSERTION QUI COMPTE, vraie que la course ait eu lieu ou non ───────
    expect(
      await compterUnitesDeLaMission(missionId),
      `La mission doit porter EXACTEMENT ${String(compteAvant + lignes.length)} unités : celles du\n` +
        'fichier, importées UNE fois. Le double (' +
        `${String(compteAvant + 2 * lignes.length)}) trahit deux arbres complets — et aucune route\n` +
        'ne permet de les défaire (pas de DELETE, pas de `deleted_at` sur `org_units`).',
    ).toBe(compteAvant + lignes.length);

    // Un seul arbre, c'est aussi UNE seule racine : deux `parent_id IS NULL` sont la
    // signature d'un double import même si un compte global avait été bricolé.
    const racines = (await lireUnites(missionId)).filter((ligne) => ligne.parent_id === null);
    expect(racines, 'un arbre importé une fois n’a qu’une racine').toHaveLength(1);
  });
});

// =============================================================================
// 4. LE MODE À BLANC (`?verification=true`) — IL DOIT MENTIR SUR RIEN
// =============================================================================
// Note de conception §3c : « `?verification=true` s'arrête après la passe 1 :
// l'utilisateur itère sans jamais toucher la base. »
// Arbitrage du 2026-08-29 : « la validation À BLANC rend 200, pas 422 — une
// validation à blanc qui trouve des erreurs a RÉUSSI SON TRAVAIL, et rendre une
// erreur HTTP sur le succès d'un contrôle est une incohérence qui se paie au front. »
describe('POST /v1/missions/:id/org-units/import?verification=true — le passage à blanc', () => {
  it('@critique un passage à blanc n’écrit RIEN — l’arbre est identique au bit près', async () => {
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : « à blanc = on importe puis on
    // annule », c'est-à-dire une transaction ouverte, remplie, puis `ROLLBACK`.
    // Elle est TENTANTE parce qu'elle réutilise tout le code de l'import réel, et
    // elle est presque juste — mais elle consomme des séquences, elle prend des
    // verrous sur la mission, elle déclenche les déclencheurs, et surtout elle rend
    // le passage à blanc INDISPONIBLE quand l'arbre n'est plus vide (le ré-import
    // étant refusé). L'utilisateur perdrait la seule chose que le mode à blanc lui
    // apporte : itérer sur son fichier.
    //
    // Le test tourne donc sur une mission qui a DÉJÀ un arbre, et compare une
    // photographie complète — pas un `count(*)`, qui laisserait passer un
    // renommage ou un reparentage.
    const admin = await creerCompte('admin', 'blanc-inerte');
    const missionId = await semerMission('blanc-inerte', admin.id);
    const racine = await semerUnite({
      missionId,
      nom: 'Racine factice témoin',
      kind: 'groupe',
      position: 1,
    });
    await semerUnite({
      missionId,
      nom: 'Service factice témoin',
      kind: 'service',
      parentId: racine,
      position: 2,
    });

    const photoAvant = await photographierArbre(missionId);
    const totalAvant = await compterToutesLesUnites();

    // Un fichier PARFAITEMENT VALIDE : c'est le cas dangereux. Sur un fichier
    // fautif, une implémentation qui écrirait quand même échouerait de toute façon.
    const reponse = await importer(missionId, fichierCsv(lignesEpreuve()), {
      jeton: admin.jeton,
      aBlanc: true,
    });

    expect(
      reponse.statut,
      'Un contrôle à blanc qui a fait son travail rend 200 (arbitrage du 2026-08-29),\n' +
        `même sur un arbre déjà habité — il ne TENTE pas l’import.\n${reponse.corps}`,
    ).toBe(200);

    await attendreArbreInchange(
      missionId,
      photoAvant,
      'LE PASSAGE À BLANC A ÉCRIT. C’est le seul défaut que ce mode ne peut pas se\n' +
        'permettre : son unique promesse est de ne pas toucher la base. Cent unités\n' +
        'viennent d’apparaître sur une mission dont l’arbre était déjà construit.',
    );
    expect(await compterToutesLesUnites(), 'ni ici, ni ailleurs').toBe(totalAvant);
  });

  it('@critique le passage à blanc rapporte EXACTEMENT ce que l’import réel rapporte', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : DEUX CHEMINS DE VALIDATION.
    // ═════════════════════════════════════════════════════════════════════════
    // Le mode à blanc est souvent écrit comme un contrôle « léger » — en-têtes,
    // colonnes obligatoires, `kind` — tandis que les contrôles coûteux (résolution
    // des `parent_ref`, cycles, existence des codes de référentiel) restent dans
    // l'import réel, « puisqu'on y sera de toute façon ». L'utilisateur obtient
    // alors un feu vert à blanc, lance l'import, et découvre un refus. Le mode à
    // blanc n'aurait pas seulement été inutile : il aurait MENTI, et personne
    // n'aurait plus jamais confiance en lui.
    //
    // On compare donc les DEUX rapports sur le MÊME fichier, couple (ligne, colonne)
    // par couple (ligne, colonne). Le fichier porte les QUATRE familles de défaut :
    // une valeur obligatoire absente (`name`), un contrôle relationnel
    // (`parent_ref`), une énumération (`kind`) et un référentiel (`service_code`) —
    // c'est précisément la famille « coûteuse » qu'un contrôle léger laisserait
    // tomber.
    const admin = await creerCompte('admin', 'blanc-fidele');
    const missionId = await semerMission('blanc-fidele', admin.id);
    const contenu = fichierCsv(lignesEpreuve(DEFAUTS_EPREUVE));

    const aBlanc = await importer(missionId, contenu, { jeton: admin.jeton, aBlanc: true });
    expect(
      aBlanc.statut,
      `Le contrôle à blanc a RÉUSSI : il rend 200 même quand il trouve des erreurs\n` +
        `(arbitrage du 2026-08-29). ${aBlanc.corps}`,
    ).toBe(200);

    const reel = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(reel.statut, `l’import réel refuse le même fichier : ${reel.corps}`).toBe(422);

    const couplesABlanc = couplesDenonces(entreesDeRapport(aBlanc.corps), COUPLES_ATTENDUS);
    const couplesReels = couplesDenonces(entreesDeRapport(reel.corps), COUPLES_ATTENDUS);

    expect(
      couplesReels,
      `L’import réel doit dénoncer les quatre défauts : ${reel.corps}`,
    ).toStrictEqual(
      COUPLES_ATTENDUS.map((couple) => `ligne ${String(couple.ligne)} / ${couple.colonne}`).sort(),
    );
    expect(
      couplesABlanc,
      'LE PASSAGE À BLANC ET L’IMPORT RÉEL NE DISENT PAS LA MÊME CHOSE du même\n' +
        'fichier. Un mode à blanc plus indulgent que l’import donne un feu vert que\n' +
        'l’import démentira ; un mode à blanc plus sévère fait corriger des lignes qui\n' +
        'n’avaient rien. Les deux détruisent l’usage : itérer sur son fichier avec le\n' +
        'sponsor, sans toucher à la base.\n' +
        `À blanc : ${aBlanc.corps}\nRéel : ${reel.corps}`,
    ).toStrictEqual(couplesReels);

    expect(await compterUnitesDeLaMission(missionId), 'ni l’un ni l’autre n’a écrit').toBe(0);
  });

  it('le passage à blanc d’un fichier conforme annonce le VOLUME que l’import réel écrira', async () => {
    // « Il rapporte exactement ce que ferait l'import réel » ne se limite pas aux
    // erreurs : sur un fichier sain, ce que l'utilisateur veut savoir avant de
    // valider avec son sponsor, c'est COMBIEN d'unités vont entrer. Un mode à blanc
    // qui rendrait un « OK » nu laisserait passer sans un mot un fichier tronqué à
    // la copie — le cas le plus banal d'un export de tableur.
    //
    // Le test n'impose PAS le nom de la clé qui porte ce compte (le pack n'en fixe
    // aucune) : il exige que le nombre FIGURE dans la réponse, et il le confronte au
    // nombre d'unités que l'import réel écrit ensuite. C'est la confrontation qui
    // fait la preuve, pas la forme.
    const admin = await creerCompte('admin', 'blanc-volume');
    const missionId = await semerMission('blanc-volume', admin.id);
    const contenu = fichierCsv(lignesEpreuve());

    const aBlanc = await importer(missionId, contenu, { jeton: admin.jeton, aBlanc: true });
    expect(aBlanc.statut, `contrôle à blanc refusé : ${aBlanc.corps}`).toBe(200);
    expect(await compterUnitesDeLaMission(missionId), 'toujours rien écrit').toBe(0);

    const reel = await importer(missionId, contenu, { jeton: admin.jeton });
    expect([200, 201], `l’import réel doit passer : ${reel.corps}`).toContain(reel.statut);
    const ecrites = await compterUnitesDeLaMission(missionId);
    expect(ecrites).toBe(NB_LIGNES_EPREUVE);

    expect(
      nombresDuCorps(aBlanc.corps),
      `Le contrôle à blanc doit annoncer le nombre d’unités que l’import créera\n` +
        `(${String(ecrites)}). Un « OK » nu laisse passer sans un mot un fichier tronqué\n` +
        `à la copie.\nRéponse à blanc : ${aBlanc.corps}`,
    ).toContain(ecrites);
  });

  it('@critique aucune cellule du fichier client ne se retrouve dans `activity_log`', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // ARBITRAGE DU 2026-08-29, MOT POUR MOT : « le rapport d'import NE DOIT JAMAIS
    // ÊTRE JOURNALISÉ, seulement rendu : il recopie des cellules du fichier client
    // (noms d'unités, effectifs). Le §2 vise `person_name` et les adresses, mais
    // l'esprit couvre tout déversement de données client dans les journaux. »
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE, et elle vient d'une bonne intention :
    // `journaliser({ action: 'org_unit.import', meta: { rapport } })` — pour qu'on
    // puisse « comprendre après coup pourquoi l'import a échoué ». Le rapport
    // contient alors l'organigramme du client, en clair, dans une table dont la
    // rétention n'est pas celle des données de mission et que personne ne purge.
    //
    // Le nom d'unité employé ici est une SENTINELLE : une chaîne improbable, dont
    // la présence dans `activity_log` ne peut avoir qu'une seule cause.
    const admin = await creerCompte('admin', 'journal-sans-cellules');
    const missionId = await semerMission('journal-sans-cellules', admin.id);
    const sentinelle = 'ZorglubadeFactice';

    const contenu = fichierCsv([
      { ref: 'ja', name: `Racine factice ${sentinelle}`, kind: 'groupe' },
      {
        ref: 'jb',
        name: `Service factice ${sentinelle}`,
        kind: 'poste',
        parent_ref: 'ja',
        service_code: 'plomberie',
      },
    ]);

    // Les deux chemins qui produisent un rapport : le contrôle à blanc et le refus.
    await importer(missionId, contenu, { jeton: admin.jeton, aBlanc: true });
    const refus = await importer(missionId, contenu, { jeton: admin.jeton });
    expect(refus.statut, 'le fichier porte un `service_code` hors taxonomie').toBe(422);
    expect(
      refus.corps.includes(sentinelle) || entreesDeRapport(refus.corps).length > 0,
      'le rapport rendu à l’appelant doit exister — c’est lui qu’on ne journalise pas',
    ).toBe(true);

    const journal = await journalSerialise();
    expect(
      journal.includes(sentinelle),
      'Un nom d’unité du fichier client a été retrouvé dans `activity_log`. C’est\n' +
        'l’organigramme du client déversé dans une table d’audit — dont la rétention\n' +
        'n’est pas celle des données de mission, et que personne ne purge.',
    ).toBe(false);
  });
});

// =============================================================================
// 5. CRUD ET PAGINATION KEYSET — curseur `(position, id)` (conception L3 §2)
// =============================================================================
// HYPOTHÈSE D'INTERFACE N° 2 : la charge de création est réduite au strict
// nécessaire — `{ name, kind, parentId? }`. Ces trois noms ne sont pas devinés :
// ce sont les colonnes du 04 passées au camelCase qu'impose 11 §3. Tout le reste
// (`serviceCode`/`serviceRefId`, `sectorCode`/`sectorId`, `countryCode`,
// `headcount`, `timezone`, `inScope`) porte une ambiguïté de nommage que le pack ne
// tranche pas, et qui est éprouvée là où elle EST tranchée : dans le CSV du §35.2.
describe('POST /v1/missions/:id/org-units — création à l’unité', () => {
  it('@critique les SEPT `kind` du §35.2 sont acceptés — `poste` compris — et un huitième est refusé', async () => {
    // LE DÉFAUT ATTRAPÉ : une énumération recopiée de mémoire. Le pack en écrit
    // SEPT (§35.2, §26.3, `CHECK` du 04) ; les listes courtes qu'on retient sont
    // « direction / service / équipe », et `poste` — le niveau le plus fin, celui
    // que le brief du lot nomme expressément (« kind jusqu’à `poste` ») — est le
    // premier à disparaître. L'auditeur ne peut alors plus décrire un poste isolé,
    // qui est pourtant l'unité d'observation du §17 (shadowing).
    //
    // Un `CHECK` en base ne suffirait pas à porter cette exigence : il rendrait un
    // 500 sur une valeur refusée, pas un 400 nommant le champ.
    const admin = await creerCompte('admin', 'kinds');
    const missionId = await semerMission('kinds', admin.id);

    const refuses: string[] = [];
    for (const kind of KINDS_35_2) {
      const reponse = await appeler('POST', urlListe(missionId), {
        jeton: admin.jeton,
        charge: { name: `Unité factice ${kind}`, kind },
      });
      if (reponse.statut !== 201)
        refuses.push(`${kind} → ${String(reponse.statut)} ${reponse.corps}`);
    }
    expect(
      refuses,
      'Les SEPT valeurs du §35.2 sont dues, dans cet ordre :\n' +
        `  ${KINDS_35_2.join(' · ')}\n` +
        'Une valeur manquante retire un NIVEAU entier de l’arbre au consultant.',
    ).toStrictEqual([]);
    expect(await compterUnitesDeLaMission(missionId)).toBe(KINDS_35_2.length);

    const huitieme = await appeler('POST', urlListe(missionId), {
      jeton: admin.jeton,
      charge: { name: 'Unité factice hors énumération', kind: 'departement' },
    });
    expect(
      huitieme.statut,
      'La contre-épreuve : une énumération OUVERTE laisserait entrer n’importe quel\n' +
        'libellé, et la contrainte CHECK du 04 rendrait alors un 500 au lieu d’un 400.',
    ).toBe(400);
    expect(await compterUnitesDeLaMission(missionId), 'aucun effet de bord').toBe(
      KINDS_35_2.length,
    );
  });

  it('@critique un `parentId` appartenant à une AUTRE mission est refusé', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : s'en remettre à la clé étrangère.
    // ═════════════════════════════════════════════════════════════════════════
    // `org_units_parent_id_fkey` référence `org_units(id)` — SANS clause sur
    // `mission_id`, et le 04 n'en prévoit aucune. Une unité de la mission A est donc
    // un parent PARFAITEMENT VALIDE pour une unité de la mission B du point de vue
    // de la base : l'insertion réussit, aucune erreur n'est levée.
    //
    // Ce que ça coûte : l'arbre de la mission B remonte dans celui de la mission A.
    // Un parcours d'ancêtres (couverture, héritage de fuseau §22.2, scoring par
    // branche) traverse alors la frontière entre deux clients — c'est une fuite de
    // données inter-missions produite par une simple erreur de saisie, et aucune
    // route n'en a l'air responsable.
    //
    // Le contrôle ne peut donc vivre QUE dans le service. C'est exactement le genre
    // de règle qu'un test unitaire sur schéma Zod ne peut pas voir.
    const admin = await creerCompte('admin', 'parent-autre-mission');
    const missionA = await semerMission('parent-mission-a', admin.id);
    const missionB = await semerMission('parent-mission-b', admin.id);

    const racineA = await semerUnite({
      missionId: missionA,
      nom: 'Racine factice A',
      kind: 'groupe',
      position: 1,
    });
    const totalAvant = await compterToutesLesUnites();

    const creation = await appeler('POST', urlListe(missionB), {
      jeton: admin.jeton,
      charge: { name: 'Unité factice transfrontalière', kind: 'service', parentId: racineA },
    });
    expect(
      [400, 404, 422],
      'Un parent d’une AUTRE mission doit être refusé par le SERVICE : la clé étrangère\n' +
        'du 04 ne porte pas mission_id et l’accepterait sans broncher.\n' +
        `Statut ${String(creation.statut)} · ${creation.corps}`,
    ).toContain(creation.statut);
    expect(await compterToutesLesUnites(), 'un refus ne laisse pas d’unité derrière lui').toBe(
      totalAvant,
    );

    // Et par la porte de service : le `PATCH`, qui n'a pas de mission dans son URL
    // et doit donc la déduire de l'unité.
    const uniteB = await semerUnite({
      missionId: missionB,
      nom: 'Unité factice B',
      kind: 'service',
      position: 1,
    });
    const rattachement = await appeler('PATCH', `/v1/org-units/${uniteB}`, {
      jeton: admin.jeton,
      charge: { parentId: racineA },
    });
    expect(
      [400, 404, 422],
      `Le PATCH doit refuser le même rattachement : ${rattachement.corps}`,
    ).toContain(rattachement.statut);
    expect((await lireUnite(uniteB))?.parent_id, 'le parent n’a pas bougé').toBeNull();
  });

  it('une création rend une unité `active`, dans le périmètre, avec un identifiant v7', async () => {
    const admin = await creerCompte('admin', 'creation-defauts');
    const missionId = await semerMission('creation-defauts', admin.id);

    const reponse = await appeler('POST', urlListe(missionId), {
      jeton: admin.jeton,
      charge: { name: 'Unité factice créée à la main', kind: 'direction' },
    });
    expect(reponse.statut, `création refusée : ${reponse.corps}`).toBe(201);

    const creee = unite(reponse);
    expect(creee.status, 'une unité créée par le siège est ACTIVE, jamais `proposee`').toBe(
      'active',
    );
    expect(creee.parentId, 'sans `parentId`, l’unité est une racine').toBeNull();
    expect(
      estUuidV7(creee.id),
      `« ${creee.id} » n’est pas un UUID v7. Invariant 1 : org_units est créable hors\n` +
        'ligne (§25.3) ; un DEFAULT gen_random_uuid() produit un v4, non ordonnable.',
    ).toBe(true);

    const enBase = await lireUnite(creee.id);
    expect(enBase?.in_scope, '04 : `in_scope BOOL DEFAULT true`').toBe(true);
    expect(enBase?.proposed_by, 'création siège : aucun proposant').toBeNull();
    expect(enBase?.merged_into_id).toBeNull();
    expect(
      enBase?.position,
      'le curseur de la liste est `(position, id)` : une position nulle le fausse',
    ).not.toBeNull();
  });

  it('deux créations successives portent des identifiants v7 CROISSANTS', async () => {
    // Ce que le v7 achète, et que le v4 ne peut pas donner : l'ordonnancement
    // temporel. Le curseur `(position, id)` s'en sert comme départageur — deux
    // unités de même position se lisent dans l'ordre de leur création. Avec des v4,
    // cet ordre serait ALÉATOIRE mais STABLE : la pagination ne sauterait rien, et
    // le défaut resterait invisible jusqu'au jour où l'arbre s'afficherait dans le
    // désordre. C'est pourquoi il est éprouvé ici, et pas seulement dans le test de
    // pagination.
    const admin = await creerCompte('admin', 'v7-croissants');
    const missionId = await semerMission('v7-croissants', admin.id);

    const identifiants: string[] = [];
    for (const suffixe of ['alpha', 'beta', 'gamma']) {
      const reponse = await appeler('POST', urlListe(missionId), {
        jeton: admin.jeton,
        charge: { name: `Unité factice ${suffixe}`, kind: 'equipe' },
      });
      expect(reponse.statut, `création refusée : ${reponse.corps}`).toBe(201);
      identifiants.push(unite(reponse).id);
    }

    expect(
      [...identifiants].sort((gauche, droite) => gauche.localeCompare(droite)),
      'Trois créations dans cet ordre doivent produire trois identifiants croissants.\n' +
        'Un UUID v4 rendrait cet ordre aléatoire, et le départageur du curseur\n' +
        '`(position, id)` cesserait d’avoir un sens.',
    ).toStrictEqual(identifiants);
  });
});

describe('PATCH /v1/org-units/:id', () => {
  it('@critique le `PATCH` NE PEUT PAS écrire `status` ni `mergedIntoId` — la porte de service est fermée', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // ARBITRAGE DU 2026-08-29, MOT POUR MOT : « plus un `PATCH` dont le schéma
    // d'entrée EXCLUT `status` et `mergedIntoId` : les laisser dans un PATCH
    // générique CONTOURNERAIT TOUTE LA RÈGLE §25.3 PAR LA PORTE DE SERVICE. »
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : un `PATCH` bâti par symétrie avec le
    // schéma de la table — « toutes les colonnes, en option ». C'est ce qu'on écrit
    // quand on dérive le schéma d'entrée du modèle de données, et c'est presque
    // toujours raisonnable. Ici, non : `status` et `merged_into_id` sont les DEUX
    // colonnes que le §25.3 confie à des routes dédiées (`validate`, `merge`) parce
    // que leur écriture s'accompagne d'effets qu'aucun `PATCH` ne produit — le
    // ré-rattachement des entretiens, le re-parentage des enfants, la trace au
    // journal.
    //
    // Un `PATCH {status: 'fusionnee'}` accepté sortirait donc une unité de l'arbre
    // actif EN ABANDONNANT ses entretiens : ils resteraient rattachés à une unité
    // invisible, hors couverture et hors scoring. Rien ne planterait. C'est
    // exactement l'« écrasement silencieux » que l'invariant 7 interdit.
    //
    // Le test n'impose PAS le statut du refus (400 par le compilateur Zod si les
    // clés sont interdites, ou 200 en les IGNORANT si le schéma les strippe) : il
    // impose que la BASE N'AIT PAS BOUGÉ. C'est la seule formulation qui couvre les
    // deux implémentations défendables — et le seul défaut qui compte.
    const admin = await creerCompte('admin', 'patch-porte-de-service');
    const missionId = await semerMission('patch-porte-de-service', admin.id);
    const cible = await semerUnite({
      missionId,
      nom: 'Cible factice de fusion',
      kind: 'service',
      position: 1,
    });
    const source = await semerUnite({
      missionId,
      nom: 'Unité factice à ne pas fusionner par la porte de service',
      kind: 'service',
      position: 2,
      status: 'proposee',
      proposePar: admin.id,
    });

    const tentatives: readonly Readonly<Record<string, unknown>>[] = [
      { status: 'active' },
      { status: 'fusionnee' },
      { mergedIntoId: cible },
      { status: 'fusionnee', mergedIntoId: cible },
    ];

    for (const charge of tentatives) {
      const reponse = await appeler('PATCH', `/v1/org-units/${source}`, {
        jeton: admin.jeton,
        charge,
      });
      const apres = await lireUnite(source);
      expect(
        apres?.status,
        `Le PATCH ${JSON.stringify(charge)} a modifié le statut de l’unité.\n` +
          'Seules `POST /v1/org-units/:id/validate` et `/merge` peuvent l’écrire : ce sont\n' +
          'elles qui portent les effets du §25.3 (ré-rattachement des entretiens,\n' +
          `re-parentage, trace). Réponse : ${String(reponse.statut)} ${reponse.corps}`,
      ).toBe('proposee');
      expect(
        apres?.merged_into_id,
        'Écrire `merged_into_id` sans fusionner produirait une unité qui SE DIT fusionnée\n' +
          'sans que rien n’ait été déplacé — la trace mentirait sur ce qui s’est passé.',
      ).toBeNull();
    }
  });

  it('@critique un `PATCH` ne peut pas rendre une unité ancêtre d’elle-même, même à trois niveaux', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // L'IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE : `if (parentId === id) refuser`.
    // ═════════════════════════════════════════════════════════════════════════
    // C'est le contrôle qu'on écrit spontanément, et il attrape le cas trivial.
    // Il ne voit RIEN du cas réel : A → B → C, puis on rattache A sous C. Aucune
    // des trois lignes n'est son propre parent ; le trio forme pourtant un anneau
    // détaché de l'arbre, et tout parcours d'ancêtres boucle indéfiniment.
    //
    // Sur une console, ce n'est pas une erreur 500 : c'est une requête qui ne rend
    // jamais, un processus qui monte à 100 % de CPU, et un incident d'exploitation
    // dont l'origine est un glisser-déposer dans l'arbre.
    //
    // Le test éprouve les DEUX profondeurs : l'anneau à trois branches ET le cas
    // trivial. Le second seul laisserait passer le premier ; le premier seul
    // laisserait passer une implémentation qui aurait oublié le cas dégénéré.
    const admin = await creerCompte('admin', 'patch-cycle');
    const missionId = await semerMission('patch-cycle', admin.id);
    const a = await semerUnite({ missionId, nom: 'Aïeule factice', kind: 'groupe', position: 1 });
    const b = await semerUnite({
      missionId,
      nom: 'Mère factice',
      kind: 'direction',
      parentId: a,
      position: 2,
    });
    const c = await semerUnite({
      missionId,
      nom: 'Fille factice',
      kind: 'service',
      parentId: b,
      position: 3,
    });

    const photoAvant = await photographierArbre(missionId);

    const anneau = await appeler('PATCH', `/v1/org-units/${a}`, {
      jeton: admin.jeton,
      charge: { parentId: c },
    });
    expect(
      [400, 409, 422],
      `Rattacher l’aïeule sous sa petite-fille forme un anneau : ${anneau.corps}`,
    ).toContain(anneau.statut);

    const trivial = await appeler('PATCH', `/v1/org-units/${b}`, {
      jeton: admin.jeton,
      charge: { parentId: b },
    });
    expect(
      [400, 409, 422],
      `Une unité ne peut pas être son propre parent : ${trivial.corps}`,
    ).toContain(trivial.statut);

    await attendreArbreInchange(
      missionId,
      photoAvant,
      'Un rattachement REFUSÉ ne doit rien laisser derrière lui — surtout pas un\n' +
        'parent à moitié écrit.',
    );
  });

  it('un `PATCH` modifie ce qu’on lui donne, et RIEN d’autre', async () => {
    // « `null` efface, un champ absent ne touche à rien » est la convention déjà
    // tenue par `companies` (L3a). L'éprouver ici évite qu'un second style de PATCH
    // s'installe dans le même produit : deux conventions de mise à jour, c'est une
    // de trop, et c'est celle que le front applique de travers.
    const admin = await creerCompte('admin', 'patch-portee');
    const missionId = await semerMission('patch-portee', admin.id);
    const parent = await semerUnite({
      missionId,
      nom: 'Parent factice portée',
      kind: 'groupe',
      position: 1,
    });
    const enfant = await semerUnite({
      missionId,
      nom: 'Enfant factice portée',
      kind: 'service',
      parentId: parent,
      position: 2,
    });

    const renommage = await appeler('PATCH', `/v1/org-units/${enfant}`, {
      jeton: admin.jeton,
      charge: { name: 'Enfant factice renommé' },
    });
    expect(renommage.statut, `renommage refusé : ${renommage.corps}`).toBe(200);

    const apres = await lireUnite(enfant);
    expect(apres?.name).toBe('Enfant factice renommé');
    expect(apres?.parent_id, 'le `parentId` absent de la charge ne bouge pas').toBe(parent);
    expect(apres?.kind, 'le `kind` absent de la charge ne bouge pas').toBe('service');
    expect(apres?.status, 'le statut ne bouge jamais par PATCH').toBe('active');
  });

  it('un identifiant inconnu rend 404, un identifiant non-UUID rend 400', async () => {
    const admin = await creerCompte('admin', 'patch-identifiants');
    const inconnu = await appeler('PATCH', `/v1/org-units/${uuidv7()}`, {
      jeton: admin.jeton,
      charge: { name: 'Sans objet' },
    });
    expect(inconnu.statut).toBe(404);
    expect(inconnu.code).toBe('NOT_FOUND');

    const malforme = await appeler('PATCH', '/v1/org-units/pas-un-uuid', {
      jeton: admin.jeton,
      charge: { name: 'Sans objet' },
    });
    expect(
      malforme.statut,
      'Un identifiant malformé est une requête invalide (400), pas une ressource\n' +
        'absente (404) — et surtout pas un 500 remonté du pilote PostgreSQL, qui refuse\n' +
        'une chaîne non-UUID sur une colonne `uuid`.',
    ).toBe(400);
  });
});

describe('GET /v1/missions/:id/org-units — pagination keyset, curseur `(position, id)`', () => {
  it('@critique aucune unité n’est sautée ni servie deux fois, deux positions ÉGALES enjambant une frontière de page', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // LA DISPOSITION DES FIXTURES EST LE TEST — elle n'est pas décorative.
    // ═════════════════════════════════════════════════════════════════════════
    // Sept unités, `limit=3`. DEUX D'ENTRE ELLES PARTAGENT LA MÊME `position`, et
    // elles sont placées en 3ᵉ et 4ᵉ rang : la frontière de la première page tombe
    // EXACTEMENT ENTRE LES DEUX.
    //
    // C'est la seule disposition où un curseur NON COMPOSITE se trahit. Un
    // `WHERE position > $1` reprendrait après la position 3 et SAUTERAIT la seconde
    // unité de position 3 — en silence, sans erreur, sans trou visible dans la
    // réponse. L'unité manquante n'apparaîtrait plus dans l'arbre du siège, ne
    // recevrait aucun entretien, et sortirait de la couverture sans que rien ne le
    // signale.
    //
    // Et les positions égales ne sont PAS un cas tordu : `position` est un `INTEGER`
    // NULLABLE sans contrainte d'unicité (04), alimenté par un import de cent lignes
    // puis par des créations à la main. L'égalité est le cas NORMAL.
    //
    // Le départageur est l'`id`, donc l'ordre de création — ce qui n'a de sens que
    // parce que ce sont des UUID v7 (voir le test « deux créations successives »).
    const admin = await creerCompte('admin', 'curseur');
    const missionId = await semerMission('curseur', admin.id);

    const positions = [1, 2, 3, 3, 4, 5, 6];
    const attendus: string[] = [];
    for (const [rang, position] of positions.entries()) {
      attendus.push(
        await semerUnite({
          missionId,
          nom: `Unité factice de rang ${String(rang)}`,
          kind: 'service',
          position,
        }),
      );
    }

    const lus = await tousLesIdentifiants(missionId, admin.jeton, 3);

    expect(
      lus,
      'La pagination doit rendre les SEPT unités, dans l’ordre `(position, id)`, sans\n' +
        'doublon et sans trou. Six identifiants au lieu de sept = une unité SAUTÉE à la\n' +
        'frontière de page, là où deux positions sont égales : c’est la signature d’un\n' +
        'curseur non composite.',
    ).toStrictEqual(attendus);

    expect(new Set(lus).size, 'aucune unité servie deux fois').toBe(attendus.length);
  });

  it('une unité de `position` NULLE apparaît EXACTEMENT une fois dans la pagination', async () => {
    // `org_units.position` est NULLABLE (04). Une unité proposée par le terrain
    // (§25.3) arrive par la sync sans position — le client hors ligne n'a aucun
    // moyen de savoir où elle se range. Un keyset écrit sans y penser
    // (`WHERE (position, id) > ($1, $2)`) traite tout NULL comme incomparable :
    // l'unité disparaît de la liste, ou bien elle reparaît à chaque page.
    //
    // Le test n'impose PAS où elle se range (le pack ne le dit pas — `NULLS FIRST`
    // ou `NULLS LAST` sont deux choix défendables) : il impose qu'elle soit là, une
    // fois, et une seule.
    const admin = await creerCompte('admin', 'curseur-null');
    const missionId = await semerMission('curseur-null', admin.id);

    const avecPosition: string[] = [];
    for (const position of [1, 2, 3, 4]) {
      avecPosition.push(
        await semerUnite({
          missionId,
          nom: `Unité factice positionnée ${String(position)}`,
          kind: 'service',
          position,
        }),
      );
    }
    const sansPosition = await semerUnite({
      missionId,
      nom: 'Unité factice sans position',
      kind: 'service',
      position: null,
    });

    const lus = await tousLesIdentifiants(missionId, admin.jeton, 2);
    expect(
      lus.filter((identifiant) => identifiant === sansPosition).length,
      'Une unité de position NULLE doit apparaître UNE fois — ni zéro (elle sort de\n' +
        'l’arbre sans un mot) ni deux (elle serait comptée deux fois en couverture).',
    ).toBe(1);
    expect([...lus].sort(), 'toutes les unités, aucune de plus').toStrictEqual(
      [...avecPosition, sansPosition].sort(),
    );
  });

  it('un curseur illisible rend 400 INVALID_CURSOR, jamais une page silencieusement fausse', async () => {
    const admin = await creerCompte('admin', 'curseur-illisible');
    const missionId = await semerMission('curseur-illisible', admin.id);
    await semerUnite({ missionId, nom: 'Unité factice curseur', kind: 'service', position: 1 });

    const reponse = await appeler('GET', `${urlListe(missionId)}?limit=2&after=nawak`, {
      jeton: admin.jeton,
    });
    expect(
      reponse.statut,
      'Un curseur illisible doit être DÉNONCÉ. Le repli silencieux « je recommence au\n' +
        'début » est le pire des choix : le client boucle sur la première page sans\n' +
        'jamais atteindre la fin, et personne ne voit d’erreur.',
    ).toBe(400);
    expect(reponse.code).toBe('INVALID_CURSOR');
  });

  it('la liste ne montre QUE les unités de la mission demandée', async () => {
    // Deux missions, deux arbres. Une jointure oubliée sur `mission_id` mélangerait
    // les organigrammes de deux clients dans le même écran — et l'index
    // `idx_org_units_mission_id` du 04 existe précisément pour que ce filtre soit
    // le chemin normal.
    const admin = await creerCompte('admin', 'liste-cloison');
    const missionA = await semerMission('liste-cloison-a', admin.id);
    const missionB = await semerMission('liste-cloison-b', admin.id);
    const dansA = await semerUnite({
      missionId: missionA,
      nom: 'Unité factice de A',
      kind: 'service',
      position: 1,
    });
    await semerUnite({
      missionId: missionB,
      nom: 'Unité factice de B',
      kind: 'service',
      position: 1,
    });

    expect(await tousLesIdentifiants(missionA, admin.jeton, 50)).toStrictEqual([dansA]);
  });
});

// =============================================================================
// 6. §25.3 — PROPOSITION D'UNITÉ DEPUIS LE TERRAIN : VALIDER OU FUSIONNER
// =============================================================================
// « Un auditeur crée hors ligne une unité `proposee` […] et y rattache immédiatement
//   des entretiens. À la sync : alerte au lead/admin → VALIDER (devient `active`,
//   entre dans la couverture et le scoring) ou FUSIONNER avec une unité existante
//   (`fusionnee` + `merged_into_id` ; LES ENTRETIENS SONT RE-RATTACHÉS
//   AUTOMATIQUEMENT). » (03 §25.3)
//
// HYPOTHÈSE D'INTERFACE N° 3 : la charge de `merge` est `{ mergedIntoId, motif }`.
// Le pack ne nomme pas ce champ ; `mergedIntoId` est retenu parce que c'est le
// camelCase de la colonne `org_units.merged_into_id` (04) et le vocabulaire employé
// par l'arbitrage du 2026-08-29 (« un PATCH dont le schéma exclut `status` et
// `mergedIntoId` »). `targetId` était l'autre candidat. UNE SEULE fonction change si
// l'implémenteur a choisi autrement : `chargeFusion`. Ambiguïté remontée au rapport.

function chargeFusion(cible: string, motif: string): Readonly<Record<string, unknown>> {
  return { mergedIntoId: cible, motif };
}

let compteurQuestion = 0;

/** Sème bloc + question + `mission_questions` et rend l'id de la question de mission. */
async function semerQuestionDeMission(missionId: string): Promise<string> {
  compteurQuestion += 1;
  const marqueur = String(compteurQuestion);
  const blocId = uuidv7();
  await bd().query(
    `INSERT INTO blocks (id, code, label_fr, position, is_default) VALUES ($1, $2, $3, 1, false)`,
    [blocId, `l3c_essai_${marqueur}`, `Bloc factice L3c ${marqueur}`],
  );
  const questionId = uuidv7();
  await bd().query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                            created_at, updated_at)
     VALUES ($1, $2, 1, 'active', $3, 'yes_no', 'banque', now(), now())`,
    [questionId, blocId, `Question factice L3c ${marqueur} ?`],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version,
                                    text_snapshot, position)
     VALUES ($1, $2, $3, 1, $4, 1)`,
    [missionQuestionId, missionId, questionId, `Question factice L3c ${marqueur} ?`],
  );
  return missionQuestionId;
}

/**
 * Sème un entretien conduit sur une unité, avec UNE réponse.
 *
 * `person_name` porte une SENTINELLE : c'est une donnée personnelle que 11 §2
 * interdit nommément dans les journaux. La fusion écrit une trace ; ce test vérifie
 * que cette trace nomme des IDENTIFIANTS et jamais la personne interrogée.
 */
async function semerEntretienAvecReponse(
  missionId: string,
  uniteId: string,
  conducteur: string,
  sentinellePersonne: string,
): Promise<string> {
  const entretienId = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, person_name, org_unit_id,
                             status, schedule_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', $4, $5, 'termine', 'realise', now(), now())`,
    [entretienId, missionId, conducteur, sentinellePersonne, uniteId],
  );
  const missionQuestionId = await semerQuestionDeMission(missionId);
  await bd().query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now(), now())`,
    [uuidv7(), entretienId, missionQuestionId, JSON.stringify({ oui: true })],
  );
  return entretienId;
}

async function compterReponsesDeLaMission(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    `SELECT count(*) AS total FROM answers a
       JOIN interviews i ON i.id = a.interview_id
      WHERE i.mission_id = $1`,
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterEntretiensSurUnite(uniteId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM interviews WHERE org_unit_id = $1',
    [uniteId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

/** Entretiens dont l'unité de rattachement n'existe plus : toujours zéro. */
async function compterEntretiensOrphelins(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    `SELECT count(*) AS total FROM interviews i
      WHERE i.mission_id = $1
        AND NOT EXISTS (SELECT 1 FROM org_units u WHERE u.id = i.org_unit_id)`,
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

describe('§25.3 — qualifier une unité proposée par le terrain', () => {
  it('@critique une unité `proposee` n’est JAMAIS présentée comme `active` avant sa validation', async () => {
    // CE QUI EST EN JEU : §25.3 dit qu'une unité validée « entre dans la couverture
    // et le scoring ». La réciproque est la règle : tant qu'elle n'est pas validée,
    // elle n'y entre pas. Une implémentation qui rendrait `status: 'active'` pour
    // toute unité — parce que le champ n'est pas mappé, ou parce qu'il est calculé
    // depuis une valeur par défaut — ferait entrer dans le dénominateur de
    // couverture une unité que personne n'a qualifiée. Le taux de couverture d'un
    // audit deviendrait faux, et c'est un chiffre qui part au client.
    //
    // Le test n'impose PAS que la liste MASQUE les unités proposées : le siège doit
    // au contraire les voir pour les qualifier (§25.3 : « alerte au lead/admin »).
    // Il impose qu'elles ne soient jamais MAQUILLÉES en actives.
    const admin = await creerCompte('admin', 'proposee-visible');
    const consultant = await creerCompte('consultant', 'proposee-auteur');
    const missionId = await semerMission('proposee-visible', admin.id);
    await affecter(missionId, consultant.id, 'consultant');

    const proposee = await semerUnite({
      missionId,
      nom: 'Unité factice proposée sur le terrain',
      kind: 'equipe',
      status: 'proposee',
      position: 1,
      proposePar: consultant.id,
    });

    const reponse = await appeler('GET', `${urlListe(missionId)}?limit=50`, { jeton: admin.jeton });
    expect(reponse.statut, `lecture refusée : ${reponse.corps}`).toBe(200);
    const listee = page(reponse).items.find((item) => item.id === proposee);
    if (listee !== undefined) {
      expect(
        listee.status,
        'Une unité PROPOSÉE listée doit l’être avec son vrai statut. La montrer\n' +
          '« active » la ferait entrer dans le dénominateur de couverture sans que\n' +
          'personne ne l’ait qualifiée — et ce taux part au client.',
      ).toBe('proposee');
    }
    expect((await lireUnite(proposee))?.status, 'la base ne bouge pas à la lecture').toBe(
      'proposee',
    );
  });

  it('@critique `validate` fait passer `proposee` → `active`, et laisse une trace', async () => {
    const admin = await creerCompte('admin', 'validate');
    const consultant = await creerCompte('consultant', 'validate-auteur');
    const missionId = await semerMission('validate', admin.id);
    await affecter(missionId, consultant.id, 'consultant');

    const proposee = await semerUnite({
      missionId,
      nom: 'Unité factice à valider',
      kind: 'service',
      status: 'proposee',
      position: 1,
      proposePar: consultant.id,
    });

    const reponse = await appeler('POST', `/v1/org-units/${proposee}/validate`, {
      jeton: admin.jeton,
      charge: {},
    });
    expect(reponse.statut, `validation refusée : ${reponse.corps}`).toBe(200);

    const apres = await lireUnite(proposee);
    expect(apres?.status, '§25.3 : « valider (devient `active`) »').toBe('active');
    expect(
      apres?.proposed_by,
      '`proposed_by` SURVIT à la validation : effacer l’auteur de la proposition\n' +
        'détruirait la seule trace de l’origine terrain de cette unité (invariant 7).',
    ).toBe(consultant.id);
    expect(apres?.merged_into_id, 'valider n’est pas fusionner').toBeNull();

    expect(
      await compterEntreesJournal(proposee),
      'Qualifier une unité est un ACTE, pas une lecture : il laisse une ligne\n' +
        '`activity_log`. Sans elle, personne ne peut dire QUI a fait entrer cette unité\n' +
        'dans la couverture, ni quand.',
    ).toBeGreaterThan(0);
  });

  it('valider une unité DÉJÀ active est refusé, sans effet', async () => {
    // Une unité active n'a rien à valider : accepter l'appel écrirait une seconde
    // ligne de journal pour un acte qui n'a pas eu lieu, et rendrait la trace
    // d'audit bavarde là où elle doit être exacte.
    const admin = await creerCompte('admin', 'validate-deja-active');
    const missionId = await semerMission('validate-deja-active', admin.id);
    const active = await semerUnite({
      missionId,
      nom: 'Unité factice déjà active',
      kind: 'service',
      position: 1,
    });

    const reponse = await appeler('POST', `/v1/org-units/${active}/validate`, {
      jeton: admin.jeton,
      charge: {},
    });
    expect(
      reponse.statut,
      `Valider ce qui est déjà validé est un conflit d’ÉTAT : ${reponse.corps}`,
    ).toBe(409);
    expect((await lireUnite(active))?.status).toBe('active');
  });

  it('@critique `merge` : les entretiens SUIVENT, les réponses sont TOUTES là, et la ligne source SURVIT', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // LE TEST LE PLUS COÛTEUX DU §25.3, ET LES DEUX IMPLÉMENTATIONS FAUSSES QU'IL
    // ATTRAPE — OPPOSÉES L'UNE À L'AUTRE.
    // ═════════════════════════════════════════════════════════════════════════
    // ① « FUSIONNER = SUPPRIMER LA SOURCE ». C'est la lecture naturelle du mot, et
    //    c'est un `DELETE FROM org_units WHERE id = $1`. La clé étrangère
    //    `interviews.org_unit_id` (NOT NULL) le refuserait… si les entretiens ont
    //    déjà été déplacés. Ils l'ont été : la suppression PASSE, et l'on perd
    //    définitivement `proposed_by`, la date de proposition, et le fait même
    //    qu'une proposition ait eu lieu. Invariant 7 : « rien n'est jamais
    //    silencieusement écrasé ou supprimé ».
    // ② « FUSIONNER = MARQUER LA SOURCE ». On écrit `status='fusionnee'` et
    //    `merged_into_id`, et on s'arrête là — parce que la ligne, elle, est bien
    //    conservée. Les entretiens restent alors accrochés à une unité INVISIBLE :
    //    hors de l'arbre actif, hors couverture, hors scoring. Les réponses existent
    //    toujours en base, personne ne les compte plus. C'est la perte la plus chère
    //    d'un audit — des entretiens réalisés qui n'apparaissent nulle part — et
    //    elle ne produit aucune erreur.
    //
    // Les deux moitiés sont donc assérées ENSEMBLE : la ligne source EXISTE ENCORE,
    // et les entretiens ONT BOUGÉ. Chacune seule laisse passer la faute opposée.
    //
    // Le compte de réponses est relu à l'échelle de la MISSION, pas de l'unité : une
    // `answer` ne référence jamais une unité (elle pend à un `interview`, qui seul
    // porte `org_unit_id`), donc c'est le seul comptage qui prouve qu'aucune n'a
    // disparu en chemin.
    const admin = await creerCompte('admin', 'merge');
    const consultant = await creerCompte('consultant', 'merge-auteur');
    const missionId = await semerMission('merge', admin.id);
    await affecter(missionId, consultant.id, 'consultant');
    const sentinellePersonne = 'PrenomFactice NomFactice de la personne interrogee';

    const cible = await semerUnite({
      missionId,
      nom: 'Unité factice cible',
      kind: 'service',
      position: 1,
    });
    const source = await semerUnite({
      missionId,
      nom: 'Unité factice proposée à fusionner',
      kind: 'service',
      status: 'proposee',
      position: 2,
      proposePar: consultant.id,
    });
    const enfant = await semerUnite({
      missionId,
      nom: 'Unité factice enfant de la source',
      kind: 'poste',
      parentId: source,
      position: 3,
    });

    const entretiens = [
      await semerEntretienAvecReponse(missionId, source, consultant.id, sentinellePersonne),
      await semerEntretienAvecReponse(missionId, source, consultant.id, sentinellePersonne),
    ];

    const reponsesAvant = await compterReponsesDeLaMission(missionId);
    expect(reponsesAvant, 'deux entretiens, deux réponses').toBe(2);
    const totalUnitesAvant = await compterUnitesDeLaMission(missionId);

    const reponse = await appeler('POST', `/v1/org-units/${source}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(cible, 'Doublon relevé au cadrage — libellé différent, même équipe'),
    });
    expect(reponse.statut, `fusion refusée : ${reponse.corps}`).toBe(200);

    // ── ① LA LIGNE SOURCE SURVIT ──────────────────────────────────────────────
    const apresSource = await lireUnite(source);
    expect(
      apresSource,
      'LA LIGNE SOURCE A ÉTÉ SUPPRIMÉE. Invariant 7 : rien n’est jamais silencieusement\n' +
        'supprimé. Avec elle disparaissent `proposed_by`, la date de proposition, et la\n' +
        'preuve qu’une proposition terrain a eu lieu.',
    ).toBeDefined();
    expect(apresSource?.status, '§25.3 : `fusionnee`').toBe('fusionnee');
    expect(apresSource?.merged_into_id, '§25.3 : `merged_into_id` pointe la cible').toBe(cible);
    expect(apresSource?.proposed_by, 'l’auteur de la proposition reste lisible').toBe(
      consultant.id,
    );
    expect(await compterUnitesDeLaMission(missionId), 'aucune ligne n’a disparu de la table').toBe(
      totalUnitesAvant,
    );

    // ── ② LES ENTRETIENS ONT SUIVI ────────────────────────────────────────────
    expect(
      await compterEntretiensSurUnite(source),
      'LES ENTRETIENS SONT RESTÉS SUR UNE UNITÉ INVISIBLE. §25.3 : « les entretiens\n' +
        'sont re-rattachés AUTOMATIQUEMENT ». Laissés là, ils sortent de la couverture\n' +
        'et du scoring sans qu’aucune erreur ne soit levée : c’est la perte la plus\n' +
        'chère d’un audit, et la plus discrète.',
    ).toBe(0);
    expect(await compterEntretiensSurUnite(cible), 'les deux entretiens sont sur la cible').toBe(2);
    expect(await compterEntretiensOrphelins(missionId), 'aucun entretien orphelin').toBe(0);
    expect(
      await compterReponsesDeLaMission(missionId),
      'Le nombre de réponses doit être STRICTEMENT identique avant et après. Une\n' +
        'réponse perdue est un entretien à refaire chez le client.',
    ).toBe(reponsesAvant);

    // `conducted_by` est IMMUABLE après coup (§34.4 : « les sessions réalisées
    // restent à leur auteur — l'historique d'un audit ne se réécrit jamais »).
    const conducteurs = await bd().query<{ conducted_by: string }>(
      'SELECT conducted_by FROM interviews WHERE id = ANY($1::uuid[])',
      [entretiens],
    );
    expect(
      conducteurs.rows.map((ligne) => ligne.conducted_by),
      'La fusion déplace le RATTACHEMENT, jamais la paternité de l’entretien.',
    ).toStrictEqual([consultant.id, consultant.id]);

    // ── LES ENFANTS SONT RE-PARENTÉS ──────────────────────────────────────────
    expect(
      (await lireUnite(enfant))?.parent_id,
      'Un enfant laissé sous une unité fusionnée serait détaché de l’arbre actif :\n' +
        'invisible au siège, alors qu’il porte peut-être ses propres entretiens.',
    ).toBe(cible);

    // ── L'ARBRE ACTIF NE MONTRE PLUS LA SOURCE ────────────────────────────────
    const listes = await tousLesIdentifiants(missionId, admin.jeton, 50);
    expect(
      listes.includes(source),
      'Une unité FUSIONNÉE ne réapparaît pas dans l’arbre actif — elle y ferait doublon\n' +
        'avec sa cible, ce que la fusion existait précisément pour supprimer.',
    ).toBe(false);
    expect(listes.includes(cible), 'la cible, elle, est bien là').toBe(true);
    expect(listes.includes(enfant), 'l’enfant re-parenté reste visible').toBe(true);

    // ── LA TRACE : DES IDENTIFIANTS, JAMAIS UNE PERSONNE ──────────────────────
    expect(
      await compterEntreesJournal(source),
      'La fusion déplace des entretiens réalisés : sans trace, l’ancien rattachement\n' +
        'devient irretrouvable, et l’invariant 7 (« toute correction est une révision\n' +
        'tracée ») n’est plus tenu.',
    ).toBeGreaterThan(0);
    const journal = await journalSerialise();
    expect(
      journal.includes(sentinellePersonne),
      'Le nom de la personne interrogée a été retrouvé dans `activity_log`. 11 §2 :\n' +
        '« aucune donnée personnelle dans les logs — `person_name`, emails et contenus de\n' +
        'réponse interdits ». Une trace de fusion nomme des IDENTIFIANTS d’entretiens.',
    ).toBe(false);
  });

  it('@critique seule une unité `proposee` se fusionne, et seulement vers une cible `active`', async () => {
    // ── POURQUOI CES DEUX GARDE-FOUS, ET PAS UN DE PLUS ──────────────────────
    // §25.3 réserve la fusion à la qualification d'une proposition TERRAIN. Fusionner
    // une unité ACTIVE serait une refonte d'arbre déguisée : elle emporterait des
    // entretiens du siège sans passer par la moindre validation d'étape.
    //
    // Et la cible doit être `active` : une CHAÎNE de fusions (A → B, B → C) rendrait
    // `merged_into_id` non transitif. Tout code qui suit le pointeur une seule fois
    // — c'est-à-dire tout code écrit sans y penser — atterrirait sur une unité
    // elle-même fusionnée, donc invisible. Les entretiens de A seraient alors sur une
    // unité hors arbre, exactement le défaut que la fusion existe pour éviter.
    const admin = await creerCompte('admin', 'merge-gardes');
    const missionId = await semerMission('merge-gardes', admin.id);

    const active = await semerUnite({
      missionId,
      nom: 'Unité factice active source',
      kind: 'service',
      position: 1,
    });
    const cible = await semerUnite({
      missionId,
      nom: 'Unité factice cible garde',
      kind: 'service',
      position: 2,
    });
    const proposee = await semerUnite({
      missionId,
      nom: 'Unité factice proposée garde',
      kind: 'service',
      status: 'proposee',
      position: 3,
      proposePar: admin.id,
    });
    const dejaFusionnee = await semerUnite({
      missionId,
      nom: 'Unité factice déjà fusionnée',
      kind: 'service',
      status: 'fusionnee',
      position: 4,
    });

    const photoAvant = await photographierArbre(missionId);

    const sourceActive = await appeler('POST', `/v1/org-units/${active}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(cible, 'tentative sur une unité active'),
    });
    expect(
      sourceActive.statut,
      `Seule une unité PROPOSÉE se fusionne (§25.3) : ${sourceActive.corps}`,
    ).toBe(409);

    const cibleProposee = await appeler('POST', `/v1/org-units/${proposee}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(dejaFusionnee, 'tentative de chaîne de fusion'),
    });
    expect(
      cibleProposee.statut,
      `La cible doit être ACTIVE — pas de chaîne de fusions : ${cibleProposee.corps}`,
    ).toBe(409);

    const surSoiMeme = await appeler('POST', `/v1/org-units/${proposee}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(proposee, 'tentative de fusion sur soi-même'),
    });
    expect(
      [400, 409, 422],
      `Une unité ne se fusionne pas dans elle-même : ${surSoiMeme.corps}`,
    ).toContain(surSoiMeme.statut);

    await attendreArbreInchange(
      missionId,
      photoAvant,
      'Trois fusions REFUSÉES ne doivent avoir touché aucune ligne.',
    );
  });

  it('@critique une cible d’une AUTRE mission est refusée', async () => {
    // Le même défaut que le `parentId` transfrontalier, sur un chemin différent :
    // `org_units_merged_into_id_fkey` ne porte pas `mission_id`. Accepter ferait
    // migrer les ENTRETIENS d'un client vers l'arbre d'un autre — une fuite de
    // données inter-missions dont l'origine serait un choix dans une liste
    // déroulante.
    const admin = await creerCompte('admin', 'merge-transfrontalier');
    const missionA = await semerMission('merge-frontiere-a', admin.id);
    const missionB = await semerMission('merge-frontiere-b', admin.id);

    const cibleA = await semerUnite({
      missionId: missionA,
      nom: 'Cible factice mission A',
      kind: 'service',
      position: 1,
    });
    const proposeeB = await semerUnite({
      missionId: missionB,
      nom: 'Proposée factice mission B',
      kind: 'service',
      status: 'proposee',
      position: 1,
      proposePar: admin.id,
    });
    const entretien = await semerEntretienAvecReponse(
      missionB,
      proposeeB,
      admin.id,
      'PersonneFactice mission B',
    );

    const reponse = await appeler('POST', `/v1/org-units/${proposeeB}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(cibleA, 'fusion vers une autre mission'),
    });
    expect(
      [400, 404, 409, 422],
      `Une cible d’une autre mission doit être refusée : ${reponse.corps}`,
    ).toContain(reponse.statut);

    expect((await lireUnite(proposeeB))?.status, 'la source n’a pas bougé').toBe('proposee');
    expect((await lireUnite(proposeeB))?.merged_into_id).toBeNull();
    const rattachement = await bd().query<{ org_unit_id: string }>(
      'SELECT org_unit_id FROM interviews WHERE id = $1',
      [entretien],
    );
    expect(
      rattachement.rows[0]?.org_unit_id,
      'L’entretien de la mission B ne doit surtout pas avoir migré vers l’arbre de A.',
    ).toBe(proposeeB);
  });

  it('fusionner deux fois la même unité est refusé, et ne réécrit pas la première cible', async () => {
    // Le double clic, ou le ré-essai sur une requête lente. Une seconde fusion
    // acceptée écraserait `merged_into_id` : l'unité pointerait une cible, ses
    // entretiens une autre. La trace ne dirait plus où sont partis les entretiens.
    const admin = await creerCompte('admin', 'merge-deux-fois');
    const missionId = await semerMission('merge-deux-fois', admin.id);
    const premiere = await semerUnite({
      missionId,
      nom: 'Première cible factice',
      kind: 'service',
      position: 1,
    });
    const seconde = await semerUnite({
      missionId,
      nom: 'Seconde cible factice',
      kind: 'service',
      position: 2,
    });
    const source = await semerUnite({
      missionId,
      nom: 'Unité factice fusionnée deux fois',
      kind: 'service',
      status: 'proposee',
      position: 3,
      proposePar: admin.id,
    });

    const premiereFusion = await appeler('POST', `/v1/org-units/${source}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(premiere, 'première fusion'),
    });
    expect(premiereFusion.statut, `première fusion refusée : ${premiereFusion.corps}`).toBe(200);

    const secondeFusion = await appeler('POST', `/v1/org-units/${source}/merge`, {
      jeton: admin.jeton,
      charge: chargeFusion(seconde, 'seconde fusion'),
    });
    expect(
      secondeFusion.statut,
      `Une unité déjà fusionnée ne se re-fusionne pas : ${secondeFusion.corps}`,
    ).toBe(409);
    expect(
      (await lireUnite(source))?.merged_into_id,
      'La première cible reste la vérité : réécrire ce pointeur ferait mentir la trace\n' +
        'sur la destination réelle des entretiens.',
    ).toBe(premiere);
  });
});

// =============================================================================
// 7. RBAC SERVEUR — LA MATRICE RÔLE × ROUTE, REFUS COMPRIS (invariant 3)
// =============================================================================
// « RBAC serveur systématique. » Un droit non testé est un droit non tenu — et un
// REFUS non testé est un refus qu'on découvre absent en recette.
//
// ── CE QUE LE PACK TRANCHE, ET CE QU'IL LAISSE OUVERT ────────────────────────
// TRANCHÉ, et donc asséré ici :
//   · l'anonyme est refusé PARTOUT (401) — aucune lecture n'est publique ;
//   · l'administrateur passe partout : « Décision V1 : la console est ADMIN SEUL »
//     (§34.1) ;
//   · un porteur SANS AUCUN LIEN avec la mission n'obtient RIEN, quel que soit son
//     rôle — c'est l'invariant 3 et le §34.3 (« JAMAIS […] les autres missions ») ;
//   · un CONSULTANT membre non lead ne qualifie PAS les unités proposées : §25.3
//     réserve l'acte au « lead/admin » et le §34.3 l'énumère parmi les pouvoirs DU
//     LEAD. Les deux lectures possibles du §34.1 s'accordent sur ce refus-là.
//
// LAISSÉ OUVERT, et donc NON asséré — deviner produirait un faux verdict :
//   · le LEAD d'une mission a-t-il accès à ces routes en V1 ? §34.3 lui donne le
//     pouvoir de qualifier les unités proposées ; §34.1 écrit que « la console est
//     ADMIN SEUL » et que « le lead y entre en PHASE 2 ». Les deux phrases sont du
//     même fichier. Le pack ne dit pas non plus par quelle interface le lead
//     exercerait ce pouvoir en V1 ;
//   · un CONSULTANT membre peut-il LIRE l'arbre de sa mission par cette route ? Il
//     l'obtient de toute façon par le pull de sync (§9.5) ; le pack ne dit pas si
//     la route de console lui est ouverte.
// Ces cellules sont ÉNUMÉRÉES ci-dessous et comptées, jamais tues : le nombre de
// cellules réellement assérées est lui-même asséré, pour qu'on ne puisse pas
// désarmer la matrice en déclarant « ambigu » ce qui gêne.
type VerdictAttendu = 'autorise' | 'refuse' | 'ambigu';

interface CelluleMatrice {
  readonly sujet: string;
  readonly gabarit: string;
  readonly verdict: VerdictAttendu;
}

/** Nombre de cellules que la matrice doit RÉELLEMENT assérer (non ambiguës). */
const CELLULES_ASSEREES_ATTENDUES = 30;

describe('RBAC des routes `org_units` (invariant 3)', () => {
  it('@critique matrice rôle × route : chaque refus attendu est tenu, et sans effet de bord', async () => {
    const admin = await creerCompte('admin', 'rbac-proprietaire');
    const missionId = await semerMission('rbac', admin.id);

    // Le nom de l'unité est une SENTINELLE DE FUITE : sa présence dans une réponse
    // signifierait qu'un porteur non autorisé a lu l'arbre, même partiellement.
    const sentinelleArbre = 'UniteFactice de fuite RBAC';
    const cible = await semerUnite({
      missionId,
      nom: sentinelleArbre,
      kind: 'service',
      position: 1,
    });
    const proposee = await semerUnite({
      missionId,
      nom: 'Unité factice proposée RBAC',
      kind: 'service',
      status: 'proposee',
      position: 2,
      proposePar: admin.id,
    });

    const consultantMembre = await creerCompte('consultant', 'rbac-membre');
    await affecter(missionId, consultantMembre.id, 'consultant');
    const leadMembre = await creerCompte('consultant', 'rbac-lead');
    await affecter(missionId, leadMembre.id, 'lead');

    const csvMinimal = fichierCsv([
      { ref: 'xa', name: 'Unité factice import interdit', kind: 'groupe' },
    ]);

    const routes = [
      {
        gabarit: 'GET /v1/missions/:id/org-units',
        methode: 'GET' as const,
        url: urlListe(missionId),
      },
      {
        gabarit: 'POST /v1/missions/:id/org-units',
        methode: 'POST' as const,
        url: urlListe(missionId),
        charge: { name: 'Unité factice interdite', kind: 'service' },
      },
      {
        gabarit: 'POST /v1/missions/:id/org-units/import',
        methode: 'POST' as const,
        url: urlImport(missionId),
        charge: corpsImport(csvMinimal),
      },
      {
        gabarit: 'POST /v1/missions/:id/org-units/import?verification=true',
        methode: 'POST' as const,
        url: urlImport(missionId, true),
        charge: corpsImport(csvMinimal),
      },
      {
        gabarit: 'PATCH /v1/org-units/:id',
        methode: 'PATCH' as const,
        url: `/v1/org-units/${cible}`,
        charge: { name: 'écriture qui ne doit jamais avoir lieu' },
      },
      {
        gabarit: 'POST /v1/org-units/:id/validate',
        methode: 'POST' as const,
        url: `/v1/org-units/${proposee}/validate`,
        charge: {},
      },
      {
        gabarit: 'POST /v1/org-units/:id/merge',
        methode: 'POST' as const,
        url: `/v1/org-units/${proposee}/merge`,
        charge: chargeFusion(cible, 'fusion qui ne doit jamais avoir lieu'),
      },
    ];

    const sujets: readonly {
      readonly nom: string;
      readonly jeton: string | undefined;
      readonly verdict: (gabarit: string) => VerdictAttendu;
    }[] = [
      { nom: 'anonyme', jeton: undefined, verdict: () => 'refuse' },
      {
        nom: 'consultant hors mission',
        jeton: (await creerCompte('consultant', 'rbac-hors-1')).jeton,
        verdict: () => 'refuse',
      },
      {
        nom: 'analyste hors mission',
        jeton: (await creerCompte('analyste', 'rbac-hors-2')).jeton,
        verdict: () => 'refuse',
      },
      {
        nom: 'lecteur hors mission',
        jeton: (await creerCompte('lecteur', 'rbac-hors-3')).jeton,
        verdict: () => 'refuse',
      },
      {
        nom: 'consultant MEMBRE de la mission',
        jeton: consultantMembre.jeton,
        // Tranché pour `validate` et `merge` (§25.3 « lead/admin » + §34.3), ouvert
        // pour la lecture et les écritures de cadrage.
        verdict: (gabarit) =>
          gabarit.includes('/validate') || gabarit.includes('/merge') ? 'refuse' : 'ambigu',
      },
      {
        nom: 'lead de la mission',
        jeton: leadMembre.jeton,
        verdict: () => 'ambigu',
      },
    ];

    const unitesAvant = await compterUnitesDeLaMission(missionId);
    const photoAvant = await photographierArbre(missionId);
    const manquements: string[] = [];
    const fuites: string[] = [];
    const cellules: CelluleMatrice[] = [];

    for (const sujet of sujets) {
      for (const route of routes) {
        const verdict = sujet.verdict(route.gabarit);
        cellules.push({ sujet: sujet.nom, gabarit: route.gabarit, verdict });
        if (verdict === 'ambigu') continue;

        const reponse = await appeler(route.methode, route.url, {
          ...(sujet.jeton === undefined ? {} : { jeton: sujet.jeton }),
          ...('charge' in route ? { charge: route.charge } : {}),
        });

        if (sujet.jeton === undefined) {
          if (reponse.statut !== 401 || reponse.code !== 'UNAUTHENTICATED') {
            manquements.push(
              `${sujet.nom} → ${route.gabarit} : ${String(reponse.statut)} ${String(reponse.code)} (attendu 401 UNAUTHENTICATED)`,
            );
          }
        } else if (![403, 404].includes(reponse.statut)) {
          // 403 (le rôle ne suffit pas) et 404 (la mission n'existe pas POUR CE
          // PORTEUR) sont les deux formes défendables du refus. Un 2xx ne l'est pas,
          // et un 5xx non plus : il signifierait que le refus vient d'un plantage et
          // non d'une politique.
          manquements.push(
            `${sujet.nom} → ${route.gabarit} : ${String(reponse.statut)} ${String(reponse.code)} (attendu 403 ou 404)`,
          );
        }

        if (reponse.corps.includes(sentinelleArbre)) {
          fuites.push(`${sujet.nom} → ${route.gabarit}`);
        }
      }
    }

    expect(
      manquements,
      'Un refus attendu n’a pas été tenu. Chaque ligne ci-dessus est un droit que le\n' +
        'pack ne donne pas et que le code accorde — ou un plantage déguisé en refus.',
    ).toStrictEqual([]);

    expect(
      fuites,
      'Le NOM D’UNE UNITÉ de la mission est sorti dans la réponse d’un porteur refusé.\n' +
        'Un refus qui décrit ce qu’il refuse n’est pas un refus : l’organigramme d’un\n' +
        'client est de la donnée de mission.',
    ).toStrictEqual([]);

    // ── AUCUN EFFET DE BORD : le refus PRÉCÈDE le gestionnaire ────────────────
    expect(
      await compterUnitesDeLaMission(missionId),
      'Une route qui écrirait PUIS refuserait laisserait des unités fantômes que\n' +
        'personne ne saurait rattacher à un acte.',
    ).toBe(unitesAvant);
    await attendreArbreInchange(
      missionId,
      photoAvant,
      'Un refus ne renomme pas, ne reparente pas et ne fusionne pas.',
    );

    // ── LA MATRICE SE DÉCLARE ELLE-MÊME ──────────────────────────────────────
    const asserees = cellules.filter((cellule) => cellule.verdict !== 'ambigu');
    const ambigues = cellules.filter((cellule) => cellule.verdict === 'ambigu');
    expect(
      asserees.length,
      'Le nombre de cellules RÉELLEMENT assérées est lui-même asséré : sans cela, on\n' +
        'désarmerait la matrice en déclarant « ambigu » ce qui gêne, et elle resterait\n' +
        'verte en n’exigeant plus rien.\n' +
        `Cellules ambiguës (arbitrage de spec attendu) :\n${ambigues
          .map((cellule) => `  · ${cellule.sujet} → ${cellule.gabarit}`)
          .join('\n')}`,
    ).toBe(CELLULES_ASSEREES_ATTENDUES);
  });

  it('@critique contre-épreuve : l’administrateur passe sur LES SEPT routes', async () => {
    // SANS CE TEST, LA MATRICE CI-DESSUS EST VERTE POUR UNE API QUI REFUSE TOUT —
    // y compris à l'administrateur, c'est-à-dire pour une API inutilisable. Chaque
    // route reçoit sa PROPRE mission pour que les sept appels ne se gênent pas
    // (l'import exige un arbre vide, la fusion consomme l'unité proposée).
    const admin = await creerCompte('admin', 'rbac-contre-epreuve');
    const echecs: string[] = [];

    const enregistrer = (gabarit: string, reponse: Reponse): void => {
      if (reponse.statut < 200 || reponse.statut >= 300) {
        echecs.push(`${gabarit} → ${String(reponse.statut)} ${reponse.corps}`);
      }
    };

    const missionLecture = await semerMission('admin-lecture', admin.id);
    await semerUnite({
      missionId: missionLecture,
      nom: 'Unité factice lecture',
      kind: 'service',
      position: 1,
    });
    enregistrer(
      'GET /v1/missions/:id/org-units',
      await appeler('GET', urlListe(missionLecture), { jeton: admin.jeton }),
    );

    const missionCreation = await semerMission('admin-creation', admin.id);
    enregistrer(
      'POST /v1/missions/:id/org-units',
      await appeler('POST', urlListe(missionCreation), {
        jeton: admin.jeton,
        charge: { name: 'Unité factice créée par l’admin', kind: 'direction' },
      }),
    );

    const csv = fichierCsv([{ ref: 'aa', name: 'Racine factice admin', kind: 'groupe' }]);
    const missionImport = await semerMission('admin-import', admin.id);
    enregistrer(
      'POST /v1/missions/:id/org-units/import',
      await importer(missionImport, csv, { jeton: admin.jeton }),
    );

    const missionBlanc = await semerMission('admin-blanc', admin.id);
    enregistrer(
      'POST /v1/missions/:id/org-units/import?verification=true',
      await importer(missionBlanc, csv, { jeton: admin.jeton, aBlanc: true }),
    );

    const missionPatch = await semerMission('admin-patch', admin.id);
    const aRenommer = await semerUnite({
      missionId: missionPatch,
      nom: 'Unité factice à renommer',
      kind: 'service',
      position: 1,
    });
    enregistrer(
      'PATCH /v1/org-units/:id',
      await appeler('PATCH', `/v1/org-units/${aRenommer}`, {
        jeton: admin.jeton,
        charge: { name: 'Unité factice renommée par l’admin' },
      }),
    );

    const missionValidate = await semerMission('admin-validate', admin.id);
    const aValider = await semerUnite({
      missionId: missionValidate,
      nom: 'Unité factice à valider par l’admin',
      kind: 'service',
      status: 'proposee',
      position: 1,
      proposePar: admin.id,
    });
    enregistrer(
      'POST /v1/org-units/:id/validate',
      await appeler('POST', `/v1/org-units/${aValider}/validate`, {
        jeton: admin.jeton,
        charge: {},
      }),
    );

    const missionMerge = await semerMission('admin-merge', admin.id);
    const cible = await semerUnite({
      missionId: missionMerge,
      nom: 'Cible factice admin',
      kind: 'service',
      position: 1,
    });
    const aFusionner = await semerUnite({
      missionId: missionMerge,
      nom: 'Unité factice à fusionner par l’admin',
      kind: 'service',
      status: 'proposee',
      position: 2,
      proposePar: admin.id,
    });
    enregistrer(
      'POST /v1/org-units/:id/merge',
      await appeler('POST', `/v1/org-units/${aFusionner}/merge`, {
        jeton: admin.jeton,
        charge: chargeFusion(cible, 'fusion nominale par l’administrateur'),
      }),
    );

    expect(
      echecs,
      'L’administrateur doit passer sur les SEPT routes (§34.1 : « la console est ADMIN\n' +
        'SEUL »). Sans cette contre-épreuve, une API qui refuse tout le monde — donc\n' +
        'inutilisable — serait verte sur toute la matrice de refus.',
    ).toStrictEqual([]);
  });

  it('@critique le refus de rôle PRÉCÈDE la validation du corps', async () => {
    // Si la validation Zod s'exécutait avant le crochet d'autorisation, un porteur
    // non autorisé recevrait un `400 VALIDATION_FAILED` détaillant les champs
    // attendus — c'est-à-dire une DESCRIPTION DU CONTRAT d'une route à laquelle il
    // n'a pas droit, et la confirmation que la route existe. Sur l'import, le
    // détail irait jusqu'à révéler le nom du champ qui transporte le fichier.
    const admin = await creerCompte('admin', 'rbac-ordre-admin');
    const missionId = await semerMission('rbac-ordre', admin.id);
    const uniteOrdre = await semerUnite({
      missionId,
      nom: 'Unité factice ordre',
      kind: 'service',
      position: 1,
    });
    const lecteur = await creerCompte('lecteur', 'rbac-ordre-lecteur');

    const creation = await appeler('POST', urlListe(missionId), {
      jeton: lecteur.jeton,
      charge: { champInexistant: 42 },
    });
    expect([403, 404], `attendu un refus, reçu : ${creation.corps}`).toContain(creation.statut);
    expect(creation.code).not.toBe('VALIDATION_FAILED');

    const importation = await appeler('POST', urlImport(missionId), {
      jeton: lecteur.jeton,
      charge: { pasLeBonChamp: 'ref;name;kind' },
    });
    expect([403, 404], `attendu un refus, reçu : ${importation.corps}`).toContain(
      importation.statut,
    );
    expect(
      importation.code,
      'Un refus d’accès ne doit pas révéler le contrat d’entrée de la route.',
    ).not.toBe('VALIDATION_FAILED');

    const modification = await appeler('PATCH', `/v1/org-units/${uniteOrdre}`, {
      jeton: lecteur.jeton,
      charge: { headcount: 'pas-un-nombre' },
    });
    expect([403, 404], `attendu un refus, reçu : ${modification.corps}`).toContain(
      modification.statut,
    );
  });

  it('@critique étanchéité financière : aucune route `org_units` ne laisse sortir un montant', async () => {
    // CEINTURE 4 (note L2 §2.2-4), rebranchée sur les routes de CE lot. Le balayage
    // n'éprouve pas les routes auxquelles on a pensé : il éprouve CELLES QUI
    // EXISTENT, en les énumérant depuis le registre `onRoute` de l'exécution.
    //
    // POURQUOI C'EST DÛ ICI, alors qu'aucune route `org_units` ne touche
    // `scoping_financials` : justement parce que « aucune » est une affirmation
    // qu'il faut MESURER. `org_units.headcount` voisine avec les effectifs du
    // chiffrage, et une route de lecture d'arbre est le genre d'endroit où l'on
    // agrège « pour rendre service ». L'invariant 3 est explicite : les données
    // financières sont réservées aux routes admin.
    const admin = await creerCompte('admin', 'sentinelle-financiere');
    const missionId = await semerMission('sentinelle', admin.id);
    const uniteId = await semerUnite({
      missionId,
      nom: 'Unité factice sentinelle',
      kind: 'service',
      position: 1,
    });

    // Un cadrage dont les montants sont des valeurs SENTINELLES : improbables et
    // textuellement reconnaissables. Ce sont des LEURRES DE TEST, jamais un secret.
    const entreprise = await bd().query<{ id: string }>(
      'SELECT company_id AS id FROM missions WHERE id = $1',
      [missionId],
    );
    const entrepriseId = entreprise.rows[0]?.id;
    expect(entrepriseId, 'la mission doit porter une entreprise').toBeDefined();
    const cadrageId = uuidv7();
    await bd().query(
      `INSERT INTO scoping_estimates (id, company_id, workload_days, team_size, calendar_days, status)
       VALUES ($1, $2, 12, 2, 30, 'brouillon')`,
      [cadrageId, entrepriseId],
    );
    // Le volet financier passe par L'UNIQUE PORTE (`aide/sentinelle-financiere.ts`,
    // seul fichier de la liste blanche à pouvoir nommer la table). L'`INSERT` brut
    // qui vivait ici ouvrait une SECONDE porte vers `scoping_financials` — la
    // ceinture 3 l'a dénoncé, et elle avait raison.
    await semerVoletFinancierSentinelle(bd(), cadrageId, admin.id);

    const gabaritsDuLot = [
      '/v1/missions/:id/org-units',
      '/v1/missions/:id/org-units/import',
      '/v1/org-units/:id',
      '/v1/org-units/:id/validate',
      '/v1/org-units/:id/merge',
    ];

    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      // L'ADMINISTRATEUR est délibérément ABSENT : il a le droit de voir les montants
      // (§34.1). L'inclure produirait une fausse fuite, et un garde-fou qui crie à
      // tort finit désarmé.
      porteurs: {
        consultant: (await creerCompte('consultant', 'sentinelle-consultant')).jeton,
        analyste: (await creerCompte('analyste', 'sentinelle-analyste')).jeton,
        lecteur: (await creerCompte('lecteur', 'sentinelle-lecteur')).jeton,
        anonyme: null,
      },
      cartographieDeParametres: {
        '/v1/scoping/:id/financials': { id: cadrageId },
        '/v1/companies/:id': { id: entrepriseId ?? uuidv7() },
        '/v1/missions/:id/org-units': { id: missionId },
        '/v1/missions/:id/org-units/import': { id: missionId },
        '/v1/org-units/:id': { id: uniteId },
        '/v1/org-units/:id/validate': { id: uniteId },
        '/v1/org-units/:id/merge': { id: uniteId },
      },
    });

    expect(
      rapport.fuites,
      `Une route a laissé sortir un montant :\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    // Les gabarits de CE lot doivent avoir une valeur RÉELLEMENT semée : un balayage
    // qui taperait dans le vide sur eux serait vert sans les avoir traversés.
    const nonCartographiesDuLot = rapport.parametresNonCartographies.filter((entree) =>
      gabaritsDuLot.some((gabarit) => entree.startsWith(gabarit)),
    );
    expect(
      nonCartographiesDuLot,
      'Un gabarit `org_units` n’a aucune valeur déclarée POUR LUI : le balayage a tapé\n' +
        'dans le vide, et son silence ne vaut rien pour cette route.\n' +
        'Si un gabarit a été renommé, c’est ici qu’il faut le suivre — ET dans la\n' +
        `cartographie de l2-crochets, qui, elle, assère la liste ENTIÈRE.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    expect(
      rapport.couverture.exerces,
      'Aucun appel du balayage n’a rendu 2xx : il n’a lu aucun corps, il est vert par\n' +
        'vacuité.',
    ).toBeGreaterThan(0);

    // Contre-épreuve du détecteur lui-même : s'il ne trouvait plus rien nulle part,
    // toutes les assertions ci-dessus seraient vertes sans rien mesurer.
    // On cite les valeurs par `VALEURS_SENTINELLES` plutôt que par le NOM du champ
    // (`SENTINELLES_FINANCIERES.totalAmount`) : ce nom est l'une des colonnes
    // surveillées par la ceinture 3, et l'écrire ici ferait de ce fichier une
    // infraction de plus. La contre-épreuve y gagne — elle porte désormais sur
    // TOUTES les sentinelles, pas seulement le montant total.
    const texteTemoin = VALEURS_SENTINELLES.map((valeur) => `montant ${valeur} EUR`).join(' · ');
    expect(
      detecterSentinelles(texteTemoin),
      'Le détecteur de sentinelles ne reconnaît plus ses propres valeurs : le vert de\n' +
        'ce test ne prouverait alors rien du tout.',
    ).toStrictEqual([...VALEURS_SENTINELLES]);
  });
});

// =============================================================================
// 8. LE CONTRAT D'ERREUR — 11 §3 ET LES AMENDEMENTS DU 2026-08-29
// =============================================================================
describe('format d’erreur unique et codes du lot (11 §3)', () => {
  it('@critique `IMPORT_REJECTED` et le statut 422 EXISTENT dans `packages/shared`', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // CE TEST EST ROUGE AU MOMENT OÙ IL EST ÉCRIT, ET C'EST SON RÔLE (TDD).
    // ═════════════════════════════════════════════════════════════════════════
    // L'arbitrage du 2026-08-29 pose `IMPORT_REJECTED · 422` et ajoute le statut 422
    // à la table. L'entrée du 2026-08-31 constate que ces amendements « sont restés
    // sur le papier » et les déclare « DUS AUX LOTS L3c ET L9, qui les poseront avec
    // leur premier usage ». L3c EST ce premier usage.
    //
    // POURQUOI CE TEST PLUTÔT QU'UNE SIMPLE LIGNE DANS UN RAPPORT : sans lui, la
    // route d'import n'aurait d'autre choix que d'inventer un littéral — ce que
    // 11 §3 interdit nommément (« les codes vivent dans `packages/shared` — JAMAIS de
    // littéral libre ») — ou de retomber sur `CONFLICT`, effaçant la distinction
    // entre « votre appel HTTP est malformé » et « votre document a été lu et rejeté
    // sur douze lignes ». Toutes les assertions de code de ce fichier en dépendent.
    const { ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE } = await import('@axion/shared');
    const codes: readonly string[] = Object.values(ERROR_CODES);

    expect(
      codes,
      'Code arbitré le 2026-08-29 (renommé depuis `CSV_IMPORT_REJECTED` : « CSV nomme\n' +
        'le médium, pas le sujet » — l’import de banque du lot L9 partagera ce code).\n' +
        'À poser dans `packages/shared/src/errors.ts` avec son statut 422.',
    ).toContain('IMPORT_REJECTED');

    const statuts = new Map<string, number>(Object.entries(HTTP_STATUS_BY_ERROR_CODE));
    expect(
      statuts.get('IMPORT_REJECTED'),
      'Statut arbitré : 422. « Sur la route d’import, 400 est déjà consommé par le\n' +
        'compilateur Zod » — la route peut lever les deux, et le statut doit les\n' +
        'distinguer sans dépendre du seul code.',
    ).toBe(422);
  });

  it('@critique `errorDetailSchema` porte un `code` — sans lui le rapport §35.2 est inexprimable', async () => {
    // Second amendement resté sur le papier (2026-08-29, confirmé le 2026-08-31).
    // §35.2 exige un rapport `{ligne, colonne, code, message}` ; `errorDetailSchema`
    // ne connaît que `path` et `message`. Un `z.object` ordinaire STRIPPE les clés
    // qu'il ne déclare pas : le `code` de chaque défaut disparaîtrait donc en
    // silence à la sérialisation de la réponse — le pire mode de défaillance, celui
    // où le producteur croit l'avoir envoyé.
    //
    // Le test le mesure par le COMPORTEMENT (la clé survit-elle au passage ?) plutôt
    // que par introspection du schéma : c'est ce que le front observera.
    const { errorDetailSchema } = await import('@axion/shared');
    const analyse = errorDetailSchema.safeParse({
      path: 'ligne 74, colonne kind',
      message: 'Valeur de « kind » inconnue.',
      code: 'KIND_INCONNU',
    });
    expect(analyse.success, 'un détail bien formé doit être accepté').toBe(true);
    if (!analyse.success) return;
    expect(
      Object.keys(analyse.data),
      'La clé `code` doit SURVIVRE au schéma. Sans elle, la promesse déjà écrite dans\n' +
        '`banque-questions.ts` (« les codes voyageront dans `details[]`, inchangés ») est\n' +
        'inexécutable, et le rapport du §35.2 perd sa colonne « code » sans un mot.',
    ).toContain('code');
  });

  it('toutes les erreurs de ce lot portent l’enveloppe unique du 11 §3', async () => {
    // Une enveloppe qui varie d'une route à l'autre oblige le front à essayer
    // plusieurs formes, et il finit par afficher « une erreur est survenue » partout.
    // Le message est en FRANÇAIS (invariant 5) : il est destiné à être affiché tel
    // quel sur l'écran d'un auditeur en clientèle.
    const admin = await creerCompte('admin', 'enveloppe');
    const missionId = await semerMission('enveloppe', admin.id);

    const reponses = [
      await appeler('GET', `${urlListe(missionId)}?limit=2&after=nawak`, { jeton: admin.jeton }),
      await appeler('POST', urlListe(missionId), {
        jeton: admin.jeton,
        charge: { name: 'Unité factice', kind: 'departement' },
      }),
      await appeler('PATCH', `/v1/org-units/${uuidv7()}`, {
        jeton: admin.jeton,
        charge: { name: 'Sans objet' },
      }),
      await appeler('GET', urlListe(missionId)),
      await importer(missionId, fichierCsv(lignesEpreuve(DEFAUTS_EPREUVE)), { jeton: admin.jeton }),
    ];

    const malformees: string[] = [];
    for (const reponse of reponses) {
      const analyse = erreurSchema.safeParse(analyserJson(reponse.corps));
      if (!analyse.success) {
        malformees.push(`${String(reponse.statut)} → ${reponse.corps}`);
        continue;
      }
      if (analyse.data.error.message.trim() === '') {
        malformees.push(`${String(reponse.statut)} → message vide`);
      }
      if (!/[a-zà-ÿ]/i.test(analyse.data.error.message)) {
        malformees.push(`${String(reponse.statut)} → message non rédigé : ${reponse.corps}`);
      }
    }

    expect(
      malformees,
      'Format unique 11 §3 : `{ error: { code: SNAKE_CASE, message: <français>, details? } }`.\n' +
        'Une enveloppe qui varie d’une route à l’autre oblige le front à essayer\n' +
        'plusieurs formes — et il finit par afficher « une erreur est survenue » partout.',
    ).toStrictEqual([]);
  });
});

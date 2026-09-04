// =============================================================================
// CONTRAT D'API DES ENTREPRISES CLIENTES — `/v1/companies`. Lot L3, incrément L3a.
//
// ── D'OÙ VIENNENT CES QUATRE ROUTES ─────────────────────────────────────────
// `docs/conception/LOT_L3.md` §2 les nomme : `GET|POST /v1/companies` ·
// `GET|PATCH /v1/companies/:id`. Elles servent deux exigences du pack, et deux
// seulement :
//   · **R3** (03 §29, verbatim) : « le SIREN est la clé de déduplication
//     outil↔console (nom en second) ; **alerte** si deux fiches partagent un
//     SIREN » ;
//   · **R4** (03 §29, verbatim) : « à la création d'un client français, le code
//     APE/NAF renseigne automatiquement le secteur via table de correspondance
//     NAF→secteurs ».
// Aucune autre capacité n'est inventée ici : pas de suppression (le « D » de CRUD
// n'est jamais instancié par le pack — et `companies.deleted_at` existe au fichier
// 04 sans qu'aucune route ne l'écrive), pas de fusion de doublons (le pack n'en
// décrit aucune), pas de recherche plein texte.
//
// ── LE MOT « ALERTE » DE R3 EST LU À LA LETTRE, ET IL COMMANDE DEUX RÉGIMES ──
// Le fichier 04 porte un index **UNIQUE PARTIEL** : `companies(siren) WHERE siren
// IS NOT NULL`. Ce « WHERE » n'est pas un détail d'implémentation, c'est la règle
// métier de V2.2 rendue exécutable : **plusieurs entreprises à `siren = NULL` sont
// LÉGITIMES** (filiales étrangères, §16). D'où deux régimes, jamais un seul :
//
//   ┌─────────────────────┬────────────────────────────────────────────────────┐
//   │ SIREN fourni        │ unicité GARANTIE par la base → un doublon est un   │
//   │                     │ CONFLIT : `409 COMPANY_DUPLICATE`, jamais une      │
//   │                     │ fusion silencieuse.                                │
//   ├─────────────────────┼────────────────────────────────────────────────────┤
//   │ SIREN absent (NULL) │ AUCUNE unicité n'est possible en base. Refuser sur │
//   │                     │ le nom inventerait une contrainte que le 04 refuse │
//   │                     │ d'écrire. → `201` + **avertissement non bloquant** │
//   │                     │ (« nom en second »). L'outil signale, l'humain trie.│
//   └─────────────────────┴────────────────────────────────────────────────────┘
//
// Le second régime est tranché par `DECISIONS.md` du 2026-08-29 (« Les quatre codes
// d'erreur du lot »), qui **retire** à la note de conception son 409 sur le nom :
// « la conception se contredit dans la même phrase — “avertissement, pas blocage”,
// puis elle implémente un blocage ». Le pack a une maison de style pour ce cas
// (§25.2 chevauchement d'agenda, §34.6 anti-collision : avertissement NON bloquant).
//
// ── ET DEPUIS LE 2026-09-03, UNE SECONDE UNICITÉ : `external_ref` ────────────
// L'amendement du 04 §7.1 (migration `0015`) pose `uq_companies_external_ref`, de
// forme IDENTIQUE à celui du SIREN : UNIQUE PARTIEL, `WHERE external_ref IS NOT
// NULL` — plusieurs fiches créées localement n'ont légitimement aucun pendant dans
// la console. Le régime est donc celui de la première ligne du tableau, avec un code
// À PART : **`409 COMPANY_EXTERNAL_REF_DUPLICATE`**. Deux codes et non un, parce que
// les deux conflits ne se réparent pas au même endroit (rapprocher deux fiches
// d'audit vs corriger la liaison M8.1) — voir `errors.ts`.
// ⚠ Cet index **n'exclut pas les fiches supprimées** : une fiche archivée conserve
// sa référence console (invariant 7, tranché le 2026-09-04). Le 409 le dit alors
// explicitement et oriente vers la RESTAURATION.
//
// AUCUNE LOGIQUE D'ACCÈS NI D'ÉCRITURE ICI : ce paquet est importé par la console
// (`apps/hq`) et par la PWA terrain. Ce qui y entre part dans un navigateur — d'où
// des fonctions PURES (normalisation SIREN, clé de Luhn, normalisation de nom) que
// le front peut appeler pour avertir AVANT l'aller-retour réseau, et que le serveur
// rejoue de toute façon parce qu'un contrôle de navigateur ne garantit rien.
// Traçabilité : E19 (avant-vente : cadrage de l'étendue — entreprise complète,
// filiales) · E18 (liaison clients axion-ia.com : console maîtresse, `external_ref`)
// · E3 (tous secteurs d'activité — pré-remplissage sectoriel) · E43 (conventions
// d'API épinglées).
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// SIREN — NORMALISATION, FORMAT, CLÉ DE CONTRÔLE
// -----------------------------------------------------------------------------

/**
 * Ce qui est retiré d'un SIREN saisi : espaces (y compris insécables, que les
 * traitements de texte et les copier-coller depuis un extrait Kbis insèrent seuls)
 * et points.
 *
 * ⚠ LE TIRET N'EST PAS RETIRÉ, ET C'EST DÉLIBÉRÉ. Un SIREN français ne s'écrit
 * jamais avec des tirets ; en accepter reviendrait à normaliser silencieusement une
 * saisie qui n'est PAS un SIREN (un numéro de TVA tronqué, une référence interne).
 * On préfère un refus lisible à une acceptation qui inventerait la valeur.
 */
const SEPARATEURS_SIREN = /[\s.]/g;

/** Le SIREN, une fois normalisé : neuf chiffres, rien d'autre. */
const MOTIF_SIREN = /^\d{9}$/;

/**
 * Retire les séparateurs d'un SIREN saisi. **Fonction pure**, exportée pour que le
 * front normalise à la frappe ce que le serveur normalisera de nouveau.
 */
export function normaliserSiren(saisie: string): string {
  return saisie.replace(SEPARATEURS_SIREN, '');
}

/**
 * LA CLÉ DE LUHN DU SIREN — le contrôle qui distingue une faute de frappe d'un
 * identifiant réel.
 *
 * Un SIREN est un numéro à neuf chiffres dont le dernier est une clé de Luhn : on
 * double un chiffre sur deux **en partant de la droite** (donc les rangs pairs), on
 * remplace tout résultat supérieur à 9 par la somme de ses chiffres (équivalent à
 * lui retirer 9), et la somme totale doit être un multiple de 10. Une transposition
 * de deux chiffres voisins ou une frappe erronée est alors rejetée.
 *
 * ── CE QUE CE CONTRÔLE NE FAIT PAS, ET IL FAUT LE DIRE ──────────────────────
 * Il ne prouve pas que l'entreprise EXISTE : il prouve que le nombre est bien formé.
 * Seule une interrogation du répertoire SIRENE le dirait, et aucun appel sortant
 * n'est prévu par le pack (le service tourne sur un réseau Docker interne). Un SIREN
 * valide mais fantaisiste passe donc — c'est assumé, et c'est pourquoi la
 * déduplication porte AUSSI sur le nom, en second.
 *
 * ── LE CAS QUI FAIT ÉCHOUER LES IMPLÉMENTATIONS NAÏVES ──────────────────────
 * L'exception française célèbre (un SIREN historique dont la clé ne suit pas la
 * règle) porte sur le **SIRET** à quatorze chiffres et sa somme par rang, pas sur le
 * SIREN à neuf. Vérifié à la main sur le cas de référence : la somme de Luhn y vaut
 * bien un multiple de 10. Aucune exception n'est donc câblée ici — en câbler une
 * « au cas où » aurait ouvert un trou permanent dans un contrôle d'intégrité.
 */
export function cleSirenValide(sirenNormalise: string): boolean {
  if (!MOTIF_SIREN.test(sirenNormalise)) return false;

  let somme = 0;
  for (let position = 0; position < sirenNormalise.length; position += 1) {
    // `position` court de gauche à droite sur neuf caractères ; le rang « pair en
    // partant de la droite » est donc `position` IMPAIR (0-indexé). Écrit ainsi
    // plutôt qu'avec un parcours inversé : une inversion d'indice est exactement
    // l'erreur que ce contrôle existe pour attraper ailleurs.
    const chiffre = Number(sirenNormalise[position]);
    const double = position % 2 === 1 ? chiffre * 2 : chiffre;
    somme += double > 9 ? double - 9 : double;
  }
  return somme % 10 === 0;
}

/**
 * Le SIREN tel qu'une ENTRÉE d'API l'accepte : normalisé, puis contrôlé en deux
 * temps SÉQUENTIELS (`.pipe`), pour qu'un numéro à huit chiffres n'accumule pas
 * « mauvaise longueur » ET « clé invalide » — deux messages pour une seule faute
 * envoient chercher à deux endroits.
 *
 * Un SIREN malformé est un **400** rendu par le compilateur Zod (`VALIDATION_FAILED`),
 * jamais un 409 : la requête est mal formée, l'état de la base n'y est pour rien.
 */
export const sirenSchema = z
  .string()
  .transform(normaliserSiren)
  .pipe(z.string().regex(MOTIF_SIREN, 'Le SIREN doit comporter exactement 9 chiffres.'))
  .pipe(z.string().refine(cleSirenValide, 'La clé de contrôle de ce SIREN est invalide.'));

// -----------------------------------------------------------------------------
// CODE NAF / APE — et le piège de la table de correspondance
// -----------------------------------------------------------------------------

/** Séparateurs tolérés dans un code APE saisi, avant normalisation. */
const SEPARATEURS_NAF = /[\s.]/g;

/** La forme CANONIQUE d'un code APE, telle qu'elle est stockée : `62.01Z`. */
const MOTIF_NAF_CANONIQUE = /^\d{2}\.\d{2}[A-Z]$/;

/** La forme compacte intermédiaire : quatre chiffres et une lettre. */
const MOTIF_NAF_COMPACT = /^\d{4}[A-Z]$/;

/**
 * Longueur de la DIVISION NAF — les deux premiers chiffres du code APE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE PIÈGE DE R4, ET IL EST MESURÉ : `naf_sector_map` N'EST PAS INDEXÉE PAR LE
 * CODE APE COMPLET.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `apps/api/scripts/seed.mjs` peuple `naf_sector_map` avec **88 lignes dont la clé
 * est une DIVISION à deux chiffres** (`'01'` … `'99'`), tandis que la fixture de
 * démonstration écrit `companies.naf_code = '62.01Z'`, un code APE complet. Une
 * correspondance écrite naïvement — `WHERE naf_code = '6201Z'` — ne trouverait
 * donc **JAMAIS** de secteur, et R4 sortirait vert en ne faisant rien : chaque
 * création rendrait `sectorId: null` avec un « secteur à qualifier » parfaitement
 * poli, et personne ne verrait que la table n'a jamais été consultée.
 * La correspondance se fait donc sur la DIVISION, et ce commentaire existe pour que
 * le jour où `naf_sector_map` sera administrée à la maille fine (console, espace
 * Contenu — R4 le prévoit), on sache exactement quelle ligne changer.
 */
export const LONGUEUR_DIVISION_NAF = 2;

/**
 * Normalise un code APE vers sa forme canonique `NN.NNL`.
 *
 * Accepte `6201Z`, `62.01 z`, `62 01 Z` — trois façons dont un code arrive
 * réellement d'un extrait Kbis, d'un tableur ou d'une saisie. Rend la chaîne telle
 * quelle si elle n'a pas la forme attendue : **la normalisation ne valide pas**,
 * c'est le schéma qui refuse ensuite. Mélanger les deux rendrait indécidable, en
 * lisant un message d'erreur, si la valeur fautive est celle de l'utilisateur ou
 * une valeur transformée par nos soins.
 */
export function normaliserCodeNaf(saisie: string): string {
  const compact = saisie.replace(SEPARATEURS_NAF, '').toUpperCase();
  if (!MOTIF_NAF_COMPACT.test(compact)) return compact;
  return `${compact.slice(0, 2)}.${compact.slice(2)}`;
}

/**
 * La DIVISION d'un code APE canonique — la clé réelle de `naf_sector_map`.
 * Voir `LONGUEUR_DIVISION_NAF` pour ce que cette fonction évite.
 */
export function divisionNaf(codeNafCanonique: string): string {
  return codeNafCanonique.slice(0, LONGUEUR_DIVISION_NAF);
}

/**
 * Le code APE tel qu'une ENTRÉE d'API l'accepte. Format invalide → **400**.
 * Format valide mais absent des 88 divisions → **succès**, `sectorId` nul et
 * `secteurAQualifier: true` : un référentiel incomplet n'est pas une erreur de
 * l'utilisateur, et on n'invente jamais un secteur par défaut.
 */
export const nafCodeSchema = z
  .string()
  .transform(normaliserCodeNaf)
  .pipe(
    z
      .string()
      .regex(
        MOTIF_NAF_CANONIQUE,
        'Le code APE/NAF doit comporter quatre chiffres et une lettre (par exemple 62.01Z).',
      ),
  );

// -----------------------------------------------------------------------------
// NOM — et la normalisation qui sert la déduplication « en second »
// -----------------------------------------------------------------------------

/**
 * Longueur maximale de la raison sociale. `companies.name` est un `TEXT` sans borne
 * au fichier 04 : la borne est donc APPLICATIVE, et elle existe pour la même raison
 * que celle du nom d'un compte — refuser une entrée démesurée AVANT la base. 300
 * caractères couvrent largement une raison sociale, y compris les dénominations
 * administratives longues et les groupements momentanés d'entreprises.
 */
export const NOM_ENTREPRISE_LONGUEUR_MAX = 300;

/** Longueur maximale de `external_ref` — un identifiant de console, pas un texte. */
export const REF_EXTERNE_LONGUEUR_MAX = 128;

/** Longueur maximale des notes libres de la fiche client. */
export const NOTES_ENTREPRISE_LONGUEUR_MAX = 5000;

/**
 * Plafond d'effectif et de nombre de sites. Ce ne sont pas des bornes métier — un
 * groupe peut employer plus — mais des bornes de VRAISEMBLANCE : elles écartent la
 * saisie accidentelle d'un chiffre d'affaires dans la case des effectifs, sans
 * jamais refuser un client réel.
 */
export const EFFECTIF_MAX = 10_000_000;

/** Nombre maximal de pays d'implantation déclarés sur une fiche. */
export const PAYS_MAX = 200;

/**
 * FORMES JURIDIQUES RETIRÉES avant comparaison des noms.
 *
 * Deux fiches nommées « Untel SAS » et « UNTEL S.A.S. » désignent la même entreprise
 * et doivent lever l'avertissement. La liste est volontairement COURTE et
 * GÉNÉRIQUE : ce sont des formes juridiques françaises et européennes, jamais un
 * nom de client (invariant 2). L'allonger indéfiniment n'améliorerait pas le
 * signal — au-delà d'un certain point, retirer des mots fait fusionner des
 * entreprises réellement distinctes, et un avertissement qui crie tout le temps
 * n'est plus lu.
 */
const FORMES_JURIDIQUES = [
  'sas',
  'sasu',
  'sa',
  'sarl',
  'eurl',
  'sci',
  'scic',
  'scop',
  'snc',
  'sca',
  'scs',
  'sem',
  'gie',
  'ei',
  'eirl',
  'asso',
  'association',
  'societe',
  'ste',
  'groupe',
  'holding',
  'gmbh',
  'ltd',
  'plc',
  'bv',
  'nv',
  'spa',
  'srl',
  'ag',
  'inc',
  'corp',
  'llc',
] as const;

const FORMES_JURIDIQUES_RETIREES: ReadonlySet<string> = new Set(FORMES_JURIDIQUES);

/**
 * LA FORME NORMALISÉE D'UN NOM, sur laquelle la déduplication « en second » compare.
 *
 * Minuscules · accents et signes diacritiques retirés (`NFD` puis suppression des
 * marques combinantes) · **points SUPPRIMÉS**, puis toute autre ponctuation ramenée
 * à l'espace · formes juridiques retirées · espaces réduits. Deux noms qui rendent
 * la MÊME chaîne sont signalés comme doublons POSSIBLES — jamais fusionnés, jamais
 * refusés.
 *
 * ⚠ LE POINT SE SUPPRIME AU LIEU DE DEVENIR UN ESPACE, et ce n'est pas un détail :
 * **mesuré** avant correction, « Untel SAS » se normalisait en `untel` tandis que
 * « UNTEL S.A.S. » donnait `untel s a s` — les deux graphies les plus courantes de
 * la MÊME entreprise ne se seraient jamais reconnues, et l'alerte R3 aurait été
 * muette précisément sur le cas qu'elle existe pour voir. Retirer le point d'abord
 * ramène `S.A.S.` à `sas`, que la liste des formes juridiques écarte ensuite.
 *
 * ── CE QU'ELLE NE RATTRAPE PAS, ET C'EST VOULU ──────────────────────────────
 * Une faute de frappe (« Untl » pour « Untel »), une abréviation, une traduction.
 * Une comparaison approchée (distance d'édition, trigrammes) rattraperait ces
 * cas-là — au prix de faux positifs sur des entreprises réellement distinctes, et
 * d'une extension `pg_trgm` qui n'est pas dans la liste épinglée du 11 §1. **Deux
 * entités homonymes dans deux pays sont légitimes** (§16, filiales étrangères) :
 * l'outil signale, l'humain trie. Un rapprochement flou qui bloquerait ou fusionnerait
 * serait exactement le comportement que R3 refuse en écrivant « alerte ».
 */
export function normaliserNomEntreprise(nom: string): string {
  const sansAccents = nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  return sansAccents
    .replace(/\./g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .split(' ')
    .filter((mot) => mot !== '' && !FORMES_JURIDIQUES_RETIREES.has(mot))
    .join(' ');
}

// -----------------------------------------------------------------------------
// BRIQUES D'ENTRÉE
// -----------------------------------------------------------------------------

const nomEntrepriseSchema = z
  .string()
  .trim()
  .pipe(z.string().min(1).max(NOM_ENTREPRISE_LONGUEUR_MAX));

/**
 * La RÉFÉRENCE CONSOLE : l'id client d'axion-ia.com (04 §7.1), clé de la liaison
 * M8.1. **UNIQUE quand elle est renseignée** depuis l'amendement du 04 du
 * 2026-09-03 (index partiel `uq_companies_external_ref`, migration `0015`) : une
 * référence déjà prise rend **`409 COMPANY_EXTERNAL_REF_DUPLICATE`**, jamais
 * `COMPANY_DUPLICATE` qui, lui, ne parle que du SIREN.
 *
 * L'unicité n'est PAS exprimable ici — ce schéma valide une chaîne, il ne connaît
 * pas les autres fiches. C'est l'index qui arbitre, côté serveur, et c'est bien :
 * un front ne peut pas garantir qu'une référence libre à l'instant de la saisie le
 * sera encore à l'instant de l'écriture.
 */
const refExterneSchema = z.string().trim().pipe(z.string().min(1).max(REF_EXTERNE_LONGUEUR_MAX));

const notesSchema = z.string().max(NOTES_ENTREPRISE_LONGUEUR_MAX);

const effectifSchema = z.number().int().min(0).max(EFFECTIF_MAX);

/**
 * Un pays d'implantation : code ISO 3166-1 alpha-2, en majuscules (`FR`, `DE`).
 * Même vocabulaire que `missions.country_code` (04, §32.3) et que la fixture de
 * démonstration (`'["FR"]'`). Deux orthographes du même pays rendraient tout
 * regroupement par pays incomplet — et une liste incomplète ne se voit pas.
 */
export const codePaysSchema = z
  .string()
  .trim()
  .transform((valeur) => valeur.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'Code pays ISO 3166-1 alpha-2 attendu (par exemple FR).'));

/**
 * La liste des pays telle qu'elle est RELUE depuis le JSONB.
 *
 * Volontairement plus TOLÉRANTE que `codePaysSchema` : elle n'exige qu'un tableau
 * de chaînes. Une ligne écrite avant ce lot (le seed de démonstration, un import)
 * ne doit pas rendre la fiche illisible — un contrat de LECTURE strict
 * transformerait une donnée historique en panne 500 sur une route de consultation.
 * L'écriture, elle, reste stricte : c'est là que la forme se décide.
 */
export const codesPaysStockesSchema = z.array(z.string());

// -----------------------------------------------------------------------------
// PARAMÈTRE D'URL
// -----------------------------------------------------------------------------

/** `:id` des deux routes qui visent UNE entreprise. */
export const companyParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type CompanyParams = z.infer<typeof companyParamsSchema>;

// -----------------------------------------------------------------------------
// SORTIE — la seule forme sous laquelle une entreprise sort de l'API
// -----------------------------------------------------------------------------

/**
 * La fiche client, telle qu'elle est rendue. `strictObject` : une clé non déclarée
 * est REFUSÉE, pas ignorée — sur une réponse, la différence compte (le sérialiseur
 * Zod repasse la réponse par ce schéma avant l'envoi, `apps/api/src/http/zod.ts`).
 *
 * **`deletedAt` n'y figure pas**, et ce n'est pas un oubli : aucune route de ce lot
 * ne rend une fiche supprimée (les lectures filtrent `deleted_at IS NULL`), donc le
 * champ ne porterait jamais que `null` — un champ qui ne prend qu'une valeur est un
 * champ qui ment sur ce qu'il documente. Le jour où une route de suppression
 * existera, elle amènera son propre contrat.
 */
export const companyResponseSchema = z.strictObject({
  id: z.uuid(),
  /** Id client de la console axion-ia.com (04) — `null` si l'entreprise est locale. */
  externalRef: z.string().nullable(),
  name: z.string().min(1).max(NOM_ENTREPRISE_LONGUEUR_MAX),
  /** `null` LÉGITIME : filiale étrangère sans SIREN (04, V2.2 · 03 §16). */
  siren: z.string().nullable(),
  nafCode: z.string().nullable(),
  /** `null` quand aucun code APE n'a permis de le pré-remplir — voir R4. */
  sectorId: z.uuid().nullable(),
  headcount: z.number().int().nullable(),
  sitesCount: z.number().int().nullable(),
  countries: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});

export type CompanyResponse = z.infer<typeof companyResponseSchema>;

/**
 * Un homonyme possible — l'« alerte » de R3 pour sa moitié « nom en second ».
 *
 * On rend l'IDENTIFIANT et le NOM, jamais un score de ressemblance : un score
 * inviterait à fixer un seuil, donc à décider à la place de l'humain, ce que R3
 * refuse précisément en disant « alerte ».
 */
export const homonymeCompanySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
});

export type HomonymeCompany = z.infer<typeof homonymeCompanySchema>;

/**
 * LA RÉPONSE D'UNE ÉCRITURE (`POST`, `PATCH`) — la fiche ET ce que l'écriture a
 * constaté.
 *
 * ── POURQUOI LA FICHE EST IMBRIQUÉE ICI, ALORS QUE `GET` LA REND À PLAT ──────
 * `secteurAQualifier` et `doublonsNomPossibles` ne sont **pas des propriétés de
 * l'entreprise** : ce sont des constats sur l'ACTE d'écriture, vrais à cet instant
 * et pour cet appelant. Les aplatir dans `companyResponseSchema` obligerait la
 * lecture (`GET`) à les recalculer à chaque affichage — donc à rescanner les
 * homonymes sur une route de consultation — ou à les rendre faux. L'asymétrie est
 * le prix, honnête, de cette distinction.
 *
 * Nommage `secteurAQualifier` : repris **verbatim** de `docs/conception/LOT_L3.md`
 * §3d, qui lie ce lot. Voir `DECISIONS.md` du 2026-08-31 pour l'écart de langue
 * assumé avec le reste des champs.
 */
export const companyWriteResponseSchema = z.strictObject({
  company: companyResponseSchema,
  /**
   * **R4** : `true` quand un code APE valide a été fourni mais qu'aucune division
   * de `naf_sector_map` ne le couvre. Ce n'est pas une erreur — c'est une invitation
   * à choisir le secteur à la main. `false` quand le secteur est renseigné, ou
   * quand aucun code APE n'a été fourni (rien à qualifier).
   */
  secteurAQualifier: z.boolean(),
  /**
   * **R3, moitié « nom en second »** : les fiches existantes dont le nom normalisé
   * est identique. **Vide dans le cas courant.** Non bloquant, par construction :
   * la liste accompagne un `201`/`200`, jamais un refus.
   */
  doublonsNomPossibles: z.array(homonymeCompanySchema),
});

export type CompanyWriteResponse = z.infer<typeof companyWriteResponseSchema>;

// -----------------------------------------------------------------------------
// ENTRÉES
// -----------------------------------------------------------------------------

/**
 * `POST /v1/companies` — création.
 *
 * ── LES CHAMPS QUE CE SCHÉMA REFUSE, ET POURQUOI ────────────────────────────
 *  · **`id`** : UUID v7 frappé **côté serveur** (11 §2, lib `uuidv7`). Une
 *    entreprise n'est pas une entité créable hors ligne — l'invariant 1 vise la
 *    collecte terrain, pas le référentiel client de la console. Laisser l'appelant
 *    choisir l'identifiant lui donnerait de quoi écraser une fiche par un `POST`.
 *  · **`deletedAt`, `createdAt`, `updatedAt`** : appartiennent au dépôt. Un appelant
 *    qui pourrait choisir son horodatage pourrait antidater une fiche client.
 *
 * `siren` et `nafCode` sont explicitement NULLABLES avec un défaut nul : une filiale
 * étrangère n'a ni l'un ni l'autre, et le contrat doit le dire plutôt que de laisser
 * l'appelant deviner qu'omettre un champ vaut « inconnu ».
 */
export const createCompanyRequestSchema = z.strictObject({
  name: nomEntrepriseSchema,
  siren: sirenSchema.nullable().default(null),
  nafCode: nafCodeSchema.nullable().default(null),
  /**
   * Secteur IMPOSÉ par l'appelant. Quand il est fourni, il l'emporte sur le
   * pré-remplissage R4 : « pré-rempli » (03 §29) décrit une commodité de saisie,
   * pas une contrainte — et un secteur choisi à la main par un consultant en vaut
   * toujours mieux qu'une division NAF.
   */
  sectorId: z.uuid().nullable().default(null),
  externalRef: refExterneSchema.nullable().default(null),
  headcount: effectifSchema.nullable().default(null),
  sitesCount: effectifSchema.nullable().default(null),
  countries: z.array(codePaysSchema).max(PAYS_MAX).default([]),
  notes: notesSchema.nullable().default(null),
});

export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/**
 * `PATCH /v1/companies/:id` — modification.
 *
 * ── `undefined` ET `null` NE DISENT PAS LA MÊME CHOSE, ET C'EST LE CŒUR ──────
 * Champ ABSENT = « ne touche pas ». Champ à `null` = « efface la valeur ». Les
 * confondre rendrait impossible de retirer un SIREN saisi par erreur autrement
 * qu'en écrivant directement en base — et l'invariant 7 (« toute correction est une
 * révision tracée ») suppose qu'une correction soit possible par l'API.
 *
 * `refine` plutôt qu'un objet libre : un `PATCH {}` n'est pas une modification.
 * Le refuser évite une ligne de journal vide et un `updated_at` bousculé pour rien.
 */
export const updateCompanyRequestSchema = z
  .strictObject({
    name: nomEntrepriseSchema.optional(),
    siren: sirenSchema.nullable().optional(),
    nafCode: nafCodeSchema.nullable().optional(),
    sectorId: z.uuid().nullable().optional(),
    externalRef: refExterneSchema.nullable().optional(),
    headcount: effectifSchema.nullable().optional(),
    sitesCount: effectifSchema.nullable().optional(),
    countries: z.array(codePaysSchema).max(PAYS_MAX).optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

export type UpdateCompanyRequest = z.infer<typeof updateCompanyRequestSchema>;

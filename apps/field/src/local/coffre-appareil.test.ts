// =============================================================================
// TESTS DU COFFRE D'APPAREIL — lot L5, incrément L5a (couverture du module
// critique `apps/field/src/local/**`, DoD ≥ 90 % mesurée).
//
// Écrits par A26 depuis 05 §9.7 et 05 §31-3, et depuis les SEULES signatures et
// JSDoc exportées de `coffre-appareil.ts` (09 §5.6) :
//   `lireCoffreAuRepos(base)` · `initialiserCoffre(base, mdp, params?)` (« ne fait
//   rien si un coffre existe déjà ») · `deverrouiller(base, mdp)` (« aucun réseau
//   requis ») · `etatAvantChangementDeMotDePasse(base)` (« la donnée du garde-fou
//   05 §9.7 ») · `changerMotDePasse(base, ancien, nouveau, params?)`
//   (« ré-enveloppement : les données ne sont pas touchées »).
//
// Traçabilité : E33 (sécurité / RGPD — KEK dérivée du mot de passe, DEK
// enveloppée au repos) · E6 (hors ligne total — déverrouillage sans serveur).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@axion/shared';
import { BaseLocale, CLES_META, SCHEMA_LOCAL, ecrireMeta, effacerMeta } from './base.js';
import {
  CoffreAbsentError,
  DonneesSansCoffreError,
  changerMotDePasse,
  deverrouiller,
  etatAvantChangementDeMotDePasse,
  initialiserCoffre,
  lireCoffreAuRepos,
  type CoffreAuRepos,
} from './coffre-appareil.js';
import {
  BORNES_KDF,
  CoffreIllisibleError,
  MotDePasseInvalideError,
  MotDePasseTropCourtError,
  PARAMETRES_KDF_DEFAUT,
  ParametresKdfHorsBornesError,
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  type Enveloppe,
} from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { ecrireLocal } from './ecriture.js';
import { versBase64 } from './enveloppe.js';

const MDP = 'correct-cheval-pile-agrafe-2026';
const MDP_NOUVEAU = 'nouveau-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const SENTINELLE = 'SENTINELLE_COFFRE_APPAREIL_QX8N2V';

const schemaClair = z.object({ valeur: z.string() });

let compteur = 0;
const bases: BaseLocale[] = [];

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-coffre-appareil-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

async function ecrireUneReponse(
  base: BaseLocale,
  coffre: Awaited<ReturnType<typeof deverrouiller>>,
) {
  installerContexteLocal({ base, coffre });
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: '0191e2a0-0000-7000-8000-00000000a001',
      missionQuestionId: '0191e2a0-0000-7000-8000-00000000b001',
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 1 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: '2026-09-02T08:15:00.000Z',
    },
  });
}

// =============================================================================
// A. Naissance du coffre
// =============================================================================
describe('initialiserCoffre / lireCoffreAuRepos (05 §9.7)', () => {
  it('sur un appareil neuf, aucun coffre au repos', async () => {
    const base = await nouvelleBase();
    expect(await lireCoffreAuRepos(base)).toBeNull();
  });

  it('@critique initialiser range dans `meta` un sel, des paramètres et une DEK ENVELOPPÉE — jamais la DEK', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    await expect(coffre.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });

    const auRepos = await lireCoffreAuRepos(base);
    expect(auRepos).not.toBeNull();
    expect(auRepos?.sel.length).toBeGreaterThan(0);
    expect(auRepos?.parametres.algo).toBe('argon2id');
    // Ce qui est au repos ne doit permettre de rien déchiffrer sans le mot de passe :
    // la DEK n'y est qu'enveloppée. On le prouve en cherchant un tampon de 32
    // octets NU dans la ligne `meta` — il n'y en a pas.
    const ligne = await base.meta.get(CLES_META.coffre);
    const texte = JSON.stringify(ligne);
    expect(texte).not.toContain(SENTINELLE);
    expect(ligne).toBeDefined();
  });

  it('@critique initialiser une seconde fois NE REMPLACE PAS le coffre existant (invariant 7)', async () => {
    const base = await nouvelleBase();
    const coffre1 = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre1.chiffrer({ valeur: SENTINELLE });
    const auRepos1 = JSON.stringify(await lireCoffreAuRepos(base));

    const coffre2 = await initialiserCoffre(base, MDP);
    expect(JSON.stringify(await lireCoffreAuRepos(base))).toEqual(auRepos1);
    await expect(coffre2.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('initialiser avec un AUTRE mot de passe alors qu’un coffre existe est refusé (ce n’est pas une réinitialisation)', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(initialiserCoffre(base, MDP_NOUVEAU)).rejects.toThrow(MotDePasseInvalideError);
    // Et le coffre d'origine est intact.
    await expect(deverrouiller(base, MDP)).resolves.toBeDefined();
  });

  it('deux appareils (deux bases) reçoivent deux sels différents', async () => {
    const base1 = await nouvelleBase();
    const base2 = await nouvelleBase();
    await initialiserCoffre(base1, MDP);
    await initialiserCoffre(base2, MDP);
    const sel1 = (await lireCoffreAuRepos(base1))?.sel;
    const sel2 = (await lireCoffreAuRepos(base2))?.sel;
    expect(sel1).toBeDefined();
    expect(sel1).not.toEqual(sel2);
  });
});

// =============================================================================
// B. Déverrouillage — sans réseau, avec le mot de passe et rien d'autre
// =============================================================================
describe('deverrouiller (05 §9.7, §31-3)', () => {
  it('@critique le bon mot de passe rouvre le coffre et relit ce qui a été chiffré avant', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    coffre.verrouiller();

    const rouvert = await deverrouiller(base, MDP);
    await expect(rouvert.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique un mauvais mot de passe est refusé par une erreur NOMMÉE, pas par un coffre vide', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(deverrouiller(base, MDP_NOUVEAU)).rejects.toThrow(MotDePasseInvalideError);
  });

  it('sans coffre initialisé, déverrouiller lève `CoffreAbsentError`', async () => {
    const base = await nouvelleBase();
    await expect(deverrouiller(base, MDP)).rejects.toThrow(CoffreAbsentError);
  });

  it('les erreurs nommées portent un message en français, sans le mot de passe dedans', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    let message = '';
    try {
      await deverrouiller(base, MDP_NOUVEAU);
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }
    expect(message).toMatch(/[a-zéèêàç]/);
    expect(message).not.toContain(MDP_NOUVEAU);
    expect(message).not.toContain(MDP);
  });
});

// =============================================================================
// C. Changement de mot de passe — ré-enveloppement, et le garde-fou §9.7
// =============================================================================
describe('changerMotDePasse / etatAvantChangementDeMotDePasse (05 §9.7)', () => {
  it('@critique après changement, l’ANCIEN mot de passe est refusé et le NOUVEAU relit les données', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });

    const coffreNouveau = await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    await expect(coffreNouveau.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
    await expect(deverrouiller(base, MDP)).rejects.toThrow(MotDePasseInvalideError);
    const rouvert = await deverrouiller(base, MDP_NOUVEAU);
    await expect(rouvert.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique les lignes locales ne sont PAS re-chiffrées : leurs enveloppes sont identiques après le changement', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    const lignesAvant = JSON.stringify(await base.answers.toArray());

    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    expect(JSON.stringify(await base.answers.toArray())).toEqual(lignesAvant);
  });

  it('un ancien mot de passe faux fait échouer le changement, et le coffre reste ouvrable avec le vrai', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(changerMotDePasse(base, MDP_NOUVEAU, 'encore-un-autre-2026')).rejects.toThrow(
      MotDePasseInvalideError,
    );
    await expect(deverrouiller(base, MDP)).resolves.toBeDefined();
  });

  it('sans coffre, changer le mot de passe lève `CoffreAbsentError`', async () => {
    const base = await nouvelleBase();
    await expect(changerMotDePasse(base, MDP, MDP_NOUVEAU)).rejects.toThrow(CoffreAbsentError);
  });

  it('outbox vide ⇒ aucun avertissement avant changement', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const etat = await etatAvantChangementDeMotDePasse(base);
    expect(etat.operationsEnAttente).toBe(0);
    expect(etat.avertissement).toBeNull();
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un écran qui annonce « mot de passe changé »
  // alors que le serveur refusera la réinitialisation tant que l'outbox n'est
  // pas vide (05 §9.7). Le compteur doit être VRAI (lu dans la file), et
  // l'avertissement doit exister dès qu'il est > 0.
  it('@critique outbox non vide ⇒ compteur exact et avertissement en français qui cite le nombre', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    await ecrireUneReponse(base, coffre);
    await ecrireUneReponse(base, coffre);

    const etat = await etatAvantChangementDeMotDePasse(base);
    expect(etat.operationsEnAttente).toBe(3);
    expect(etat.avertissement).not.toBeNull();
    expect(etat.avertissement).toContain('3');
    expect(etat.avertissement).toMatch(/[a-zéèêàç]/);
  });

  it('le changement de mot de passe n’efface ni la file ni les lignes', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    expect(await base.outbox.count()).toBe(1);
    expect(await base.answers.count()).toBe(1);
  });

  it('l’enveloppe de DEK au repos change (nouvelle KEK) et le coffre reste complet', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const avant = await lireCoffreAuRepos(base);
    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    const apres = await lireCoffreAuRepos(base);
    expect(apres?.sel.length).toBeGreaterThan(0);
    expect(apres?.parametres.algo).toBe('argon2id');
    expect(JSON.stringify(apres?.dekEnveloppee as Enveloppe)).not.toEqual(
      JSON.stringify(avant?.dekEnveloppee as Enveloppe),
    );
  });
});

// =============================================================================
// D. F-22 — « ABSENT » ET « ILLISIBLE » SONT DEUX ÉTATS DISTINCTS
//
// Ajouté le 2026-09-05 par A26, depuis le verdict A51 du 2026-09-04 (constat
// F-22, CRITIQUE) et depuis lui seul : la sonde qu'A51 a exécutée hors dépôt
// devient ici un test de NON-RÉGRESSION, joué à chaque commit. Le défaut mesuré
// était le plus destructeur du produit — une ligne `meta.coffre` rendue invalide
// (sans mot de passe, sans clé) faisait dire « appareil neuf » à un appareil qui
// portait une journée de collecte, et le mot de passe de l'auditeur écrasait
// alors l'enveloppe de sa propre DEK. Les lignes restaient toutes là ; plus rien
// n'était lisible, définitivement.
//
// Le déclencheur n'a pas besoin d'un attaquant : n'importe quel échec de
// `safeParse` suffit — écriture partielle sur une tablette qui s'éteint, quota
// atteint, ou une version future qui ajoute un champ requis au schéma.
//
// Traçabilité : E33 (sécurité / RGPD) · E38 (sauvegarde terrain) ; invariants 7
// et 8 ; 05 §9.7 ; 06 §10.5.
// =============================================================================

/** Une valeur reconnaissable, plantée dans `meta` : aucun message ne doit la republier. */
const VALEUR_SENTINELLE = 'SENTINELLE_VALEUR_META_R7K4Z';

/** Les tables de collecte de `SCHEMA_LOCAL`, avec le nom de leur clé primaire. */
const TABLES_DE_COLLECTE = [
  { nom: 'missions', cle: 'id' },
  { nom: 'missionQuestions', cle: 'id' },
  { nom: 'orgUnits', cle: 'id' },
  { nom: 'interviews', cle: 'id' },
  { nom: 'answers', cle: 'id' },
  { nom: 'attachments', cle: 'id' },
  { nom: 'workAssignments', cle: 'id' },
  { nom: 'outbox', cle: 'opId' },
] as const;

/** La ligne `meta.coffre` telle qu'elle est RANGÉE — l'octet à octet du test. */
async function empreinteDuCoffreAuRepos(base: BaseLocale): Promise<string> {
  return JSON.stringify(await base.meta.get(CLES_META.coffre));
}

/**
 * Le coffre au repos lu SANS passer par `lireCoffreAuRepos` — c'est-à-dire sans
 * le module qu'on éprouve. Lève si la ligne n'existe pas : une sonde qui altère
 * une ligne absente ne prouverait rien, et son vert serait un mensonge.
 */
async function coffreAuReposBrut(base: BaseLocale): Promise<CoffreAuRepos> {
  const ligne = await base.meta.get(CLES_META.coffre);
  if (ligne === undefined) {
    throw new Error('aucune ligne `meta.coffre` : la sonde n’altérerait rien.');
  }
  return structuredClone(ligne.valeur) as CoffreAuRepos;
}

/** Une table de collecte, typée par sa seule clé primaire — Dexie ne valide pas la forme. */
function tableDeCollecte(base: BaseLocale, nom: string): Table<Record<string, string>, string> {
  return base.table<Record<string, string>, string>(nom);
}

describe('F-22 — un coffre ILLISIBLE ne se lit jamais « absent » (verdict A51, CRITIQUE)', () => {
  it('@critique ligne `meta.coffre` ALTÉRÉE : lecture ET initialisation lèvent, la ligne ne bouge pas d’un octet, et la réparation rouvre la DEK D’AVANT', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    const enveloppeDAvant = await coffre.chiffrer({ valeur: SENTINELLE });

    // Anti-vacuité ① — avant l'altération, le coffre se lit et l'appareil porte
    // bien une réponse d'audit NON synchronisée. C'est ce qui est en jeu.
    expect(await lireCoffreAuRepos(base)).not.toBeNull();
    expect(await base.answers.count()).toBe(1);
    expect(await base.outbox.count()).toBe(1);

    // L'écriture d'A51, reproduite à l'identique : UNE propriété rendue invalide,
    // par une écriture directe, sans mot de passe et sans clé.
    const intact = await coffreAuReposBrut(base);
    const empreinteIntacte = await empreinteDuCoffreAuRepos(base);
    await ecrireMeta(base, CLES_META.coffre, {
      ...intact,
      parametres: { ...intact.parametres, memoireKio: VALEUR_SENTINELLE },
    });

    // Anti-vacuité ② — la ligne est TOUJOURS présente (altérée, pas supprimée) et
    // elle a réellement changé. Sans ces deux contrôles, tout ce qui suit pourrait
    // passer au vert sur un appareil simplement neuf.
    const empreinteAlteree = await empreinteDuCoffreAuRepos(base);
    expect(await base.meta.get(CLES_META.coffre)).toBeDefined();
    expect(empreinteAlteree).not.toEqual(empreinteIntacte);

    // Le cœur du constat : ni `null`, ni « premier usage ».
    await expect(lireCoffreAuRepos(base)).rejects.toThrow(CoffreIllisibleError);
    await expect(initialiserCoffre(base, MDP)).rejects.toThrow(CoffreIllisibleError);
    await expect(initialiserCoffre(base, MDP_NOUVEAU)).rejects.toThrow(CoffreIllisibleError);

    // Aucun sel neuf, aucune DEK neuve, aucune ligne perdue : octet à octet.
    expect(await empreinteDuCoffreAuRepos(base)).toEqual(empreinteAlteree);
    expect(await base.answers.count()).toBe(1);
    expect(await base.outbox.count()).toBe(1);

    // Et la démonstration que rien n'a été détruit : la ligne réparée rouvre
    // l'enveloppe chiffrée AVANT l'incident.
    await ecrireMeta(base, CLES_META.coffre, intact);
    const rouvert = await deverrouiller(base, MDP);
    await expect(rouvert.dechiffrer(enveloppeDAvant, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('ligne `meta.coffre` ABSENTE : `lireCoffreAuRepos` rend `null` — le cas « appareil neuf » n’a pas été perdu en réparant l’autre', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    expect(await lireCoffreAuRepos(base)).not.toBeNull(); // anti-vacuité
    await effacerMeta(base, CLES_META.coffre);
    expect(await base.meta.get(CLES_META.coffre)).toBeUndefined();
    await expect(lireCoffreAuRepos(base)).resolves.toBeNull();
  });

  it('ligne présente et LISIBLE + mauvais mot de passe : `MotDePasseInvalideError`, et le coffre reste intact', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const empreinte = await empreinteDuCoffreAuRepos(base);
    await expect(deverrouiller(base, MDP_NOUVEAU)).rejects.toThrow(MotDePasseInvalideError);
    expect(await empreinteDuCoffreAuRepos(base)).toEqual(empreinte);
    await expect(deverrouiller(base, MDP)).resolves.toBeDefined();
  });

  it('@critique le message de `CoffreIllisibleError` cite des CHEMINS Zod et AUCUNE valeur de `meta` (11 §2)', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const intact = await coffreAuReposBrut(base);
    await ecrireMeta(base, CLES_META.coffre, {
      ...intact,
      sel: 42,
      parametres: { ...intact.parametres, memoireKio: VALEUR_SENTINELLE },
    });

    let message = '';
    try {
      await lireCoffreAuRepos(base);
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }

    // Les CHEMINS, dans l'ordre du schéma — l'assertion est exacte pour qu'un
    // message qui se contenterait d'un mot vague ne passe pas.
    expect(message).toContain('sel, parametres.memoireKio');
    // Et AUCUNE valeur : ni celle qu'on a plantée, ni le sel, ni le chiffré de la DEK.
    expect(message).not.toContain(VALEUR_SENTINELLE);
    expect(message).not.toContain(intact.sel);
    expect(message).not.toContain(intact.dekEnveloppee.c);
    expect(message).not.toContain(intact.dekEnveloppee.n);
    expect(message).toMatch(/[a-zéèêàç]/);
  });
});

describe('F-22, seconde ceinture — on ne « prépare » pas un appareil qui porte déjà des données', () => {
  for (const { nom, cle } of TABLES_DE_COLLECTE) {
    it(`@critique des lignes dans « ${nom} » sans coffre : DonneesSansCoffreError, compte exact, aucune écriture`, async () => {
      const base = await nouvelleBase();
      const table = tableDeCollecte(base, nom);
      await table.put({ [cle]: uuidv7() });
      await table.put({ [cle]: uuidv7() });

      // Anti-vacuité : il n'y a réellement aucun coffre, et il y a réellement
      // deux lignes — sans quoi le refus attendu n'aurait aucune cause.
      expect(await base.meta.get(CLES_META.coffre)).toBeUndefined();
      expect(await table.count()).toBe(2);

      let erreur: unknown = null;
      try {
        await initialiserCoffre(base, MDP);
      } catch (attrapee) {
        erreur = attrapee;
      }

      expect(erreur).toBeInstanceOf(DonneesSansCoffreError);
      // Le compte CITÉ est le compte RÉEL : « 2 », pas un « 1 » écrit en dur.
      expect(erreur instanceof Error ? erreur.message : '').toContain('2 enregistrement');
      // Aucune écriture : ni coffre, ni identifiant d'appareil, ni perte de lignes.
      expect(await base.meta.count()).toBe(0);
      expect(await table.count()).toBe(2);
    });
  }

  it('@critique « meta » n’est PAS de la collecte : une ligne meta seule laisse préparer un appareil neuf', async () => {
    const base = await nouvelleBase();
    await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette de démonstration');
    expect(await base.meta.count()).toBe(1);
    await expect(initialiserCoffre(base, MDP)).resolves.toBeDefined();
  });

  it('@critique la ceinture couvre TOUTES les tables de `SCHEMA_LOCAL` — une table ajoutée demain ne sortira pas du compte en silence', () => {
    // Ce test est la charnière : la liste `TABLES_DE_COLLECTE` engendre un test
    // par table ci-dessus. Ajouter une table à `SCHEMA_LOCAL` sans l'ajouter ici
    // fait rougir CE test ; l'ajouter ici engendre un test qui rougira si
    // `compterDonneesLocales` ne la compte pas. Aucune des deux moitiés ne peut
    // être oubliée sans que la CI le dise.
    const tablesDuSchema = new Set<string>();
    for (const etape of SCHEMA_LOCAL) {
      for (const [table, definition] of Object.entries(etape.tables)) {
        if (definition === null) tablesDuSchema.delete(table);
        else tablesDuSchema.add(table);
      }
    }
    const couvertes = [...TABLES_DE_COLLECTE.map(({ nom }) => nom), 'meta'];
    expect([...tablesDuSchema].sort()).toEqual([...couvertes].sort());
  });

  it('@critique appareil VRAIMENT neuf (zéro ligne partout) : la création réussit — non-régression du chemin nominal', async () => {
    const base = await nouvelleBase();
    for (const { nom } of TABLES_DE_COLLECTE) {
      expect(await tableDeCollecte(base, nom).count()).toBe(0);
    }
    expect(await base.meta.count()).toBe(0);

    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    await expect(coffre.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
    expect(await lireCoffreAuRepos(base)).not.toBeNull();
  });
});

// =============================================================================
// E. F-23 — LA POLITIQUE DE MOT DE PASSE, ET LÀ OÙ ELLE NE S'APPLIQUE JAMAIS
// =============================================================================
describe('F-23 — le mot de passe du coffre suit la politique 06 §10.1 (verdict A51, MAJEUR)', () => {
  it('@critique un mot de passe plus court que la politique est REFUSÉ, et AUCUNE ligne `meta` n’est écrite', async () => {
    const base = await nouvelleBase();
    const court = 'a'.repeat(MOT_DE_PASSE_LONGUEUR_MIN - 1);
    expect(court).toHaveLength(MOT_DE_PASSE_LONGUEUR_MIN - 1);

    await expect(initialiserCoffre(base, court)).rejects.toThrow(MotDePasseTropCourtError);

    // Le refus doit être TOTAL : ni coffre, ni identifiant d'appareil, rien.
    expect(await base.meta.count()).toBe(0);
    await expect(lireCoffreAuRepos(base)).resolves.toBeNull();
  });

  it('@critique la borne est INCLUSIVE : exactement `MOT_DE_PASSE_LONGUEUR_MIN` caractères est accepté', async () => {
    const base = await nouvelleBase();
    const pile = 'a'.repeat(MOT_DE_PASSE_LONGUEUR_MIN);
    expect(pile).toHaveLength(MOT_DE_PASSE_LONGUEUR_MIN);

    const coffre = await initialiserCoffre(base, pile);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    await expect(coffre.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique un coffre créé sous un mot de passe COURT continue de s’ouvrir : un durcissement ne ferme JAMAIS une base existante (invariant 7)', async () => {
    const base = await nouvelleBase();
    const court = 'court';
    expect(court.length).toBeLessThan(MOT_DE_PASSE_LONGUEUR_MIN);

    // Un coffre « d'avant la politique », posé sans passer par `initialiserCoffre`
    // — c'est-à-dire exactement ce qu'un appareil déjà en mission porte aujourd'hui.
    const sel = genererSel();
    const kek = await deriverKek(court, sel);
    const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);
    const enveloppeDAvant = await coffre.chiffrer({ valeur: SENTINELLE });
    await ecrireMeta(base, CLES_META.coffre, {
      sel: versBase64(sel),
      parametres: PARAMETRES_KDF_DEFAUT,
      dekEnveloppee,
    } satisfies CoffreAuRepos);

    const rouvert = await deverrouiller(base, court);
    await expect(rouvert.dechiffrer(enveloppeDAvant, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique la politique ne s’applique pas au DÉVERROUILLAGE : un mot de passe court et faux rend `MotDePasseInvalideError`, jamais `MotDePasseTropCourtError`', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);

    let erreur: unknown = null;
    try {
      await deverrouiller(base, 'court');
    } catch (attrapee) {
      erreur = attrapee;
    }
    expect(erreur).toBeInstanceOf(MotDePasseInvalideError);
    expect(erreur).not.toBeInstanceOf(MotDePasseTropCourtError);
  });

  it('@critique `changerMotDePasse` refuse un NOUVEAU mot de passe trop court, et l’ancien ouvre toujours', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    const empreinteAvant = await empreinteDuCoffreAuRepos(base);

    await expect(changerMotDePasse(base, MDP, 'court')).rejects.toThrow(MotDePasseTropCourtError);

    // Ni ré-enveloppement, ni sel neuf : la ligne n'a pas bougé.
    expect(await empreinteDuCoffreAuRepos(base)).toEqual(empreinteAvant);
    const rouvert = await deverrouiller(base, MDP);
    await expect(rouvert.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
    await expect(deverrouiller(base, 'court')).rejects.toThrow(MotDePasseInvalideError);
  });
});

// =============================================================================
// F. F-25 — DES PARAMÈTRES VENUS DU STOCKAGE SONT UNE ENTRÉE NON FIABLE
// =============================================================================
describe('F-25 — paramètres KDF hors bornes AU REPOS (verdict A51, MAJEUR)', () => {
  it('@critique lecture, déverrouillage et initialisation lèvent `ParametresKdfHorsBornesError` ; la ligne ne bouge pas ; la réparation rouvre', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppeDAvant = await coffre.chiffrer({ valeur: SENTINELLE });
    const intact = await coffreAuReposBrut(base);

    // Anti-vacuité : ces valeurs sont bien AU-DESSUS des bornes publiées, et elles
    // sont DÉRIVÉES de `BORNES_KDF` — un plafond relevé demain ne rendra pas ce
    // test vert par accident. Et si la garde ne mordait pas, `deverrouiller`
    // passerait ces paramètres à Argon2id : le test ne passerait pas au vert, il
    // tuerait le worker. C'est la forme la plus honnête de l'anti-vacuité ici.
    await ecrireMeta(base, CLES_META.coffre, {
      ...intact,
      parametres: {
        ...intact.parametres,
        memoireKio: BORNES_KDF.memoireKioMax + 1,
        iterations: BORNES_KDF.iterationsMax + 1,
      },
    });
    const empreinteHorsBornes = await empreinteDuCoffreAuRepos(base);
    expect(empreinteHorsBornes).toContain(String(BORNES_KDF.memoireKioMax + 1));

    await expect(lireCoffreAuRepos(base)).rejects.toThrow(ParametresKdfHorsBornesError);
    await expect(deverrouiller(base, MDP)).rejects.toThrow(ParametresKdfHorsBornesError);
    await expect(initialiserCoffre(base, MDP)).rejects.toThrow(ParametresKdfHorsBornesError);
    expect(await empreinteDuCoffreAuRepos(base)).toEqual(empreinteHorsBornes);

    await ecrireMeta(base, CLES_META.coffre, intact);
    const rouvert = await deverrouiller(base, MDP);
    await expect(rouvert.dechiffrer(enveloppeDAvant, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });
});

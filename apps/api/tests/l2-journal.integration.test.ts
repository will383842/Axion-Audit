// =============================================================================
// LOT L2 / T4 — LA PORTE D'ÉCRITURE DU JOURNAL, ÉPROUVÉE SUR UNE BASE RÉELLE.
//
// Écrit par A17, réviseur croisé du lot, qui n'a produit AUCUNE des lignes testées
// (09 §5.6). Les attentes viennent de la note `docs/conception/LOT_L2.md` §2.4 et
// §5, de 06 §10.4 (régime RGPD de la colonne `ip`) et de l'invariant 7 — jamais du
// décalque des branches de leur sujet.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CE FICHIER EXISTE : LA NOTE L2 §5 PROMETTAIT CE TEST, ET IL N'A JAMAIS
// ÉTÉ ÉCRIT.
// ═══════════════════════════════════════════════════════════════════════════════
// Le plan de tests du lot annonce, en toutes lettres, un contrôle de « Pureté
// d'`activity_log` ». Mesure du 2026-08-29 : AUCUN test du dépôt ne lisait cette
// table. `domaines/journal/**` sortait à 74,67 % de lignes et 46,15 % de branches,
// et les trois refus de `normaliserIp` — la seule chose qui empêche un anonyme
// d'écrire ce qu'il veut dans une colonne sous régime RGPD — n'étaient exercés par
// rien.
//
// ── LE SCÉNARIO QUI COMPTE, ET POURQUOI IL EST RÉALISTE ──────────────────────
// `request.ip` N'EST PAS TOUJOURS UNE ADRESSE. Sous `trustProxy`, Fastify lit
// `X-Forwarded-For` et rend l'entrée la plus à gauche hors périmètre de confiance —
// une CHAÎNE FOURNIE PAR LE CLIENT, que Fastify ne valide pas. Le chemin d'attaque
// tient en une ligne de `curl` : `POST /v1/auth/login` est PUBLIQUE, elle écrit une
// ligne d'audit même pour un compte inconnu, et elle accepte dix requêtes par
// minute. Sans la borne, un anonyme écrit une adresse e-mail — ou n'importe quel
// texte — dans `activity_log.ip`, c'est-à-dire dans la table dont tout le module
// garantit qu'elle ne contient pas de donnée personnelle.
//
// Les tests d'IP ci-dessous passent donc par LA ROUTE PUBLIQUE et lisent LA TABLE.
// Éprouver `normaliserIp` en l'appelant directement aurait prouvé que la fonction
// filtre ; cela n'aurait pas prouvé qu'elle est BRANCHÉE sur le chemin qu'un
// attaquant emprunte — et c'est cette seconde chose qui protège.
//
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention activity_log), invariant 7.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { EvenementJournal } from '@axion/shared';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';

// Secrets FACTICES (11 §2) : 64 caractères hexadécimaux = les 32 octets exigés.
const SECRET_ACCES = '33'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '44'.repeat(32);

let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let journaliser: (
  evenement: EvenementJournal,
  contexte: { readonly ip: string | null; readonly journal: FastifyInstance['log'] },
) => Promise<void>;

/** Un compte réel : `activity_log.user_id` porte une clé étrangère vers `users`. */
const compteId = uuidv7();

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

interface LigneJournal {
  readonly id: string;
  readonly user_id: string | null;
  readonly action: string;
  readonly meta: unknown;
  readonly ip: string | null;
}

/** Toutes les lignes, dans l'ordre chronologique (l'`id` est un UUID v7). */
async function lignes(): Promise<LigneJournal[]> {
  const resultat = await bd().query<LigneJournal>(
    `SELECT id, user_id, action, meta, ip FROM activity_log ORDER BY id`,
  );
  return resultat.rows;
}

/**
 * La ligne écrite depuis le dernier appel. Rend `null` si aucune ne l'a été —
 * distinction essentielle : « aucune ligne » est le VERDICT ATTENDU du refus de
 * catalogue, pas un échec de lecture.
 */
let dejaVues = 0;
async function nouvellesLignes(): Promise<LigneJournal[]> {
  const toutes = await lignes();
  const fraiches = toutes.slice(dejaVues);
  dejaVues = toutes.length;
  return fraiches;
}

/**
 * Tente une connexion sur un compte INEXISTANT, depuis l'adresse `ip` annoncée.
 *
 * Le compte inexistant est délibéré : c'est le chemin ANONYME, celui qu'un
 * attaquant peut emprunter sans rien connaître du système, et il écrit quand même
 * une ligne (`auth.login.echec`) — c'est précisément ce qui rend un balayage
 * visible à l'audit, et c'est aussi ce qui expose la colonne `ip`.
 */
async function connexionRatee(ipAnnoncee: string): Promise<number> {
  const reponse = await api().inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { 'x-forwarded-for': ipAnnoncee },
    payload: { email: `inconnu.${uuidv7()}@exemple.test`, password: 'mot-de-passe-factice' },
  });
  return reponse.statusCode;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l2_journal');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  client = await connecter(base.url);

  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, 'Compte journal', 'compte.journal@exemple.test', 'argon2-factice',
             'consultant', 'guide_strict', now(), true, now(), now())`,
    [compteId],
  );

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit être
  // posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;

  const moduleJournal = await import('../src/domaines/journal/service.js');
  journaliser = moduleJournal.journaliserActivite;

  dejaVues = (await lignes()).length;
}, 180_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// LA COLONNE `ip` — CE QU'UN ANONYME PEUT Y ÉCRIRE, ET CE QU'IL NE PEUT PAS
// =============================================================================
describe('`activity_log.ip` — la borne, éprouvée depuis une route PUBLIQUE', () => {
  it('contre-épreuve : une VRAIE adresse est écrite telle quelle', async () => {
    // D'ABORD la contre-épreuve, et ce n'est pas un caprice d'ordre : sans elle,
    // une implémentation qui écrirait TOUJOURS `NULL` passerait tous les refus
    // ci-dessous. On prouve que la colonne se remplit avant de prouver ce qui ne
    // la remplit pas — sinon « rien ne fuit » ne vaut que parce que rien n'entre.
    const statut = await connexionRatee('203.0.113.7');
    expect(statut).toBe(401);

    const fraiches = await nouvellesLignes();
    expect(fraiches, 'la route publique doit AVOIR écrit une ligne d’audit').toHaveLength(1);
    expect(fraiches[0]?.action).toBe('auth.login.echec');
    expect(
      fraiches[0]?.ip,
      'Une adresse valide DOIT être écrite : 06 §10.4 l’autorise nommément dans cette\n' +
        'table, et c’est elle qui rend un balayage d’adresses visible à l’audit.',
    ).toBe('203.0.113.7');
  });

  it('contre-épreuve : une adresse IPv6, y compris à zone locale, est écrite', async () => {
    await connexionRatee('2001:db8::1');
    const fraiches = await nouvellesLignes();
    expect(fraiches[0]?.ip).toBe('2001:db8::1');
  });

  it('@critique une ADRESSE E-MAIL forgée dans `X-Forwarded-For` n’entre PAS en base', async () => {
    // LE SCÉNARIO. Anonyme, une seule requête, sur une route publique. Si cette
    // chaîne atteint la colonne, la table qui promet de ne contenir aucune donnée
    // personnelle en contient une — écrite par la victime elle-même, sous le régime
    // RGPD de 06 §10.4, et là où personne ne pense à regarder.
    const statut = await connexionRatee('jean.dupont@exemple.test');
    expect(statut, 'la route doit refuser normalement, sans erreur interne').toBe(401);

    const fraiches = await nouvellesLignes();
    expect(
      fraiches,
      'La ligne d’audit doit EXISTER : on écarte l’adresse, on ne perd pas\n' +
        'l’événement (invariant 7 — un attaquant ne doit pas pouvoir effacer sa trace\n' +
        'en empoisonnant un champ).',
    ).toHaveLength(1);
    expect(
      fraiches[0]?.ip,
      'CECI EST LE TEST DE LA BORNE. Une valeur non nulle ici signifie qu’un anonyme\n' +
        'écrit du texte libre dans `activity_log.ip` — une donnée personnelle dans la\n' +
        'colonne même que le RGPD place sous régime strict, depuis /v1/auth/login.',
    ).toBeNull();
  });

  it('@critique du texte libre et des séparateurs ne passent pas davantage', async () => {
    // Trois formes qu'un attaquant essaierait avant d'abandonner : de la prose, une
    // tentative d'injection, et une charge utile structurée.
    for (const forge of ['Jean Dupont', "'; DROP TABLE users; --", '{"nom":"Dupont"}']) {
      await connexionRatee(forge);
      const fraiches = await nouvellesLignes();
      expect(fraiches, `« ${forge} » : la ligne doit exister`).toHaveLength(1);
      expect(fraiches[0]?.ip, `« ${forge} » ne doit PAS être écrit`).toBeNull();
    }
  });

  it('@critique une valeur TROP LONGUE est écartée, jamais tronquée', async () => {
    // 45 caractères est la longueur d'une IPv4-mappée maximale. Au-delà, on écarte :
    // une adresse tronquée est une adresse FAUSSE, et une fausse adresse dans un
    // journal d'audit est pire qu'une absence — elle désigne quelqu'un d'autre.
    const trop = '1'.repeat(46);
    await connexionRatee(trop);
    const fraiches = await nouvellesLignes();
    expect(fraiches).toHaveLength(1);
    expect(
      fraiches[0]?.ip,
      'Ni la valeur entière, ni un préfixe tronqué : la colonne doit rester NULLE.',
    ).toBeNull();
  });
});

// =============================================================================
// LES DEUX CEINTURES DE LA PORTE — « PURETÉ D'`activity_log` » (note L2 §5)
// =============================================================================
describe('porte du journal — ce qui n’a pas le droit d’entrer', () => {
  it('@critique un événement HORS CATALOGUE n’écrit AUCUNE ligne', async () => {
    // La ceinture ①. Le catalogue est fermé pour que le balayage de pureté sache ce
    // qu'il regarde ; une action inconnue rendrait ce balayage aveugle. L'appelant
    // TypeScript conforme ne peut pas produire ceci — mais un appelant qui a
    // reconstruit son événement depuis de l'`unknown` (une file, un import, une
    // migration) le peut, et c'est le cas que la porte doit tenir.
    const horsCatalogue = {
      action: 'auth.porte_derobee',
      utilisateurId: compteId,
    } as unknown as EvenementJournal;

    await journaliser(horsCatalogue, { ip: null, journal: api().log });

    expect(
      await nouvellesLignes(),
      'Une action hors catalogue ne doit produire AUCUNE ligne. Si une ligne apparaît,\n' +
        'le catalogue n’est plus fermé : n’importe quelle chaîne devient une action, et\n' +
        'le balayage de pureté ne sait plus ce qu’il énumère.',
    ).toHaveLength(0);
  });

  it('@critique une clé EN TROP est refusée, même sur une action valide', async () => {
    // `strictObject` : une clé non déclarée doit faire REFUSER l'événement, jamais
    // être ignorée en silence. Une clé ignorée est le pire des deux mondes —
    // l'appelant croit journaliser, la table ne porte rien, personne ne le voit
    // avant l'audit.
    const avecClefEnTrop = {
      action: 'auth.logout',
      utilisateurId: compteId,
      email: 'jean.dupont@exemple.test',
    } as unknown as EvenementJournal;

    await journaliser(avecClefEnTrop, { ip: null, journal: api().log });

    expect(await nouvellesLignes()).toHaveLength(0);
  });

  it('contre-épreuve : la MÊME action, bien formée, écrit bien sa ligne', async () => {
    // Sans ce cas, une porte qui refuserait TOUT passerait les deux tests ci-dessus.
    await journaliser(
      { action: 'auth.logout', utilisateurId: compteId },
      { ip: null, journal: api().log },
    );

    const fraiches = await nouvellesLignes();
    expect(fraiches).toHaveLength(1);
    expect(fraiches[0]?.action).toBe('auth.logout');
    expect(fraiches[0]?.user_id).toBe(compteId);
  });

  it('@critique une charge utile hors vocabulaire technique est ÉCARTÉE, la ligne SURVIT', async () => {
    // LA CEINTURE ②, ET CE QU'ELLE PROUVE : elle est INDÉPENDANTE DU SCHÉMA.
    //
    // Le cas est atteignable sans rien forcer, et c'est un écart réel entre les deux
    // ceintures : `jetonsRevoques` est déclaré `z.number().int().min(0)` — SANS borne
    // supérieure — tandis que la ceinture ② refuse tout entier au-delà de ±1 000 000.
    // Un décompte de famille aberrant (base corrompue, migration, compteur qui
    // déborde) franchit donc Zod et se fait écarter ici. C'est exactement ce que la
    // seconde ceinture existe pour attraper : ce que la première n'a pas vu.
    //
    // ET LA MOITIÉ QUI COMPTE AUTANT : la LIGNE EST ÉCRITE quand même. Perdre
    // l'événement entier pour un champ suspect ferait disparaître l'événement de
    // SÉCURITÉ lui-même — le résultat exact qu'un attaquant chercherait à provoquer
    // en empoisonnant un champ (invariant 7).
    await journaliser(
      { action: 'auth.reuse_detected', utilisateurId: compteId, jetonsRevoques: 2_000_001 },
      { ip: null, journal: api().log },
    );

    const fraiches = await nouvellesLignes();
    expect(
      fraiches,
      'La ligne doit EXISTER malgré la charge utile refusée : invariant 7.',
    ).toHaveLength(1);
    expect(fraiches[0]?.action).toBe('auth.reuse_detected');
    expect(
      fraiches[0]?.meta,
      'La charge utile doit être REMPLACÉE par le marqueur de refus, jamais écrite\n' +
        'telle quelle et jamais laissée vide sans trace du refus.',
    ).toEqual({ meta_refusee: true });
  });

  it('contre-épreuve : une charge utile conforme est écrite TELLE QUELLE', async () => {
    // Sans elle, une ceinture ② qui écarterait TOUTE charge utile passerait le test
    // ci-dessus — et le journal perdrait toute sa valeur diagnostique en silence.
    await journaliser(
      { action: 'auth.reuse_detected', utilisateurId: compteId, jetonsRevoques: 3 },
      { ip: null, journal: api().log },
    );

    const fraiches = await nouvellesLignes();
    expect(fraiches).toHaveLength(1);
    expect(fraiches[0]?.meta).toEqual({ jetons_revoques: 3 });
  });
});

// =============================================================================
// LE BALAYAGE DE PURETÉ — CE QUE LA NOTE L2 §5 PROMETTAIT
// =============================================================================
describe('pureté d’`activity_log` (note L2 §5)', () => {
  it('@critique après TOUS les scénarios, aucune sentinelle personnelle n’est en base', async () => {
    // Le balayage énumère ce qui EXISTE dans la table, pas ce à quoi on a pensé : il
    // relit TOUTES les lignes écrites par ce fichier — connexions ratées, forgeries,
    // charges utiles refusées — et cherche les sentinelles qu'on y a délibérément
    // injectées. Un test qui ne vérifierait que la ligne qu'il vient d'écrire
    // manquerait précisément celle qu'il n'a pas vu passer.
    const toutes = await lignes();
    expect(toutes.length, 'le balayage doit avoir de la matière à balayer').toBeGreaterThan(5);

    const contenu = JSON.stringify(toutes);
    for (const sentinelle of [
      'jean.dupont',
      'exemple.test',
      'Jean Dupont',
      'DROP TABLE',
      'mot-de-passe-factice',
    ]) {
      expect(
        contenu.includes(sentinelle),
        `La sentinelle « ${sentinelle} » a été retrouvée dans \`activity_log\`. La table\n` +
          'ne doit contenir NI adresse e-mail, NI nom, NI secret, NI fragment de charge\n' +
          'utile — ni dans `meta`, ni dans `ip`, ni ailleurs (note L2 §2.4, 06 §10.4).',
      ).toBe(false);
    }
  });
});

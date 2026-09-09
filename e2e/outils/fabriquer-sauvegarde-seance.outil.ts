// =============================================================================
// OUTIL A26 — FABRIQUE LE `.axionbackup` DE SÉANCE, PUIS LE RESTAURE POUR DE VRAI
//
// ── POURQUOI C'EST UN SEUL GESTE, ET PAS DEUX ───────────────────────────────
// « Un fichier qu'on n'a pas restauré n'est pas un fichier. » Produire le
// `.axionbackup` sans l'ouvrir donnerait exactement le défaut que
// `MotDePasseExportInvalideError` a été écrite pour fermer : un fichier
// parfaitement formé, annoncé « produit », et découvert inouvrable le jour où on
// en a besoin — ici, le matin de la séance, sur l'iPad de Williams.
//
// L'outil enchaîne donc, dans le même passage :
//   ① il FABRIQUE le fichier avec la crypto de production ;
//   ② il ouvre un navigateur réel sur la CIBLE (staging par défaut), crée un
//      coffre neuf par l'écran de première utilisation — Argon2id complète, pas
//      un raccourci — puis restaure le fichier par l'écran de restauration ;
//   ③ il va jusqu'à OUVRIR une session et COTER une question, parce que c'est
//      cela que la séance fera et que c'est cela qu'on prétend rendre jouable ;
//   ④ il n'écrit le fichier sur le disque QUE si tout ce qui précède a tenu.
//
// ── CE QUE CET OUTIL N'EST PAS ──────────────────────────────────────────────
// Ce n'est PAS un test de la suite : il ne porte pas le suffixe `.e2e.ts` que
// `playwright.config.ts` collecte (`testMatch`), il vit hors du chemin de la CI,
// et il ne s'exécute qu'à la main, avec sa propre configuration. La raison est
// simple : il vise un serveur de STAGING. Une suite d'intégration continue qui
// dépend d'un déploiement distant est une suite qui rougit pour des raisons qui
// ne regardent pas le code. Aucun test n'est skippé ni désactivé pour autant —
// ce fichier n'en a jamais été un.
//
// Il ne touche RIEN sur le serveur : tout se passe dans l'IndexedDB d'un profil
// de navigateur local, et la restauration est par construction hors réseau.
//
// ── ET IL N'ÉCRIT AUCUN CODE DE PRODUCTION (09 §5.6) ────────────────────────
// Si l'application refuse le fichier, c'est un DÉFAUT à rendre au producteur,
// pas une ligne d'`apps/field/src` à corriger ici.
//
// Usage :
//   pnpm build:packages
//   npx playwright test --config e2e/outils/playwright.seance.config.ts
//   (cible : `AXION_CIBLE`, sinon le staging ·
//    `AXION_SAUVEGARDE=<chemin>` rejoue l'épreuve sur un fichier déjà déposé,
//    au lieu d'en fabriquer un neuf — c'est ainsi que les octets LIVRÉS sont
//    ceux qui ont été ouverts.)
//
// Traçabilité : E38 (export de secours chiffré, création et restauration
// testées) · E6 (hors ligne total) · E44 (ancres de cotation visibles) ·
// E33 (sécurité / RGPD) · invariant 8 · 11 §4 · 11 §7 (la limite Playwright,
// rappelée au rapport).
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import {
  fabriquerSauvegardeSeance,
  MOT_DE_PASSE_SAUVEGARDE_SEANCE,
  REPERES_SEANCE,
  ANCRES_QUESTION_OUTIL,
} from './mission-seance.js';

/**
 * Le mot de passe du COFFRE de l'appareil d'épreuve — délibérément différent de
 * celui du fichier.
 *
 * C'est le cœur de la propriété qu'on vérifie ici : 11 §4 fait dériver la clé du
 * fichier du mot de passe UTILISATEUR, « PAS de la DEK appareil ». Si les deux
 * mots de passe étaient les mêmes, l'épreuve passerait sans rien prouver, et le
 * jour où Williams restaurerait sur son iPad — dont le mot de passe n'a aucune
 * raison d'être `SeanceAudit2026` — le fichier serait refusé.
 * Secret FACTICE (CLAUDE.md §2).
 */
const MOT_DE_PASSE_APPAREIL_EPREUVE = 'appareil-epreuve-a26';

/** Où le fichier est déposé une fois l'épreuve tenue. */
const DESTINATION = join(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  '..',
  'docs',
  'portes',
  'preuves',
  'P-C',
);

test('fabrique le .axionbackup de séance et le restaure sur un appareil neuf', async ({
  page,
}, informations) => {
  test.setTimeout(5 * 60_000);

  // ── ① LE FICHIER ─────────────────────────────────────────────────────────
  //
  // Par défaut on le FABRIQUE. Mais `AXION_SAUVEGARDE=<chemin>` fait rejouer
  // l'épreuve sur un fichier DÉJÀ DÉPOSÉ, et cette porte-là n'est pas un confort :
  // l'outil produit un fichier neuf à chaque passage (sel neuf, nonce neuf,
  // horodatage neuf). Prouver un fichier puis en livrer un autre reviendrait à
  // signer des octets qu'on n'a jamais ouverts. C'est par ce mode que le fichier
  // remis à Williams a été éprouvé, et c'est par lui qu'on le rejouera.
  const dejaDepose = process.env.AXION_SAUVEGARDE;
  const { fichier, nom } =
    dejaDepose === undefined
      ? await fabriquerSauvegardeSeance(MOT_DE_PASSE_SAUVEGARDE_SEANCE)
      : {
          fichier: JSON.parse(readFileSync(dejaDepose, 'utf8')) as Awaited<
            ReturnType<typeof fabriquerSauvegardeSeance>
          >['fichier'],
          nom: basename(dejaDepose),
        };
  const serialise =
    dejaDepose === undefined ? JSON.stringify(fichier) : readFileSync(dejaDepose, 'utf8');

  // L'en-tête est EN CLAIR : on vérifie ici, avant tout le reste, qu'il ne porte
  // aucune donnée personnelle et aucun texte de mission. C'est la règle jumelle
  // de la liste fermée du §3.2 — ce qui est en clair est choisi, pas subi.
  const enTeteSerialise = JSON.stringify(fichier.enTete);
  for (const sentinelle of [
    'Camille',
    'Berthier',
    'Dominique',
    'Anselme',
    REPERES_SEANCE.titre,
    REPERES_SEANCE.premiereQuestion,
  ]) {
    expect(enTeteSerialise).not.toContain(sentinelle);
  }

  // ── ② L'APPAREIL D'ÉPREUVE, dans l'ÉTAT EXACT de l'iPad de Williams ──────
  //
  // C'est-à-dire : coffre créé ET auditeur rattaché, mais AUCUNE mission — le
  // mur mesuré sur staging le 2026-09-09. Créer le coffre par l'écran suffirait
  // à restaurer, mais pas à COTER : sans identité d'auditeur, l'application
  // affiche « Cet appareil n'est rattaché à aucun auditeur · Aucun entretien ne
  // peut être ouvert tant qu'il n'a pas de propriétaire ». Éprouver le fichier
  // sur un appareil non rattaché reviendrait à s'arrêter juste avant la seule
  // chose que la séance doit faire.
  //
  // L'identité est posée comme le fait `appareil-terrain.ts` : coffre RÉEL monté
  // en Node (`creerCoffreNeuf`), identité chiffrée sous la DEK, rangée dans
  // `meta`. Le rattachement en ligne (`session/auditeur.ts`) écrit exactement
  // cela ; on n'a pas de compte de staging, et c'est précisément le blocage que
  // ce travail contourne.
  const cible = process.env.AXION_CIBLE ?? 'https://audit-staging.axion-ia.com/';
  await page.goto(cible);
  await expect(page.getByRole('heading', { name: 'Préparer cet appareil' })).toBeVisible({
    timeout: 60_000,
  });

  const sel = genererSel();
  const kek = await deriverKek(MOT_DE_PASSE_APPAREIL_EPREUVE, sel, PARAMETRES_KDF_DEFAUT);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);
  const identiteChiffree = await coffre.chiffrer({
    // ── L'IDENTITÉ EST DÉLIBÉRÉMENT ÉTRANGÈRE À LA FIXTURE ────────────────
    // `conductedBy` des sessions du fichier vaut l'auditeur de la FIXTURE ; le
    // compte rattaché sur l'iPad de Williams sera un autre UUID. Poser ici le
    // même identifiant ferait passer l'épreuve sans rien prouver du cas réel.
    // On prend donc le cas pessimiste — un propriétaire qui ne correspond pas —
    // et on va jusqu'à coter avec.
    id: '01920000-0004-7000-8000-0000000000a1',
    profil: 'guide_strict',
  });

  await page.evaluate(
    async (semences: { readonly cle: string; readonly valeur: unknown }[]) => {
      const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
        const demande = indexedDB.open('axion-terrain');
        demande.onsuccess = () => {
          resoudre(demande.result);
        };
        demande.onerror = () => {
          rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
        };
      });
      const transaction = base.transaction(['meta'], 'readwrite');
      for (const semence of semences) transaction.objectStore('meta').put(semence);
      await new Promise<void>((resoudre, rejeter) => {
        transaction.oncomplete = () => {
          resoudre();
        };
        transaction.onerror = () => {
          rejeter(transaction.error ?? new Error('transaction de semis refusée'));
        };
      });
      base.close();
    },
    [
      {
        cle: 'coffre',
        valeur: { sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT, dekEnveloppee },
      },
      { cle: 'appareil', valeur: '01920000-0004-7000-8000-0000000000ff' },
      { cle: 'appareil:libelle', valeur: 'Appareil d’épreuve A26' },
      { cle: 'auth:utilisateur', valeur: identiteChiffree },
    ],
  );
  await page.reload();

  // Le déverrouillage passe par le chemin de PRODUCTION : Argon2id dans le
  // navigateur, DEK désenveloppée par WebCrypto. Aucun raccourci.
  const titreDeverrouillage = page.getByRole('heading', { name: 'Déverrouiller la collecte' });
  await expect(titreDeverrouillage).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/^Mot de passe/).fill(MOT_DE_PASSE_APPAREIL_EPREUVE);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(titreDeverrouillage).toBeHidden({ timeout: 120_000 });

  // L'appareil est dans l'état de départ de la séance : rattaché, sans mission.
  await expect(page.getByText('Aucune mission sur cet appareil').first()).toBeVisible({
    timeout: 60_000,
  });

  // ── ③ LA RESTAURATION, par l'écran ───────────────────────────────────────
  await page.getByRole('button', { name: 'Restaurer une sauvegarde de secours' }).click();
  // Deux `<h1>` portent ce texte sur cet écran — celui de la coquille et celui
  // du contenu. On vise le contenu ; le doublon est REMONTÉ au rapport, pas
  // corrigé ici (09 §5.6).
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Restaurer une sauvegarde' }),
  ).toBeVisible();

  await page.getByLabel('Fichier de sauvegarde').setInputFiles({
    name: nom,
    mimeType: 'application/json',
    buffer: Buffer.from(serialise, 'utf8'),
  });
  await page
    .getByLabel('Mot de passe de l’appareil qui a produit la sauvegarde')
    .fill(MOT_DE_PASSE_SAUVEGARDE_SEANCE);
  await page.getByRole('button', { name: 'Restaurer sur cet appareil' }).click();

  // La restauration peut demander la persistance ; sur un navigateur de test elle
  // n'est pas toujours accordée, et l'écran ouvre alors la reprise explicite de
  // D-A27-1. On la prend, comme le ferait un auditeur qui a lu le guidage —
  // l'iPad de Williams, PWA installée, sera dans le cas nominal.
  const repriseSansGarantie = page.getByRole('button', {
    name: 'Restaurer quand même, sans garantie de conservation',
  });
  const succes = page.getByText('Sauvegarde restaurée');
  await expect(succes.or(repriseSansGarantie)).toBeVisible({ timeout: 120_000 });
  if (await repriseSansGarantie.isVisible()) {
    await repriseSansGarantie.click();
  }
  await expect(succes).toBeVisible({ timeout: 120_000 });

  // Ce que l'écran DIT du fichier — la lecture de V-7.6, jouée ici en avance.
  await expect(page.getByText(REPERES_SEANCE.titre)).toBeVisible();
  await expect(page.getByText('Fixture de séance P-C (A26)')).toBeVisible();

  // ── ④ LA JOURNÉE : une mission, un agenda, une session planifiée ─────────
  await page.getByRole('button', { name: 'Ouvrir ma journée' }).click();
  await expect(page.getByText(REPERES_SEANCE.titre).first()).toBeVisible({ timeout: 60_000 });
  // Le cockpit porte les trois données du §34.2 — c'est ce que V-2.4 fait lire.
  await expect(page.getByText('Vos sessions du jour')).toBeVisible();
  await expect(page.getByText('1 point(s) à revoir').first()).toBeVisible();
  await expect(page.getByText('Reprendre là où vous vous êtes arrêté')).toBeVisible();

  // ── ⑤ UN SEUL TAP SUR LA SESSION PLANIFIÉE (V-4.1) ───────────────────────
  await page
    .getByRole('button', { name: /Camille Berthier/ })
    .first()
    .click();
  await expect(page.getByText('Responsable d’atelier')).toBeVisible({ timeout: 30_000 });
  // Pré-remplie : la personne, sa fonction et son unité viennent du fichier.
  await expect(page.getByText(REPERES_SEANCE.uniteCanonique).first()).toBeVisible();
  // Les trois blocs du questionnaire figé, en zone gauche (03 M3.1, V-4.2).
  for (const bloc of ['B1', 'B2', 'B3']) {
    await expect(page.getByText(bloc, { exact: true }).first()).toBeVisible();
  }

  // ── ⑥ L'ACCORD DE PARTICIPATION, puis le démarrage (06 §10.4) ────────────
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

  // ── ⑦ COTER POUR DE VRAI, sur la question à ancres ───────────────────────
  await page
    .getByRole('button', { name: new RegExp(REPERES_SEANCE.questionEchelleAncree) })
    .click();
  await expect(page.getByText(REPERES_SEANCE.questionEchelleAncree).first()).toBeVisible();

  // Les ancres §32.4 sont peintes SANS aucun geste, lues dans la guidance figée
  // du fichier. C'est la matière de V-5.1 et V-5.2 : sans elles, la séance
  // regarderait un écran vide et le prendrait pour un écran qui fonctionne.
  const cotation = page.getByRole('group', { name: 'Votre cotation' });
  await expect(cotation).toBeVisible();
  for (const ancre of ANCRES_QUESTION_OUTIL.ancres) {
    await expect(
      cotation.getByText(ancre.libelle, { exact: false }),
      `l’ancre ${String(ancre.niveau)} doit être lisible sans aucun geste`,
    ).toBeVisible();
  }
  await expect(cotation.locator('input[type="radio"]:checked')).toHaveCount(0);

  // Le geste : on tape le LIBELLÉ, pas l'input — le radio est masqué
  // visuellement (recouvrement accessible), et c'est la pastille que le doigt de
  // l'auditeur atteint.
  await cotation
    .locator('.axn-choix__option')
    .filter({ has: page.locator('input[value="4"]') })
    .click();
  await expect(cotation.locator('input[value="4"]')).toBeChecked();

  // L'écriture a abouti ET a été relue : la ligne est dans IndexedDB, chiffrée
  // sous la DEK de CET appareil. Un affichage peut mentir, une ligne écrite, non.
  await expect
    .poll(
      async () =>
        page.evaluate(
          async () =>
            new Promise<number>((resoudre, rejeter) => {
              const demande = indexedDB.open('axion-terrain');
              demande.onsuccess = () => {
                const base = demande.result;
                const compte = base.transaction('answers').objectStore('answers').count();
                compte.onsuccess = () => {
                  base.close();
                  resoudre(compte.result);
                };
                compte.onerror = () => {
                  rejeter(compte.error ?? new Error('lecture locale refusée'));
                };
              };
              demande.onerror = () => {
                rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
              };
            }),
        ),
      { message: 'la cotation doit être une ligne locale de plus', timeout: 20_000 },
    )
    .toBe(7);

  // ── ⑧ LA QUESTION SANS ANCRE — le support de V-5.5 est EMBARQUÉ ─────────
  //
  // Elle est dans le questionnaire figé, à sa place, en 4ᵉ position du bloc B3.
  // `toBeAttached` et non `toBeVisible`, et la nuance est un FAIT mesuré le
  // 2026-09-09 : seul le bloc COURANT est déplié dans la zone de progression ;
  // les questions des autres blocs sont dans le DOM et masquées. Atteindre
  // celle-ci demande donc de déplier B3 — un tap, et c'est le geste de la séance,
  // pas celui de l'outil. Ce que l'outil doit garantir, c'est que la matière de
  // V-5.5 est DANS le fichier ; l'assertion le dit exactement, sans prétendre
  // avoir joué V-5.5.
  await expect(
    page.getByText(REPERES_SEANCE.questionEchelleSansAncre, { exact: false }).first(),
  ).toBeAttached();

  // ── ⑨ LE COMPTE DES LIGNES ÉCRITES, relu dans IndexedDB ─────────────────
  // Sept réponses : les six que le fichier apportait, plus celle que l'outil
  // vient de coter par l'écran. Toutes chiffrées sous la DEK de CET appareil,
  // qui n'a jamais vu le mot de passe du fichier.
  const lignes = await page.evaluate(async () => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = () => {
        resoudre(demande.result);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
      };
    });
    const compter = async (table: string): Promise<number> =>
      new Promise<number>((resoudre, rejeter) => {
        const demande = base.transaction(table).objectStore(table).count();
        demande.onsuccess = () => {
          resoudre(demande.result);
        };
        demande.onerror = () => {
          rejeter(demande.error ?? new Error('lecture locale refusée'));
        };
      });
    const compte = {
      missions: await compter('missions'),
      missionQuestions: await compter('missionQuestions'),
      orgUnits: await compter('orgUnits'),
      interviews: await compter('interviews'),
      answers: await compter('answers'),
    };
    base.close();
    return compte;
  });

  // ── LA FENÊTRE DE VALIDITÉ DE L'AGENDA, LUE DANS LES LIGNES RESTAURÉES ──
  // `scheduledAt` est un index EN CLAIR (liste fermée du §3.2) : on le lit sans
  // DEK et sans déchiffrer quoi que ce soit. Ce que ce relevé dit à l'opérateur
  // est la seule chose qu'un fichier figé ne peut pas dire de lui-même — jusqu'à
  // QUAND il porte une journée. Passé cette date, « Aujourd'hui » sera vide de
  // sessions planifiées, et V-0.7 échouerait pour une raison qui n'a rien à voir
  // avec l'application.
  const creneaux = await page.evaluate(
    async () =>
      new Promise<string[]>((resoudre, rejeter) => {
        const demande = indexedDB.open('axion-terrain');
        demande.onsuccess = () => {
          const base = demande.result;
          const tout = base.transaction('interviews').objectStore('interviews').getAll();
          tout.onsuccess = () => {
            base.close();
            resoudre(
              (tout.result as { scheduledAt: string | null }[])
                .map((ligne) => ligne.scheduledAt)
                .filter((instant): instant is string => instant !== null)
                .sort(),
            );
          };
          tout.onerror = () => {
            rejeter(tout.error ?? new Error('lecture locale refusée'));
          };
        };
        demande.onerror = () => {
          rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
        };
      }),
  );
  const enJourDeMission = (instant: string): string =>
    new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(instant));
  const derniereJournee = enJourDeMission(creneaux[creneaux.length - 1] ?? '');

  expect(lignes.missions).toBe(1);
  expect(lignes.missionQuestions).toBe(REPERES_SEANCE.questions);
  expect(lignes.orgUnits).toBe(REPERES_SEANCE.unites);
  expect(lignes.interviews).toBeGreaterThanOrEqual(3);
  expect(lignes.answers).toBe(7);

  // ── ⑩ LE DÉPÔT, seulement maintenant ────────────────────────────────────
  mkdirSync(DESTINATION, { recursive: true });
  const chemin = join(DESTINATION, nom);
  writeFileSync(chemin, serialise, 'utf8');

  await informations.attach('sauvegarde-de-seance', {
    path: chemin,
    contentType: 'application/json',
  });

  // ── LE COMPTE RENDU À L'OPÉRATEUR ────────────────────────────────────────
  // `process.stdout.write` et non `console` : `no-console` existe pour empêcher
  // les traces de mise au point de traîner dans du code d'application. Ici, la
  // sortie standard EST le livrable — un outil de ligne de commande rend son
  // résultat par là, et le contourner par un `eslint-disable` reviendrait à
  // désarmer une règle utile pour un cas qu'elle ne vise pas.
  // Le même texte part en pièce jointe du rapport, pour qu'il survive à la
  // fermeture du terminal.
  const compteRendu = [
    '',
    '─── SAUVEGARDE DE SÉANCE PRODUITE ET RESTAURÉE ───',
    `fichier           : ${chemin}`,
    `mot de passe      : ${MOT_DE_PASSE_SAUVEGARDE_SEANCE}`,
    `mission           : ${REPERES_SEANCE.titre}`,
    `unités            : ${String(REPERES_SEANCE.unites)}`,
    `questions figées  : ${String(REPERES_SEANCE.questions)}`,
    `question ancrée   : ${REPERES_SEANCE.questionEchelleAncree}`,
    `ancres            : ${ANCRES_QUESTION_OUTIL.ancres.map((ancre) => String(ancre.niveau)).join(', ')}`,
    `sans ancre (V-5.5): ${REPERES_SEANCE.questionEchelleSansAncre}`,
    `agenda jusqu’au   : ${derniereJournee} (fuseau de mission) — au-delà,`,
    '                    « Aujourd’hui » n’aura plus de session planifiée :',
    '                    refabriquer le fichier, ce n’est pas un défaut de l’app.',
    '',
  ].join('\n');
  process.stdout.write(`${compteRendu}\n`);
  await informations.attach('compte-rendu', { body: compteRendu, contentType: 'text/plain' });
});

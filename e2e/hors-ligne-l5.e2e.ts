// =============================================================================
// E2E — LE MODE AVION DU LOT L5 : quatre critères du 07, ligne L5, éprouvés dans
// un navigateur réel, réseau coupé.
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// Le contrôle d'acceptation A02 du 2026-09-06 (§4) refuse quatre critères pour
// une seule raison, et il la mesure : `grep -rn "setOffline" e2e/` ne rendait
// AUCUNE occurrence. `docs/conception/LOT_L5.md` §4 les planifiait pourtant
// comme `@critique` — « mode avion intégral (`context.setOffline(true)`) […]
// kill de l'onglet en pleine saisie = zéro perte […] export de secours créé puis
// restauré sur un 2ᵉ profil navigateur ». Ils n'avaient pas été écrits.
//
// Les quatre critères, mot pour mot du 07 :
//   ② mode avion complet sur iPad ET PC ;
//   ③ 1 session de CHAQUE type créée hors ligne (les six `kind`) ;
//   ④ coupure de courant en pleine saisie = zéro perte ;
//   ⑤ export de secours créé puis restauré (07 §13 : sur un 2ᵉ profil navigateur).
//
// ── LA LIMITE, ÉCRITE ICI PLUTÔT QUE DÉCOUVERTE À LA PORTE (11 §7) ──────────
// `context.setOffline(true)` coupe la pile réseau du contexte : c'est un vrai
// mode avion pour tout ce qui traverse le réseau, et le service worker sert
// réellement le shell depuis son précache. **Ce n'est PAS un iPad.** Le moteur
// est Chromium dans les deux cas ; l'émulation « iPad » ne change que la taille,
// le pointeur, le tactile et l'agent utilisateur. Les service workers sous iOS,
// la persistance d'IndexedDB en PWA installée et le démarrage à froid hors
// réseau ne sont couverts par AUCUN de ces tests : ils se rejouent À LA MAIN sur
// tablette aux portes P-C et P-E (checklist 07 §15, A27 et A54). Cette phrase
// est la limite assumée du 11 §7 ; elle n'est pas contournée, elle est nommée.
//
// De même pour ④ : ce qui est simulé ici est la MORT BRUTALE DE L'ONGLET
// (`Page.crash` par CDP — aucun `beforeunload`, aucune chance de vider quoi que
// ce soit), puis la fermeture et la RÉOUVERTURE du profil sur disque. Ce qui
// n'est PAS simulé, et qui ne peut pas l'être ici : la coupure d'ALIMENTATION
// d'une vraie machine, où le cache d'écriture du système peut perdre ce que le
// navigateur croyait écrit. Le pack dit « coupure de courant » ; seule une
// machine réelle la dit vraiment.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E38 (sauvegarde terrain :
// sync ≥ 1×/j + export de secours), E33 (sécurité / RGPD), E23 (hyper intuitif,
// novice < 30 min).
// =============================================================================
import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  ANCRES_ECHELLE_FIL_TPE,
  CONSIGNE_ECHELLE_FIL_TPE,
  deverrouillerAppareil,
  GUIDANCE_ECHELLE_FIL_TPE,
  lireTableLocale,
  MISSION_FIL_TPE,
  MOT_DE_PASSE_APPAREIL,
  MOT_DE_PASSE_SECOND_APPAREIL,
  ouvrirProfilSurDisque,
  planterAppareil,
  preparerAppareilNeuf,
  PREMIERE_QUESTION,
  QUESTION_ECHELLE,
  semerAppareil,
  URL_TERRAIN,
} from './fixtures/appareil-terrain.js';
// L'instrument de mesure du champ de vision (N1). Il vit dans `fixtures/` parce
// qu'il ne porte AUCUNE assertion propre à cet écran : il répond à la question
// « ce nœud est-il dans le champ de vision ? », que toute vue terrain se pose.
import {
  chercherCoVisibilite,
  decrireCoVisibilite,
  decrireMesure,
  mesurerChampDeVision,
  TOLERANCE_PX,
} from './fixtures/champ-de-vision.js';
// Le parseur du PACK, importé tel quel : c'est lui qui juge la guidance à
// l'import comme à l'écran. Une seconde lecture écrite dans le test dirait un
// jour autre chose que lui, et c'est le test qui aurait tort sans le savoir.
// `@axion/shared` n'étant pas une dépendance de la racine (voir l'en-tête de
// `scripts/check-fixtures-contrat.mjs`), on l'atteint par son chemin, comme la
// fixture atteint déjà la crypto de `apps/field`.
import { ANCRES_REQUISES, lireAncresDeCotation } from '../packages/shared/src/banque-questions.js';

/**
 * Les options que `browser.newContext()` n'hérite PAS de `playwright.config.ts`.
 *
 * `use:` s'applique aux fixtures `page`/`context` de Playwright, jamais à un
 * contexte ouvert à la main. Sans ces deux lignes, les tests tourneraient en
 * anglais et en UTC — donc sur une autre application que celle de la config, et
 * « aujourd'hui » ne serait pas le même jour que le fuseau de la mission.
 */
const OPTIONS_COMMUNES = {
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  acceptDownloads: true,
} as const;

/**
 * Les deux appareils du critère ② — « iPad ET PC ».
 *
 * L'iPad est une ÉMULATION Chromium : taille, tactile, pointeur grossier, agent
 * utilisateur. Elle attrape ce qu'une mise en page attrape (cibles trop petites,
 * défilement horizontal, panneaux repliés) et rien de ce qui tient au moteur.
 * Voir la limite en tête de fichier.
 */
const APPAREILS = [
  { nom: 'PC', options: { viewport: { width: 1440, height: 900 } } },
  { nom: 'iPad émulé (paysage)', options: devices['iPad (gen 7) landscape'] },
] as const;

/** Les six types de session du 03 §27.1, avec le libellé que l'écran affiche. */
const SIX_TYPES = [
  'Entretien',
  'Observation de poste',
  'Démonstration d’outil',
  'Analyse documentaire',
  'Relevé de données',
  'Atelier collectif',
] as const;

/** Le titre de la vue courante, porté par la coquille — une seule occurrence. */
function titreDeVue(page: Page) {
  return page.locator('.axn-coquille__titre');
}

/**
 * Un créneau d'aujourd'hui, au format d'un `<input type="datetime-local">`.
 *
 * L'heure est FIXE et non « maintenant » : une session planifiée à 23 h 50 un
 * soir de novembre tomberait le lendemain au fuseau de la mission, et la suite
 * deviendrait rouge une fois par jour sans qu'une ligne ait changé.
 */
function creneauDuJour(heure: number): string {
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  return `${jour}T${String(heure).padStart(2, '0')}:00`;
}

/**
 * Coupe le réseau, redémarre l'application À FROID dessus, et vérifie que la
 * coupure est réelle.
 *
 * ── L'ORDRE, ET POURQUOI IL N'EST PAS INDIFFÉRENT ──────────────────────────
 * Le service worker doit être ACTIF et CONTRÔLER la page avant qu'on coupe :
 * sinon le rechargement suivant ne trouve personne pour servir le shell, et
 * l'échec parlerait de l'ordre du test, pas de l'application. Le rechargement
 * qui suit la coupure est le vrai sujet du critère ② — c'est un démarrage à
 * froid, sans réseau, servi par le précache.
 *
 * ── UN DÉFAUT DE L'ÉMULATION, MESURÉ ET CONTOURNÉ EN LE DISANT ─────────────
 * Mesuré le 2026-09-06 : après `setOffline(true)`, `navigator.onLine` vaut bien
 * `false` — mais il REPASSE À `true` dans le document neuf créé par le
 * rechargement, alors que le réseau reste coupé (`fetch` échoue). C'est un
 * artefact de `Network.emulateNetworkConditions`, pas un comportement de
 * l'application : sur un appareil réellement en mode avion, le drapeau est
 * `false` au démarrage à froid. Réappliquer la coupure le remet en place sans
 * toucher au document.
 *
 * Les DEUX contrôles sont faits ensuite, et c'est délibéré : le drapeau, parce
 * que c'est lui que l'interface lit (`session/media.ts`), et une requête réelle,
 * parce qu'un drapeau peut mentir. Si `setOffline` n'avait pas pris, tout ce qui
 * suit serait vert pour la mauvaise raison — le pire résultat qu'un test hors
 * ligne puisse produire.
 */
async function passerEnModeAvion(contexte: BrowserContext, page: Page): Promise<void> {
  // ── DEUX PIÈGES MESURÉS ICI, ET LEUR TRACE ────────────────────────────────
  // ① `evaluate(() => navigator.serviceWorker.ready)` n'a AUCUNE limite de
  //    temps : un service worker qui ne s'active pas suspend le test jusqu'au
  //    délai global, et la seule information rendue est « test timeout ».
  // ② `waitForFunction` avec une fonction ASYNCHRONE rend VRAI immédiatement —
  //    la promesse elle-même est une valeur vraie. Le test passait alors la
  //    coupure avant que le worker soit activé, et échouait trois lignes plus
  //    loin sur un symptôme sans rapport. `expect.poll` attend, lui, la valeur.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const inscriptions = await navigator.serviceWorker.getRegistrations();
          return inscriptions.some((i) => i.active?.state === 'activated');
        }),
      {
        message: 'le service worker doit être ACTIVÉ avant qu’on coupe le réseau',
        timeout: 60_000,
      },
    )
    .toBe(true);

  // Le rechargement fait passer la page sous le contrôle du worker actif : sans
  // `clients.claim()` — délibérément absent (`sw/service-worker.ts` : aucune
  // activation automatique en pleine session) — c'est la seule façon.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 60_000,
  });

  await contexte.setOffline(true);
  await page.reload();
  await contexte.setOffline(false);
  await contexte.setOffline(true);

  expect(
    await page.evaluate(() => navigator.onLine),
    'le drapeau que lit l’interface doit dire « hors ligne »',
  ).toBe(false);
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`/sonde-hors-ligne-${String(Date.now())}`, { cache: 'no-store' });
        return 'le réseau répond encore';
      } catch {
        return 'coupé';
      }
    }),
    'une requête réelle doit échouer : le drapeau seul ne prouve rien',
  ).toBe('coupé');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② MODE AVION COMPLET, SUR LES DEUX APPAREILS
// ─────────────────────────────────────────────────────────────────────────────
for (const appareil of APPAREILS) {
  test(`@critique mode avion — l’application démarre et reste utilisable réseau coupé (${appareil.nom})`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const contexte = await browser.newContext({ ...OPTIONS_COMMUNES, ...appareil.options });
    const page = await contexte.newPage();

    // Ce qui sort du domaine servi est noté DÈS l'ouverture : le mode avion ne
    // vaut que si l'application ne dépendait de rien d'extérieur AVANT la
    // coupure (11 §1 : police auto-hébergée, aucun CDN).
    const externes: string[] = [];
    page.on('request', (requete) => {
      const hote = new URL(requete.url()).hostname;
      if (hote !== '127.0.0.1' && hote !== 'localhost') externes.push(requete.url());
    });
    const pannes: string[] = [];
    page.on('pageerror', (erreur) => pannes.push(erreur.message));

    await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
    await passerEnModeAvion(contexte, page);

    // ── Le coffre s'ouvre SANS réseau : Argon2id et WebCrypto sont locaux ──
    await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

    // La règle de vue initiale fait atterrir sur le cockpit quand une mission
    // est présente sur l'appareil (arbitrage A01, 2026-09-05).
    await expect(titreDeVue(page)).toHaveText('Aujourd’hui');
    await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();

    // ── Tous les écrans de la journée, atteints au doigt, réseau coupé ─────
    await page.getByRole('button', { name: /l’agenda/ }).click();
    await expect(titreDeVue(page)).toHaveText('Agenda');
    await expect(
      page.getByRole('heading', { name: 'Planifier une session de collecte' }),
    ).toBeVisible();
    // L'unité descendue du siège est LISIBLE : la charge chiffrée a bien été
    // ouverte hors ligne, ce qu'aucun contrôle de titre ne prouverait.
    await expect(page.getByLabel('Unité')).toHaveText(new RegExp(MISSION_FIL_TPE.unite));

    await page.getByRole('button', { name: 'Retour' }).click();
    await page.getByRole('button', { name: 'Où en est cette mission ?' }).click();
    await expect(titreDeVue(page)).toHaveText('Où en est la mission');

    await page.getByRole('button', { name: 'Retour' }).click();
    await page.getByRole('button', { name: 'Fin de journée', exact: true }).click();
    await expect(titreDeVue(page)).toHaveText('Fin de journée');
    await expect(page.getByRole('heading', { name: 'Sauvegarde de secours' })).toBeVisible();

    await page.getByRole('button', { name: 'Revenir' }).click();
    await page.getByRole('button', { name: 'Missions et stockage de l’appareil' }).click();
    await expect(titreDeVue(page)).toHaveText('Aujourd’hui');
    await expect(page.getByRole('button', { name: 'Nouvel entretien' })).toBeVisible();

    await page.getByRole('button', { name: 'Restaurer une sauvegarde de secours' }).click();
    await expect(titreDeVue(page)).toHaveText('Restaurer une sauvegarde');
    // 03 §33.2 : le hors ligne est un ÉTAT d'écran, et il est NOMINAL — il se dit
    // comme une capacité, jamais comme une panne.
    await expect(
      page.getByText('Restaurer une sauvegarde de secours, intégralement sans réseau'),
    ).toBeVisible();

    expect(
      pannes,
      `erreurs JavaScript pendant le parcours hors ligne : ${pannes.join(' · ')}`,
    ).toEqual([]);
    expect(externes, `requêtes sortantes détectées : ${externes.join(', ')}`).toEqual([]);

    await contexte.close();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ UNE SESSION DE CHACUN DES SIX TYPES, CRÉÉE HORS LIGNE
// ─────────────────────────────────────────────────────────────────────────────
test('@critique hors ligne — une session de CHACUN des six types se crée sans réseau', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const contexte = await browser.newContext({
    ...OPTIONS_COMMUNES,
    viewport: { width: 1440, height: 900 },
  });
  const page = await contexte.newPage();

  await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
  await passerEnModeAvion(contexte, page);
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  await page.getByRole('button', { name: /l’agenda/ }).click();
  await expect(titreDeVue(page)).toHaveText('Agenda');

  for (const [rang, type] of SIX_TYPES.entries()) {
    await page.getByLabel('Type de session').selectOption({ label: type });

    if (type === 'Atelier collectif') {
      // 03 §28.1-3 : un atelier sans participant est refusé par le domaine, et
      // c'est voulu. Le champ est un `textarea` — un par ligne.
      await page
        .getByLabel('Participants')
        .fill('Anne Dupuis — chef d’atelier\nMarc Vidal — régleur');
    } else {
      await page.getByLabel('Nom de l’interlocuteur').fill(`Interlocuteur ${String(rang + 1)}`);
      await page.getByLabel('Fonction').fill('Fonction d’essai');
    }

    // Des créneaux distincts : le chevauchement est un AVERTISSEMENT et ne
    // bloque rien (03 §25.2), mais un test ne doit pas éprouver deux choses.
    await page.getByLabel('Créneau').fill(creneauDuJour(8 + rang));
    await page.getByRole('button', { name: 'Planifier' }).click();

    // La vérité est la LIGNE ÉCRITE, pas le message affiché : un écran peut
    // annoncer un enregistrement qui n'a pas eu lieu — c'est très exactement la
    // famille de défaut que ce dépôt traque.
    await expect
      .poll(async () => (await lireTableLocale(page, 'interviews')).length, {
        message: `la session « ${type} » n’a pas été écrite dans IndexedDB`,
        timeout: 15_000,
      })
      .toBe(rang + 1);
  }

  const sessions = await lireTableLocale(page, 'interviews');
  expect(sessions.map((ligne) => ligne.kind).sort(), 'les six `kind` du 03 §27.1').toEqual(
    [
      'analyse_documentaire',
      'atelier',
      'demonstration',
      'entretien',
      'observation',
      'releve_donnees',
    ].sort(),
  );

  // Chaque session est aussi une opération en file : l'`outbox` est la SEULE
  // file (LOT_L5.md §3.3), et elle est vraie par construction. Sans elle, six
  // sessions créées hors ligne ne remonteraient jamais.
  const file = await lireTableLocale(page, 'outbox');
  expect(
    file.filter((op) => op.entite === 'interview').length,
    'une opération d’outbox par session créée hors ligne',
  ).toBe(6);

  // Le mode n'existe QUE pour l'entretien (03 §32.6-1) : on le vérifie sur
  // l'index en clair, sans jamais déchiffrer une charge.
  expect(
    sessions.every((ligne) => ligne.status === 'non_demarre'),
    'une session naît « non_demarre » — terminer et valider sont d’autres gestes',
  ).toBe(true);

  await contexte.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// ④ COUPURE BRUTALE EN PLEINE SAISIE — ZÉRO PERTE
// ─────────────────────────────────────────────────────────────────────────────
test('@critique coupure brutale en pleine saisie — la réponse en cours survit à la mort de l’onglet', async () => {
  test.setTimeout(240_000);

  // Un PROFIL SUR DISQUE (voir `ouvrirProfilSurDisque`) : le critère porte sur
  // ce qui reste quand la machine repart, et un contexte éphémère détruit son
  // stockage à la fermeture — il « prouverait » la perte par la mécanique du
  // test. Le dossier est nommé ici pour être réouvert à l'identique.
  const NOM_PROFIL = 'profil-terrain-coupure';
  const options = { ...OPTIONS_COMMUNES, viewport: { width: 1440, height: 900 } };

  let { contexte, page } = await ouvrirProfilSurDisque(NOM_PROFIL, options, 'neuf');

  await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
  await passerEnModeAvion(contexte, page);
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  // ── Une session d'entretien, planifiée aujourd'hui, hors ligne ──────────
  await page.getByRole('button', { name: /l’agenda/ }).click();
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur brutal');
  await page.getByLabel('Fonction').fill('Responsable production');
  await page.getByLabel('Créneau').fill(creneauDuJour(9));
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect(page.getByText('Session planifiée.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();

  // ── Démarrage : l'accord de participation est un préalable (03 M3.2) ────
  await expect(titreDeVue(page)).toHaveText('Aujourd’hui');
  await page.getByRole('button', { name: /Interlocuteur brutal/ }).click();
  await expect(titreDeVue(page)).toHaveText('Entretien');
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
  await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();

  // ── LA SAISIE ───────────────────────────────────────────────────────────
  const REPONSE =
    'La commande arrive par téléphone, elle est notée sur un carnet, puis ressaisie le soir.';
  await page.getByLabel('Votre réponse').fill(REPONSE);

  // On attend LA LIGNE, pas l'indicateur — et la nuance a été mesurée.
  // « Enregistré à HH:mm » reste affiché depuis l'écriture PRÉCÉDENTE (le
  // démarrage de la session) pendant les ~300 ms de temporisation
  // (`DELAI_DEBOUNCE_MS`) : s'y fier ferait passer le test avant que la réponse
  // existe, et un jour il passerait alors qu'elle n'existerait plus.
  await expect
    .poll(async () => (await lireTableLocale(page, 'answers')).length, {
      message: 'la réponse doit être une ligne locale AVANT la coupure',
      timeout: 20_000,
    })
    .toBe(1);
  // L'indicateur est vérifié ensuite, quand il ne peut plus parler d'autre chose
  // (03 §33.3 : « micro-indicateur Enregistré : la confiance se voit »).
  await expect(page.getByText(/Enregistré à/)).toBeVisible({ timeout: 15_000 });

  // ── LA COUPURE ──────────────────────────────────────────────────────────
  // `Page.crash` tue le processus de rendu : aucun `beforeunload`, aucun vidage
  // de tampon, aucune chance donnée à l'application de se rattraper. C'est la
  // mort de l'ONGLET. La fermeture puis la réouverture du profil qui suivent
  // éprouvent la durabilité SUR DISQUE.
  //
  // Ce qui N'EST PAS éprouvé ici, et ne peut pas l'être avec Playwright : la
  // coupure d'ALIMENTATION de la machine, où le cache d'écriture du système
  // peut perdre ce que le navigateur croyait posé. Le 07 dit « coupure de
  // courant » ; cette moitié-là est due à une machine réelle (11 §7, P-C/P-E).
  const cdp = await contexte.newCDPSession(page);
  const mort = page.waitForEvent('crash');
  // `Page.crash` ne rend jamais la main : la cible meurt avant de répondre. On
  // attend donc l'ÉVÉNEMENT de mort, pas l'accusé de réception d'un mort.
  void cdp.send('Page.crash').catch(() => undefined);
  await mort;
  await contexte.close();

  // ── LE REDÉMARRAGE, SUR LE MÊME PROFIL ──────────────────────────────────
  ({ contexte, page } = await ouvrirProfilSurDisque(NOM_PROFIL, options, 'tel_quel'));
  await contexte.setOffline(true);
  await page.goto(URL_TERRAIN);

  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  // 03 §17.4 : « rouvrir l'app = revenir exactement à la question en cours ».
  // Servie par la PERSISTANCE (`meta.vueCourante`), jamais par une URL — donc
  // elle doit survivre à une mort brutale, sinon elle ne sert à rien le seul
  // jour où on en a besoin.
  await expect(titreDeVue(page)).toHaveText('Entretien');
  await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();

  // Zéro perte, et la preuve est la valeur RELUE À L'ÉCRAN : une ligne présente
  // dans IndexedDB dont l'écran ne saurait plus rien serait une demi-garantie.
  await expect(page.getByLabel('Votre réponse')).toHaveValue(REPONSE, { timeout: 20_000 });
  await expect(page.getByText('1 / 3 répondue(s)')).toBeVisible();
  expect(
    (await lireTableLocale(page, 'answers')).length,
    'ni doublon ni disparition après la coupure',
  ).toBe(1);

  await contexte.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ EXPORT DE SECOURS CRÉÉ, PUIS RESTAURÉ SUR UN SECOND PROFIL NAVIGATEUR
// ─────────────────────────────────────────────────────────────────────────────
test('@critique export de secours produit hors ligne, puis restauré sur un SECOND profil navigateur', async () => {
  test.setTimeout(240_000);
  const options = { ...OPTIONS_COMMUNES, viewport: { width: 1440, height: 900 } };

  // ── APPAREIL D'ORIGINE ──────────────────────────────────────────────────
  const { contexte: origine, page: pageOrigine } = await ouvrirProfilSurDisque(
    'profil-appareil-origine',
    options,
  );

  await planterAppareil(pageOrigine, await semerAppareil(MOT_DE_PASSE_APPAREIL));
  await passerEnModeAvion(origine, pageOrigine);
  await deverrouillerAppareil(pageOrigine, MOT_DE_PASSE_APPAREIL);

  // Une session planifiée : sans elle, la sauvegarde ne contiendrait que ce que
  // le siège avait déjà, et la restauration ne prouverait rien du TRAVAIL.
  await pageOrigine.getByRole('button', { name: /l’agenda/ }).click();
  await pageOrigine.getByLabel('Type de session').selectOption({ label: 'Observation de poste' });
  await pageOrigine.getByLabel('Nom de l’interlocuteur').fill('Poste de débit');
  await pageOrigine.getByLabel('Créneau').fill(creneauDuJour(10));
  await pageOrigine.getByRole('button', { name: 'Planifier' }).click();
  await expect(pageOrigine.getByText('Session planifiée.')).toBeVisible();
  await pageOrigine.getByRole('button', { name: 'Retour' }).click();

  // ── LE RITUEL DU SOIR — un geste, sans réseau (03 §34.2, invariant 8) ───
  await pageOrigine.getByRole('button', { name: 'Fin de journée', exact: true }).click();
  await expect(titreDeVue(pageOrigine)).toHaveText('Fin de journée');
  await pageOrigine.getByLabel('Votre mot de passe').fill(MOT_DE_PASSE_APPAREIL);

  const attenteFichier = pageOrigine.waitForEvent('download');
  await pageOrigine.getByRole('button', { name: 'Terminer la journée' }).click();
  const telechargement = await attenteFichier;
  const chemin = test.info().outputPath('sauvegarde-fil-tpe.axionbackup');
  await telechargement.saveAs(chemin);

  expect(
    telechargement.suggestedFilename(),
    'le nom de fichier ne porte ni nom de client ni donnée personnelle (invariant 2)',
  ).toMatch(/^axion-[0-9a-f-]{36}-\d{8}T\d{6}Z\.axionbackup$/);
  await expect(pageOrigine.getByText(/Sauvegarde chiffrée produite/)).toBeVisible();

  await origine.close();

  // ── APPAREIL DE REMPLACEMENT — SECOND PROFIL NAVIGATEUR, VIERGE ─────────
  // Un second profil sur disque, dans un autre dossier : ni cookie, ni
  // IndexedDB, ni service worker, ni coffre en commun. C'est le « 2ᵉ profil
  // navigateur » du 07 §13, et c'est la seule façon d'éprouver que la clé du
  // fichier ne doit RIEN à la DEK de l'appareil d'origine (11 §4).
  const { contexte: secours, page: pageSecours } = await ouvrirProfilSurDisque(
    'profil-appareil-secours',
    options,
  );

  // Son propre mot de passe, donc sa propre DEK : l'appareil de secours n'a
  // jamais vu ces données.
  await preparerAppareilNeuf(pageSecours, MOT_DE_PASSE_SECOND_APPAREIL);
  await passerEnModeAvion(secours, pageSecours);
  await deverrouillerAppareil(pageSecours, MOT_DE_PASSE_SECOND_APPAREIL);

  await expect(titreDeVue(pageSecours)).toHaveText('Aujourd’hui');
  // L'état VIDE du 03 §33.2 : cet appareil ne connaît rien de la mission. C'est
  // la ligne de départ que la restauration doit franchir.
  await expect(pageSecours.getByText('Aucune mission sur cet appareil')).toBeVisible();

  await pageSecours.getByRole('button', { name: 'Restaurer une sauvegarde de secours' }).click();
  await pageSecours.getByLabel('Fichier de sauvegarde').setInputFiles(chemin);
  // Le mot de passe de l'appareil D'ORIGINE : c'est lui, et lui seul, la clé du
  // fichier. Celui de cet appareil-ci n'ouvrirait rien.
  await pageSecours.getByLabel('Votre mot de passe').fill(MOT_DE_PASSE_APPAREIL);
  await pageSecours.getByRole('button', { name: 'Restaurer sur cet appareil' }).click();

  await expect(pageSecours.getByText(/élément\(s\) de mission restauré/)).toBeVisible({
    timeout: 30_000,
  });

  await pageSecours.getByRole('button', { name: 'Ouvrir ma journée' }).click();
  await expect(titreDeVue(pageSecours)).toHaveText('Aujourd’hui');

  // Les DONNÉES sont là, et déchiffrables sous une DEK qui n'a jamais servi à
  // les écrire : le titre de mission et le nom de l'unité vivent tous deux dans
  // une charge chiffrée.
  await expect(pageSecours.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();
  await expect(pageSecours.getByText('Poste de débit')).toBeVisible();

  const sessions = await lireTableLocale(pageSecours, 'interviews');
  expect(sessions.length, 'la session planifiée sur l’appareil perdu est restaurée').toBe(1);

  // Ce que la restauration NE fait PAS, et le dit : la file d'envoi n'est pas
  // réinjectée dans cette version (DECISIONS.md 2026-09-05). Un test qui
  // n'exigerait rien ici laisserait passer une régression silencieuse le jour
  // où quelqu'un croirait l'avoir livrée.
  const file = await lireTableLocale(pageSecours, 'outbox');
  expect(file.length, 'aucune opération réinjectée — l’écran l’annonce, le test le fige').toBe(0);

  await secours.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// R1 — « ANCRES DE COTATION VISIBLES », CRITÈRE NOMMÉ DE LA PORTE P-C
//
// Recette A54 du 2026-09-07, arbitrage A01 du même jour (DECISIONS.md, commit
// b5a11a4). Deux tests, et ils ne mesurent pas la même chose :
//   · le premier juge la FIXTURE — un faux témoin ne peut plus revenir ;
//   · le second juge l'ÉCRAN, au doigt, sur une dalle d'iPad, réseau coupé.
//
// La copie exacte des libellés dérivés (crans 2 et 4) est figée par les tests
// unitaires du composant (`packages/ui/src/composants/EchelleAncree.test.tsx`),
// là où elle se compare au caractère près. Ici on éprouve ce que l'AUDITEUR
// obtient : du texte, avant d'avoir touché quoi que ce soit.
// ─────────────────────────────────────────────────────────────────────────────

test('@critique fixture — la question à échelle porte des ancres que la banque ACCEPTERAIT', () => {
  // ── CE QUE CE TEST EMPÊCHE DE REVENIR ──────────────────────────────────────
  // La fixture portait `guidanceSnapshot: null` sur une `scale_1_5` : zéro
  // ancre, état qu'un contrôle BLOQUANT de l'import refuse (§32.4,
  // `ANCRES_ABSENTES`). Aucun appareil réel ne peut recevoir cette question.
  // Le test d'écran passait donc au vert sur une donnée impossible, et le
  // critère de porte n'était éprouvé nulle part.
  //
  // Il ne recopie AUCUN seuil : `ANCRES_REQUISES` est lu dans le pack. Le jour
  // où Williams tranchera pour `[1, 2, 3, 4, 5]` (question escaladée par
  // l'arbitrage), ce test deviendra rouge tout seul et la fixture suivra — ce
  // qui est exactement ce qu'on attend d'une garde.
  const lu = lireAncresDeCotation(GUIDANCE_ECHELLE_FIL_TPE);

  const niveauxLus = lu.ancres.map((ancre) => ancre.niveau);
  for (const requis of ANCRES_REQUISES) {
    expect(niveauxLus, `l’ancre ${String(requis)} est exigée par le §32.4`).toContain(requis);
  }

  // Un niveau annoncé sans libellé n'est pas une ancre, c'est une promesse
  // d'ancre : le parseur les compte à part, et l'import les refuse.
  expect(lu.niveauxSansLibelle, 'aucune ancre sans définition').toEqual([]);
  expect(lu.niveauxHorsEchelle, 'aucun niveau hors de l’échelle 1-5').toEqual([]);
  for (const ancre of lu.ancres) {
    expect(ancre.libelle.trim(), `le niveau ${String(ancre.niveau)} est défini`).not.toBe('');
  }

  // Les libellés relus sont EXACTEMENT ceux que la fixture déclare : c'est ce
  // qui autorise le test d'écran à les chercher tels quels.
  expect(lu.ancres).toEqual(
    ANCRES_ECHELLE_FIL_TPE.map((ancre) => ({ niveau: ancre.niveau, libelle: ancre.libelle })),
  );

  // La consigne consultant survit à l'extraction des ancres (03 M3.1, §17.5) :
  // sans elle, la moitié de la guidance ne serait rendue nulle part.
  expect(lu.consigne).toBe(CONSIGNE_ECHELLE_FIL_TPE);
});

test('@critique cotation — les ancres se LISENT avant le premier tap (iPad émulé, hors ligne)', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const contexte = await browser.newContext({
    ...OPTIONS_COMMUNES,
    ...devices['iPad (gen 7) landscape'],
  });
  const page = await contexte.newPage();

  await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
  await passerEnModeAvion(contexte, page);
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  await page.getByRole('button', { name: /l’agenda/ }).click();
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur cotation');
  await page.getByLabel('Fonction').fill('Chef d’atelier');
  await page.getByLabel('Créneau').fill(creneauDuJour(11));
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect(page.getByText('Session planifiée.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();

  await page.getByRole('button', { name: /Interlocuteur cotation/ }).click();
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
  await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();

  // Deux « Suivant » pour atteindre la question à échelle. Ce sont les SEULS
  // gestes posés : rien n'a touché l'échelle, ni du doigt ni au clavier.
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await expect(page.getByRole('heading', { name: QUESTION_ECHELLE })).toBeVisible();

  const echelle = page.getByRole('group', { name: 'Votre cotation' });
  await expect(echelle).toBeVisible();

  // ① Rien n'est coté — la lecture des ancres ne doit RIEN avoir posé.
  await expect(
    echelle.locator('input[type="radio"]:checked'),
    'aucune note n’a été posée à ce stade',
  ).toHaveCount(0);

  // ② Les trois ancres de banque sont LUES À L'ÉCRAN. `toBeVisible` est ici la
  // seule assertion qui vaille : dans un `<details>` fermé, ces textes sont
  // DANS le DOM et invisibles — c'est précisément le défaut R1, et une
  // recherche de texte l'aurait déclaré couvert.
  for (const ancre of ANCRES_ECHELLE_FIL_TPE) {
    await expect(
      echelle.getByText(ancre.libelle, { exact: false }),
      `l’ancre ${String(ancre.niveau)} doit être lisible sans aucun geste`,
    ).toBeVisible();
  }

  // ③ La consigne consultant est là, à sa place, au centre (03 M3.1).
  await expect(page.getByText(CONSIGNE_ECHELLE_FIL_TPE)).toBeVisible();

  // ④ La ligne d'ancre invite à coter — jamais une bande blanche.
  const ligneAncre = echelle.locator('.axn-choix__ancre');
  await expect(ligneAncre).toHaveText('Sélectionnez une note pour voir son ancre.');

  // ── LE PREMIER TAP, ENFIN — sur le cran 2, celui que la banque n'ancre pas ──
  // On tape le LIBELLÉ, pas l'input : le contrôle radio est masqué visuellement
  // (technique de recouvrement accessible), et c'est bien la pastille que le
  // doigt de l'auditeur atteint.
  await echelle
    .locator('.axn-choix__option')
    .filter({ has: page.locator('input[value="2"]') })
    .tap();

  await expect(echelle.locator('input[value="2"]')).toBeChecked();
  // Le cran 2 n'a pas d'ancre de banque (`ANCRES_REQUISES = [1, 3, 5]`) : c'est
  // ici que l'écran rendait une ligne VIDE dans un bloc à hauteur réservée. Il
  // doit maintenant dire comment coter. La phrase entière est figée par les
  // tests unitaires du composant ; ce qui se mesure ici, c'est qu'elle arrive
  // jusqu'à la dalle — et on y cherche le fragment qu'une paraphrase avait déjà
  // mangé une fois (doctrine 3 du §32.4, 03:667), parce que c'est LUI qui
  // corrige le geste de l'auditeur et non l'habillage autour.
  await expect(ligneAncre).toContainText('une ancre entamée, pas une moyenne');
  await expect(ligneAncre).not.toHaveText('');

  // La cotation est ÉCRITE, pas seulement affichée : sans cette ligne, l'écran
  // aurait pu montrer une ancre pour une note que personne n'a enregistrée.
  await expect
    .poll(async () => (await lireTableLocale(page, 'answers')).length, {
      message: 'la cotation doit être une ligne locale',
      timeout: 20_000,
    })
    .toBe(1);

  await contexte.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// N1 — « ANCRES DE COTATION VISIBLES » : CE QUE `toBeVisible()` NE VOIT PAS
//
// Écrit par A26, testeur E2E offline. Je n'ai écrit aucune ligne de
// `packages/ui/src/composants/EchelleAncree.tsx`, aucune ligne de
// `apps/field/src/`, et je n'en corrigerai aucune : un scénario rouge est un
// rapport rendu au producteur, jamais un correctif de ma main (09 §5.6).
//
// ── LE CONSTAT, ET POURQUOI LA SUITE ÉTAIT VERTE ────────────────────────────
// Recette A54 du 2026-09-07 (rejeu), §2.2 : sur iPad PAYSAGE, l'ancre du cran 5
// commence 285 px sous le bord d'une fenêtre de 810 px, et l'auditeur qui
// défile pour lire l'ancre 4 perd les pastilles de vue. La garde R1 ci-dessus
// est restée VERTE, sincèrement : `toBeVisible()` ne regarde pas la fenêtre.
// L'instrument qui manquait vit désormais dans `fixtures/champ-de-vision.ts`.
//
// ── LE CRITÈRE MESURÉ ICI — ARBITRAGE A01 DU 2026-09-08, OPTION B ───────────
// « Visible » veut dire CO-VISIBLE avec la zone de cotation. Ce que §33.3
// interdit n'est pas le défilement, c'est de perdre les pastilles de vue en
// lisant l'ancre — la principale énonce déjà une relation spatiale (les ancres
// « s'affichent SOUS le curseur ») et la subordonnée en donne le motif (« la
// cotation homogène ne dépend pas de la mémoire du consultant »).
//
// Littéralement, et c'est ce que la garde exécute :
//   pour CHAQUE cran de 1 à 5, il existe une position de défilement où l'ancre
//   de ce cran ET la bande des cinq pastilles sont simultanément ENTIÈRES dans
//   la fenêtre — sur la cible la plus dure (iPad, §22.1), PORTRAIT ET PAYSAGE,
//   mode PRIVÉ ET ÉCRAN PARTAGÉ.
//
// Trois conséquences, écrites pour qu'on ne les redécouvre pas :
//   ① « Entières » : un débordement même PARTIEL est un échec. L'état
//      `partiellement_coupe` de l'instrument n'est pas une zone grise.
//   ② « Il existe une position » : A01 a écarté « tout tient à l'ouverture »
//      (option A) pour un motif à connaître — la hauteur d'une ancre est une
//      donnée de banque (§32.4, longueur libre), donc un critère de tenue dans
//      la fenêtre serait cassable par un rédacteur de guidance qui écrit trois
//      lignes de plus, et le pack n'écrit nulle part une telle obligation. La
//      garde DÉFILE donc pour chercher cette position, et n'échoue que si elle
//      n'existe pour aucun cran.
//   ③ N1 est OPPOSABLE à la porte P-C (critère nommé, 03 §33.7 et 07:24) :
//      cette garde est `@critique`, donc jamais skippable (CLAUDE.md §2).
//
// ── LE POINT QUE LA GARDE TRANCHE, ET QUE L'ARITHMÉTIQUE NE TRANCHE PAS ─────
// Sur les seuls chiffres de la recette, la co-visibilité pourrait passer par un
// défilement modéré (l'ancre 5 finit à 1158 pour une fenêtre de 810). A54 a
// pourtant OBSERVÉ que les pastilles sortent du champ. A01 a refusé de trancher
// de tête et a écrit le critère « de façon à ce que la garde décide, et non
// l'arithmétique ». La garde mesure donc DEUX choses à chaque position :
//   · `positionGeometrique` — les deux nœuds entiers dans la fenêtre : la
//     LETTRE du critère ;
//   · `positionRegardable` — la même chose, plus aucune barre collante
//     par-dessus. Trois barres `position: sticky` rognent la hauteur utile de
//     cet écran (l'en-tête de la coquille, le bandeau d'écran partagé, la barre
//     d'actions « Suivant ») ; un nœud caché dessous est dans la fenêtre et
//     n'est pas regardé. C'est l'hypothèse qu'A01 me demande de vérifier, et
//     les deux mesures sont rapportées séparément pour qu'un écart entre elles
//     se voie au lieu de se moyenner.
//
// ── LA LIMITE, NOMMÉE PLUTÔT QUE CONTOURNÉE (11 §7) ─────────────────────────
// C'est un iPad ÉMULÉ : taille, tactile, pointeur, agent utilisateur. Ni la
// barre d'URL de Safari, ni le clavier logiciel, ni les encoches ne sont
// modélisés, et tous RÉDUISENT la hauteur réelle — la mesure faite ici est donc
// OPTIMISTE. Les service workers sous iOS ne sont couverts par aucun de ces
// tests. Le mode avion réel et la mise en page réelle sur iPad se rejouent À LA
// MAIN aux portes P-C et P-E (checklist 07 §15, A27 et A54).
// ─────────────────────────────────────────────────────────────────────────────

/** Les quatre combinaisons dues par l'arbitrage A01 : deux orientations, deux modes. */
const COMBINAISONS_IPAD = [
  { orientation: 'portrait', mode: 'privé' },
  { orientation: 'portrait', mode: 'écran partagé' },
  { orientation: 'paysage', mode: 'privé' },
  { orientation: 'paysage', mode: 'écran partagé' },
] as const;

/** Les cinq crans de l'échelle §32.4 — mesurés un par un, jamais en bloc. */
const CRANS = [1, 2, 3, 4, 5] as const;

/**
 * Amène un appareil hors ligne jusqu'à la question à échelle, sans rien coter.
 *
 * C'est le parcours de la garde R1, refait à l'identique : appareil semé, mode
 * avion, déverrouillage, planification, accord, démarrage, deux « Suivant ».
 * Aucun geste sur l'échelle — la mesure porte sur ce que l'auditeur trouve en
 * arrivant, avant d'avoir touché quoi que ce soit.
 */
async function ouvrirLaQuestionAEchelle(
  contexte: BrowserContext,
  page: Page,
  heure: number,
): Promise<void> {
  await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
  await passerEnModeAvion(contexte, page);
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  await page.getByRole('button', { name: /l’agenda/ }).click();
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur cotation');
  await page.getByLabel('Fonction').fill('Chef d’atelier');
  await page.getByLabel('Créneau').fill(creneauDuJour(heure));
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect(page.getByText('Session planifiée.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();

  await page.getByRole('button', { name: /Interlocuteur cotation/ }).click();
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
  await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();

  await page.getByRole('button', { name: /^Suivant/ }).click();
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await expect(page.getByRole('heading', { name: QUESTION_ECHELLE })).toBeVisible();
}

for (const [rang, combinaison] of COMBINAISONS_IPAD.entries()) {
  test(`@critique cotation — ancre et pastilles co-visibles sur iPad ${combinaison.orientation}, mode ${combinaison.mode} (N1)`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const contexte = await browser.newContext({
      ...OPTIONS_COMMUNES,
      ...(combinaison.orientation === 'paysage'
        ? devices['iPad (gen 7) landscape']
        : devices['iPad (gen 7)']),
    });
    const page = await contexte.newPage();

    try {
      // L'heure du créneau varie d'une combinaison à l'autre : les quatre tests
      // tournent en parallèle sur des profils distincts, et un libellé identique
      // rendrait une trace d'échec impossible à rattacher à sa combinaison.
      await ouvrirLaQuestionAEchelle(contexte, page, 9 + rang);

      if (combinaison.mode === 'écran partagé') {
        // §33.3 — la bascule œil. Le mode partagé fait disparaître les panneaux
        // latéraux : la colonne s'élargit, les libellés dérivés tiennent sur
        // moins de lignes, et la hauteur utile change. C'est un cas de mesure à
        // part entière, pas une variante cosmétique.
        await page.getByRole('button', { name: 'Passer en écran partagé' }).click();
        await expect(page.getByRole('button', { name: 'Revenir en écran privé' })).toBeVisible();
      }

      const echelle = page.getByRole('group', { name: 'Votre cotation' });
      await expect(echelle).toBeVisible();
      // Rien n'est coté : la lecture des ancres ne doit avoir posé aucune note.
      await expect(
        echelle.locator('input[type="radio"]:checked'),
        'aucune note n’a été posée à ce stade',
      ).toHaveCount(0);

      const pastilles = echelle.locator('.axn-choix__pistes');
      // Le `dd` de la ligne, et NON le `.axn-choix__paire` qui l'englobe : cette
      // paire porte `display: contents` (composants.css : « elle n'existe que pour
      // la clé de rendu React »), donc elle n'a JAMAIS de boîte et ne peut pas se
      // mesurer. Mesuré le 2026-09-08 : la première version de cette garde
      // échouait sur ce point, et l'instrument nomme désormais ce piège.
      const ancres = echelle.locator('.axn-choix__liste-ancres dd');
      // Les cinq ancres existent AVANT qu'on mesure : sans ce contrôle, une
      // liste vide passerait la co-visibilité haut la main — c'est exactement le
      // faux témoin que la fixture portait avant le 2026-09-07.
      await expect(ancres, 'les cinq crans doivent être rendus').toHaveCount(CRANS.length);

      const releves: string[] = [];
      const echecsGeometriques: string[] = [];
      const echecsRegardables: string[] = [];

      // ① CE QUE L'AUDITEUR VOIT EN ARRIVANT, sans aucun geste. Ce n'est PAS le
      //    critère (A01 a écarté cette lecture), mais c'est le chiffre que la
      //    recette A54 a relevé à la main : il est mesuré et rapporté pour que
      //    la comparaison avec sa passe soit possible.
      const sansGeste = await mesurerChampDeVision(page, pastilles, 'bande des cinq pastilles');
      releves.push(`sans geste · ${decrireMesure(sansGeste)}`);
      for (const cran of CRANS) {
        const mesure = await mesurerChampDeVision(
          page,
          ancres.nth(cran - 1),
          `ancre du cran ${String(cran)}`,
        );
        releves.push(`sans geste · ${decrireMesure(mesure)}`);
      }

      // ② LE CRITÈRE A01, cran par cran : on défile pour de bon et on cherche.
      for (const cran of CRANS) {
        const co = await chercherCoVisibilite(
          page,
          pastilles,
          ancres.nth(cran - 1),
          `cran ${String(cran)} — iPad ${combinaison.orientation}, mode ${combinaison.mode}`,
          'bande des cinq pastilles',
          `ancre du cran ${String(cran)}`,
        );
        releves.push(decrireCoVisibilite(co));
        if (co.positionGeometrique === null) echecsGeometriques.push(decrireCoVisibilite(co));
        if (co.positionRegardable === null) echecsRegardables.push(decrireCoVisibilite(co));
      }

      // Les chiffres sont portés par le rapport MÊME QUAND LA GARDE EST VERTE :
      // c'est A01 qui les attend pour fermer N1 par la mesure, et une garde qui
      // ne rend ses nombres qu'en échouant ne sert qu'une fois. Une annotation
      // plutôt qu'un `console.log` — `no-console` vaut aussi pour les tests.
      test.info().annotations.push({
        type: `mesure N1 — iPad ${combinaison.orientation}, mode ${combinaison.mode}`,
        description: releves.join('\n'),
      });

      // ③ LES DEUX VERDICTS, SÉPARÉS. La lettre du critère d'abord — c'est elle
      //    qu'A01 a signée. Puis la même chose une fois les barres collantes
      //    prises en compte : un nœud caché sous l'en-tête est dans la fenêtre
      //    et n'est pas regardé, et c'est précisément l'hypothèse que la recette
      //    A54 a formulée à l'œil.
      expect(
        echecsGeometriques,
        `Critère A01 (2026-09-08) : pour chaque cran, il doit exister une position de ` +
          `défilement où l’ancre ET la bande des cinq pastilles sont ENTIÈRES dans la fenêtre. ` +
          `Crans en échec :\n${echecsGeometriques.join('\n')}`,
      ).toEqual([]);

      expect(
        echecsRegardables,
        `Même critère, barres collantes comprises : un nœud recouvert par une barre ` +
          `« position: sticky » est dans la fenêtre et n’est PAS regardé. Crans en échec :\n` +
          echecsRegardables.join('\n'),
      ).toEqual([]);
    } finally {
      await contexte.close();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §17.4 — « BOUTONS TOUJOURS IDENTIQUES ET AUX MÊMES PLACES » : LA CONSTANCE
// DES SEPT, MESURÉE D'UNE QUESTION À L'AUTRE
//
// Écrit par A26, testeur E2E offline, qui n'a produit aucune ligne de
// `apps/field/src/ecrans/entretien/ZoneQuestion.tsx` ni d'`entretien.css` (09
// §5.6). Demandé par la revue croisée A29 (R-7) sur l'instrument N1.
//
// ── POURQUOI CETTE GARDE, ET POURQUOI MAINTENANT ────────────────────────────
// A01, 2026-09-08 (« §17.4 énumère-t-il UNE barre… ») : la scission de la barre
// en deux groupes est conforme parce que §17.4 écrit une règle de CONSTANCE —
// « rien qui bouge, rien qui apparaisse au hasard » d'une question à l'autre —
// et une seule contrainte de place, pour Suivant. Puis : « les sept boutons
// restent, aucun ne disparaît hors écran partagé, aucune place ne varie d'une
// question à l'autre. Cette constance est désormais une propriété à GARDER —
// rien ne la mesure aujourd'hui. » §17.4 est un critère de P-C ; une propriété
// que l'arbitre déclare à garder et que rien ne mesure retombe au premier
// refactor. D'où `@critique`.
//
// ── CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS — SONDÉ AVANT D'ÊTRE ÉCRIT ────
// Une sonde jetable (2026-09-08, iPad paysage, iPad portrait, PC ; questions
// 1 → 2 → 3, privé et partagé) a établi ce qui est constant et ce qui ne l'est
// pas. CONSTANT d'une question à l'autre, sur un même appareil et un même mode :
// la présence des sept, leur ordre dans le DOM, l'abscisse, la largeur et la
// hauteur de chacun, et le décalage vertical de chaque bouton par rapport au
// premier de sa rangée. NON constant, et donc NON exigé : l'ordonnée absolue —
// les outils vivent dans le flux sous un contenu de hauteur variable (l'ancre
// est une donnée de banque, §32.4), et la navigation est collante, donc au bas
// de la fenêtre sur une question longue et à sa place de flux sur une courte.
// Exiger le même `y` serait inventer une contrainte que §17.4 n'écrit pas (la
// seule contrainte de place est « Suivant, zone basse droite »).
//
// Sur la DERNIÈRE question, le septième bouton dit « Terminer l'entretien » et
// non « Suivant » (M2, recette novice A54 du 2026-09-06) : un libellé qui dit
// ce qu'il fait, à la place que §17.4 lui assigne. Pour CE bouton, la place
// mesurée est le BORD DROIT — la seule contrainte que §17.4 écrit (« zone basse
// droite ») — et non le bord gauche : un bouton dont le libellé change
// légitimement peut changer de largeur, et un bord gauche qui recule de la
// longueur du mot n'est pas un bouton qui a bougé. Sa largeur n'est comparée
// qu'à LIBELLÉ ÉGAL (question 1 contre question 2, toutes deux « Suivant ») :
// là, un écart serait bien une place qui varie. Ce partage est une lecture de
// §17.4, pas un arbitrage ; s'il doit être tranché autrement, c'est dans
// `DECISIONS.md`, et la garde suivra.
//
// ── CE QUE LA GARDE NE CIBLE PAS, DÉLIBÉRÉMENT ──────────────────────────────
// Ni le rôle des deux groupes, ni leur `aria-label`, ni leurs classes : A21 les
// révise en parallèle (A29, R-4), et cette garde ne dépend pas de son résultat.
// Les boutons sont atteints par leur NOM ACCESSIBLE — les sept libellés que
// §17.4 énumère — à l'intérieur du seul `<article>` de l'écran, la carte de la
// question. C'est ce que l'auditeur lit, et c'est ce qui ne change pas.
// ─────────────────────────────────────────────────────────────────────────────

/** Les deux rangées de §17.4 après la scission arbitrée par A01 (2026-09-08). */
type Rangee = 'outils' | 'navigation';

/**
 * Les sept boutons de §17.4, dans l'ordre du DOM arbitré (A01, 2026-09-08,
 * option b : les cinq outils, puis la navigation).
 *
 * Les motifs tolèrent le suffixe de raccourci affiché sur PC (« (R) », « (↵) »),
 * l'`aria-label` complet de « Photo » (B3 : le bouton dit POURQUOI il est gris),
 * et le geste de fin qui remplace « Suivant » sur la dernière question.
 */
const LES_SEPT_BOUTONS: readonly {
  nom: string;
  motif: RegExp;
  rangee: Rangee;
  /** Le bord que §17.4 fixe : gauche pour six boutons, DROIT pour l'action principale. */
  bord: 'gauche' | 'droite';
}[] = [
  { nom: 'À revoir', motif: /^À revoir/, rangee: 'outils', bord: 'gauche' },
  { nom: 'N/A', motif: /^N\/A/, rangee: 'outils', bord: 'gauche' },
  { nom: 'Note', motif: /^Note$/, rangee: 'outils', bord: 'gauche' },
  { nom: 'Photo', motif: /^Photo/, rangee: 'outils', bord: 'gauche' },
  { nom: 'Recherche', motif: /^Recherche/, rangee: 'outils', bord: 'gauche' },
  { nom: 'Précédent', motif: /^Précédent$/, rangee: 'navigation', bord: 'gauche' },
  {
    nom: 'Suivant',
    motif: /^(Suivant|Terminer l’entretien)/,
    rangee: 'navigation',
    bord: 'droite',
  },
];

/** La place d'un bouton, réduite à ce qui est constant d'une question à l'autre. */
interface PlaceDeBouton {
  readonly nom: string;
  /** Le nom accessible RELEVÉ (« Suivant » ou « Terminer l’entretien ») : la largeur ne se compare qu'à libellé égal. */
  readonly libelle: string;
  readonly bord: 'gauche' | 'droite';
  /** La coordonnée du bord fixé par §17.4 : `x` à gauche, `x + largeur` à droite. */
  readonly bordFixe: number;
  readonly largeur: number;
  readonly hauteur: number;
  /** Décalage vertical par rapport au PREMIER bouton de sa rangée : la forme de la rangée. */
  readonly decalageDansLaRangee: number;
}

/**
 * Relève les boutons attendus dans la carte : présence (un et un seul chacun),
 * ordre dans le DOM parmi les sept, et place. Les boutons NON attendus doivent
 * être absents — c'est ainsi que le mode partagé se mesure avec la même règle.
 * Aucun verdict de constance ici : l'appelant compare deux relevés, et l'écart
 * affiche les deux, chiffrés.
 */
async function releverLesBoutons(
  page: Page,
  attendus: readonly Rangee[],
  etiquette: string,
): Promise<{ ordre: string[]; places: PlaceDeBouton[] }> {
  const carte = page.getByRole('article');
  await expect(carte, 'la carte de la question est la seule <article> de l’écran').toHaveCount(1);

  // L'ordre dans le DOM : tous les boutons de la carte, dans l'ordre du document,
  // réduits à ceux des sept qu'ils sont. Le nom accessible est celui que porte
  // `Bouton` : l'`aria-label` s'il existe, sinon le texte.
  const nomsDansLeDom = await carte
    .getByRole('button')
    .evaluateAll((boutons) =>
      boutons.map((bouton) => bouton.getAttribute('aria-label') ?? bouton.textContent.trim()),
    );
  const ordre: string[] = [];
  for (const nomDansLeDom of nomsDansLeDom) {
    const reconnu = LES_SEPT_BOUTONS.find((bouton) => bouton.motif.test(nomDansLeDom));
    if (reconnu !== undefined) ordre.push(reconnu.nom);
  }

  const places: PlaceDeBouton[] = [];
  const hautDeRangee = new Map<Rangee, number>();
  for (const bouton of LES_SEPT_BOUTONS) {
    const cible = carte.getByRole('button', { name: bouton.motif });
    if (!attendus.includes(bouton.rangee)) {
      await expect(
        cible,
        `${etiquette} : « ${bouton.nom} » est un geste interne, absent en écran partagé (§33.3)`,
      ).toHaveCount(0);
      continue;
    }
    await expect(cible, `${etiquette} : « ${bouton.nom} » est présent, une seule fois`).toHaveCount(
      1,
    );
    await expect(cible).toBeVisible();
    const boite = await cible.boundingBox();
    if (boite === null) throw new Error(`${etiquette} : « ${bouton.nom} » n’a aucune boîte.`);
    const haut = hautDeRangee.get(bouton.rangee) ?? boite.y;
    hautDeRangee.set(bouton.rangee, haut);
    const libelle = (await cible.getAttribute('aria-label')) ?? (await cible.innerText()).trim();
    places.push({
      nom: bouton.nom,
      libelle,
      bord: bouton.bord,
      bordFixe: bouton.bord === 'gauche' ? boite.x : boite.x + boite.width,
      largeur: boite.width,
      hauteur: boite.height,
      decalageDansLaRangee: boite.y - haut,
    });
  }
  return { ordre, places };
}

/**
 * Deux places sont les mêmes au pixel de tolérance près — jamais au demi-pixel.
 *
 * La largeur n'entre dans la comparaison qu'à LIBELLÉ ÉGAL : « Terminer
 * l'entretien » est plus long que « Suivant », et c'est le bord droit qui fait
 * sa place (en-tête de cette section).
 */
function memePlace(a: PlaceDeBouton, b: PlaceDeBouton): boolean {
  return (
    Math.abs(a.bordFixe - b.bordFixe) <= TOLERANCE_PX &&
    (a.libelle !== b.libelle || Math.abs(a.largeur - b.largeur) <= TOLERANCE_PX) &&
    Math.abs(a.hauteur - b.hauteur) <= TOLERANCE_PX &&
    Math.abs(a.decalageDansLaRangee - b.decalageDansLaRangee) <= TOLERANCE_PX
  );
}

/** La phrase qu'un écart de place affiche : un relevé, chiffré. */
function decrirePlace(place: PlaceDeBouton): string {
  return (
    `« ${place.libelle} » bord ${place.bord} ${String(Math.round(place.bordFixe))} px, ` +
    `largeur ${String(Math.round(place.largeur))} px, hauteur ${String(Math.round(place.hauteur))} px, ` +
    `décalage dans sa rangée ${String(Math.round(place.decalageDansLaRangee))} px`
  );
}

/** Les écarts de place entre deux relevés, bouton par bouton — vide si tout tient. */
function ecartsDePlace(
  reference: { etiquette: string; places: PlaceDeBouton[] },
  releve: { etiquette: string; places: PlaceDeBouton[] },
): string[] {
  const ecarts: string[] = [];
  for (const [index, place] of releve.places.entries()) {
    const attendue = reference.places[index];
    if (attendue === undefined || !memePlace(place, attendue)) {
      ecarts.push(
        `${reference.etiquette} : ${attendue === undefined ? 'absent' : decrirePlace(attendue)} ; ` +
          `${releve.etiquette} : ${decrirePlace(place)}`,
      );
    }
  }
  return ecarts;
}

test('@critique entretien — les sept boutons de §17.4 sont là et aux mêmes places d’une question à l’autre (iPad émulé, hors ligne)', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const contexte = await browser.newContext({
    ...OPTIONS_COMMUNES,
    ...devices['iPad (gen 7) landscape'],
  });
  const page = await contexte.newPage();

  try {
    // Le parcours de R1 et de N1, jusqu'à la PREMIÈRE question cette fois : la
    // mission FIL-TPE en compte trois, de trois types, et c'est leur diversité
    // qui fait la mesure — une carte courte, une moyenne, une longue à échelle.
    await planterAppareil(page, await semerAppareil(MOT_DE_PASSE_APPAREIL));
    await passerEnModeAvion(contexte, page);
    await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

    await page.getByRole('button', { name: /l’agenda/ }).click();
    await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
    await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur constance');
    await page.getByLabel('Fonction').fill('Chef d’atelier');
    await page.getByLabel('Créneau').fill(creneauDuJour(14));
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page.getByText('Session planifiée.')).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();

    await page.getByRole('button', { name: /Interlocuteur constance/ }).click();
    await page.getByLabel('Accord de participation recueilli').check();
    await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
    await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();

    const ORDRE_ATTENDU = LES_SEPT_BOUTONS.map((bouton) => bouton.nom);
    const releves: string[] = [];

    // ① MODE PRIVÉ, question après question : les sept, dans l'ordre, à la même
    //    place. La référence est la première question ; chaque suivante lui est
    //    comparée bouton par bouton, et l'écart affiche les deux relevés.
    const reference = {
      etiquette: 'question 1',
      ...(await releverLesBoutons(page, ['outils', 'navigation'], 'question 1')),
    };
    expect(reference.ordre, 'question 1 : les sept boutons, dans l’ordre du DOM').toEqual(
      ORDRE_ATTENDU,
    );
    releves.push(`question 1 · ${reference.places.map(decrirePlace).join(' · ')}`);

    for (const rang of [2, 3] as const) {
      await page.getByRole('button', { name: /^Suivant/ }).click();
      await expect(page.getByText(`Question ${String(rang)} / 3`)).toBeVisible();

      const etiquette = `question ${String(rang)}`;
      const releve = {
        etiquette,
        ...(await releverLesBoutons(page, ['outils', 'navigation'], etiquette)),
      };
      releves.push(`${etiquette} · ${releve.places.map(decrirePlace).join(' · ')}`);
      expect(releve.ordre, `${etiquette} : les sept boutons, dans l’ordre du DOM`).toEqual(
        ORDRE_ATTENDU,
      );

      const ecarts = ecartsDePlace(reference, releve);
      expect(
        ecarts,
        `§17.4 : « boutons toujours identiques et aux mêmes places ». Un bouton a changé de ` +
          `place entre la question 1 et la ${etiquette} :\n${ecarts.join('\n')}`,
      ).toEqual([]);
    }

    // ② ÉCRAN PARTAGÉ (§33.3) : les cinq outils DISPARAISSENT — ce sont des
    //    gestes internes —, la navigation RESTE, et elle reste à sa place d'une
    //    question à l'autre dans ce mode aussi.
    await page.getByRole('button', { name: 'Passer en écran partagé' }).click();
    await expect(page.getByRole('button', { name: 'Revenir en écran privé' })).toBeVisible();

    const partage3 = {
      etiquette: 'question 3, écran partagé',
      ...(await releverLesBoutons(page, ['navigation'], 'question 3, écran partagé')),
    };
    expect(partage3.ordre, 'écran partagé : la navigation seule, dans l’ordre').toEqual([
      'Précédent',
      'Suivant',
    ]);
    releves.push(`${partage3.etiquette} · ${partage3.places.map(decrirePlace).join(' · ')}`);

    await page.getByRole('button', { name: /^Précédent/ }).click();
    await expect(page.getByText('Question 2 / 3')).toBeVisible();
    const partage2 = {
      etiquette: 'question 2, écran partagé',
      ...(await releverLesBoutons(page, ['navigation'], 'question 2, écran partagé')),
    };
    releves.push(`${partage2.etiquette} · ${partage2.places.map(decrirePlace).join(' · ')}`);

    const ecartsPartages = ecartsDePlace(partage3, partage2);
    expect(
      ecartsPartages,
      `§17.4 en écran partagé : la navigation change de place d’une question à l’autre :\n` +
        ecartsPartages.join('\n'),
    ).toEqual([]);

    // Les chiffres sont portés par le rapport même quand la garde est verte :
    // c'est le relevé qu'un réviseur compare à sa propre passe.
    test.info().annotations.push({
      type: 'mesure §17.4 — sept boutons, iPad paysage',
      description: releves.join('\n'),
    });
  } finally {
    await contexte.close();
  }
});

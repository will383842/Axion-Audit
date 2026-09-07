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
// Le parseur du PACK, importé tel quel : c'est lui qui juge la guidance à
// l'import comme à l'écran. Une seconde lecture écrite dans le test dirait un
// jour autre chose que lui, et c'est le test qui aurait tort sans le savoir.
// `@axion/shared` n'étant pas une dépendance de la racine (voir l'en-tête de
// `scripts/check-fixtures-contrat.mjs`), on l'atteint par son chemin, comme la
// fixture atteint déjà la crypto de `apps/field`.
import {
  ANCRES_REQUISES,
  lireAncresDeCotation,
} from '../packages/shared/src/banque-questions.js';

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
  // doit maintenant dire comment coter. La phrase exacte est figée par les
  // tests unitaires du composant ; ce qui se mesure ici, c'est qu'elle arrive
  // jusqu'à la dalle.
  await expect(ligneAncre).toContainText('palier intermédiaire');
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

// =============================================================================
// E2E — LA POLICE EST-ELLE VRAIMENT LÀ ? (contre-champ POSITIF de `CT-1-CDN`)
//
// POURQUOI CE FICHIER EXISTE — et pourquoi il ne remplace aucun garde-fou.
//
// `CT-1-CDN` (scripts/check-invariants.mjs) cherche des noms d'hôtes de CDN dans
// les sources. Le test « ne contacte AUCUN domaine extérieur » de socle.e2e.ts
// compte les requêtes sortantes. Les deux sont restés VERTS pendant tout le lot
// L0, alors que `@fontsource-variable/inter` n'était installé NULLE PART : le
// jeton `--typo-police-corps` nommait Inter, App.tsx l'appliquait, et rien ne la
// chargeait. Le build ne sortait ni `@font-face` ni `.woff2`, et l'interface se
// rendait en police système.
//
// C'est le défaut de forme le plus banal de ce dépôt, et le plus coûteux : un
// garde-fou qui sait dire « il n'y a PAS de CDN » ne saura jamais dire « la
// police EST là ». Il est vert sur une page qui ne charge rien — c'est-à-dire
// exactement dans la situation qu'il est censé interdire. Une interdiction sans
// contre-champ positif n'est pas une garantie, c'est une formule.
//
// Ce fichier écrit les quatre contre-champs qui manquaient :
//   1. la police est RÉELLEMENT ÉMISE par le build, et servie depuis l'origine ;
//   2. elle est RÉELLEMENT RENDUE par le navigateur (pas seulement « chargée ») ;
//   3. elle tient dans un BUDGET D'OCTETS, parce que le précache d'un iPad en
//      zone blanche se paie une fois et sans réseau pour le rattraper ;
//   4. le sous-ensemble `latin-ext` est bien GRATUIT à l'exécution — l'argument
//      qui justifie de l'embarquer.
//
// TOUT CE QUE CE FICHIER ATTEND VIENT DES JETONS (`@axion/ui`), jamais d'une
// constante recopiée : il ne sait pas que la police s'appelle « Inter ». Il sait
// que `--typo-police-corps` promet une famille, et il vérifie que CETTE
// famille-là est livrée. Le jour où la charte change de police, ce fichier suit
// sans être touché — et reste rouge si la nouvelle police n'est pas embarquée.
//
// Traçabilité : E44 (UX/UI, police locale), E17 (stack imposée), E6 (hors ligne).
// Contrat 11 §1 : « @fontsource-variable/inter — police AUTO-HÉBERGÉE, jamais de CDN ».
// =============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { TOKENS_TYPOGRAPHIE } from '@axion/ui';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * La famille que le design system PROMET pour le corps de texte : la première de
 * la pile `--typo-police-corps`. Les suivantes sont des replis système, qui
 * n'ont besoin d'être embarquées par personne.
 */
function familleDeTete(pile: string): string {
  const premiere = pile.split(',')[0] ?? '';
  return premiere.trim().replace(/^['"]|['"]$/g, '');
}

const FAMILLE_PROMISE = familleDeTete(TOKENS_TYPOGRAPHIE['police-corps']);

/**
 * PLAFOND DE POIDS DES POLICES, PAR FRONT — et voici d'où sort le chiffre.
 *
 * Mesuré le 2026-08-28 sur le build des deux fronts : 2 fichiers, 133 324 octets
 * (`inter-latin-wght-normal` 48 256 + `inter-latin-ext-wght-normal` 85 068).
 *
 * 140 000 laisse ~5 % de marge — assez pour un remaniement interne du paquet,
 * trop peu pour qu'une régression passe inaperçue. Ce qu'il ATTRAPE, vérifié
 * fichier par fichier dans `@fontsource-variable/inter@5.3.0` :
 *   · l'`index.css` complet du paquet (1,9 Mo, 5 sous-ensembles × 3 jeux d'axes
 *     × romain/italique) — l'import « par défaut » qu'on écrit sans y penser ;
 *   · le retour à des graisses STATIQUES (une police variable en dix fichiers) ;
 *   · la bascule de l'axe `wght` seul vers `standard` ou `opsz` : le seul
 *     `inter-latin-ext-standard-normal` pèse déjà 133 336 octets, il dépasse à
 *     lui tout seul ;
 *   · l'ajout d'un troisième sous-ensemble, même le plus petit
 *     (`greek-ext-wght-normal`, 11 232 octets → 144 556, au-dessus du plafond).
 *
 * Ce dernier point est délibéré : embarquer un sous-ensemble de plus n'est pas
 * une micro-amélioration d'étage 1, c'est un octet payé sur chaque tablette hors
 * ligne (invariant 1 et 8). Ça s'arbitre (CLAUDE.md §3), ça ne se glisse pas.
 * Si l'arbitrage dit oui, ce plafond se relève DANS LE MÊME COMMIT, avec la
 * raison — pas après coup pour faire taire une CI rouge.
 */
const PLAFOND_POLICES_OCTETS = 140_000;

const FRONTS = [
  {
    nom: 'terrain',
    dist: join(RACINE, 'apps', 'field', 'dist'),
    base: '/',
    url: 'http://127.0.0.1:4173/',
  },
  {
    nom: 'console',
    dist: join(RACINE, 'apps', 'hq', 'dist'),
    base: '/hq/',
    url: 'http://127.0.0.1:4174/hq/',
  },
] as const;

// -----------------------------------------------------------------------------
// Lecture du BUILD — on interroge l'artefact réellement déployé, jamais la source.
// -----------------------------------------------------------------------------

interface DeclarationDePolice {
  famille: string;
  /** URL telle qu'écrite dans le CSS produit (donc telle que la verra le navigateur). */
  url: string;
  plageUnicode: string;
}

/** Feuilles de style émises dans `dist/assets` — au moins une, sinon rien n'a été construit. */
function cssDuBuild(dist: string): string {
  const assets = join(dist, 'assets');
  const feuilles = readdirSync(assets).filter((f) => f.endsWith('.css'));
  expect(
    feuilles.length,
    `aucune feuille de style dans ${assets} — le front n'a pas été construit`,
  ).toBeGreaterThan(0);
  return feuilles.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
}

/**
 * Extrait les `@font-face` du CSS produit. Analyse volontairement minimale : les
 * blocs sortent d'un minifieur, ils n'ont ni accolade imbriquée ni commentaire.
 * Une dépendance d'analyse CSS pour trente lignes serait une escalade 11 §8-1.
 */
function declarationsDePolice(css: string): DeclarationDePolice[] {
  const declarations: DeclarationDePolice[] = [];
  for (const bloc of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const corps = bloc[1] ?? '';
    const famille = (/font-family\s*:\s*([^;]+)/.exec(corps)?.[1] ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const plageUnicode = (/unicode-range\s*:\s*([^;]+)/.exec(corps)?.[1] ?? '').trim();
    for (const lien of corps.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      declarations.push({ famille, url: (lien[2] ?? '').trim(), plageUnicode });
    }
  }
  return declarations;
}

/** Chemin sur le disque d'une URL servie par ce front, en tenant compte de sa `base` Vite. */
function fichierServiPour(url: string, front: (typeof FRONTS)[number]): string {
  return join(front.dist, url.slice(front.base.length));
}

/** Tous les `.woff2` réellement émis dans `dist/assets`, avec leur taille. */
function policesEmises(dist: string): { nom: string; octets: number }[] {
  const assets = join(dist, 'assets');
  return readdirSync(assets)
    .filter((f) => f.endsWith('.woff2'))
    .map((nom) => ({ nom, octets: statSync(join(assets, nom)).size }));
}

/** `unicode-range` : la plage couvre-t-elle ce point de code ? */
function plageCouvre(plage: string, pointDeCode: number): boolean {
  for (const jeton of plage.split(',')) {
    const brut = jeton.trim().replace(/^U\+/i, '');
    if (brut === '') continue;
    const [debutTexte, finTexte] = brut.split('-');
    if (debutTexte === undefined) continue;
    // Forme jokerisée `U+FF??` : le joker borne le bas à 0 et le haut à F.
    const debut = Number.parseInt(debutTexte.replaceAll('?', '0'), 16);
    const fin =
      finTexte === undefined
        ? Number.parseInt(debutTexte.replaceAll('?', 'F'), 16)
        : Number.parseInt(finTexte, 16);
    if (Number.isNaN(debut) || Number.isNaN(fin)) continue;
    if (pointDeCode >= debut && pointDeCode <= fin) return true;
  }
  return false;
}

/** « é » — le français ordinaire. La face qui le couvre est celle qui rend l'interface. */
const POINT_E_ACCENT_AIGU = 0x00e9;
/** « ę » — diacritique d'Europe centrale. Il ne vit que dans le sous-ensemble étendu. */
const POINT_E_OGONEK = 0x0119;

for (const front of FRONTS) {
  test.describe(`polices du front ${front.nom}`, () => {
    // -------------------------------------------------------------------------
    // 1. LE CONTRE-CHAMP POSITIF DE CT-1-CDN
    // -------------------------------------------------------------------------
    test(`@critique la police promise par les jetons est ÉMISE par le build et servie depuis l'origine`, () => {
      const css = cssDuBuild(front.dist);
      const declarations = declarationsDePolice(css);

      // (a) Il existe au moins une déclaration. C'est la moitié qui manquait :
      //     zéro `@font-face` était l'état RÉEL du build pendant tout le lot L0.
      expect(
        declarations.length,
        `aucun @font-face dans le CSS de ${front.nom} : le jeton --typo-police-corps ` +
          `promet « ${FAMILLE_PROMISE} » et rien ne la charge`,
      ).toBeGreaterThan(0);

      // (b) …et elle porte LA famille que le jeton promet. Un `@font-face` pour une
      //     autre famille laisserait le texte en police système tout en rendant
      //     l'assertion (a) verte : c'est le même mensonge, déplacé d'un cran.
      const dePolicePromise = declarations.filter((d) => d.famille === FAMILLE_PROMISE);
      expect(
        dePolicePromise.length,
        `aucun @font-face pour « ${FAMILLE_PROMISE} » — familles déclarées : ` +
          ([...new Set(declarations.map((d) => d.famille))].join(', ') || '(aucune)'),
      ).toBeGreaterThan(0);

      // (c) Chaque URL est RELATIVE À L'ORIGINE. Un `https://…` ici serait un CDN
      //     que `CT-1-CDN` attraperait dans les sources mais PAS dans un fichier
      //     de `node_modules` recopié tel quel par le bundler.
      for (const declaration of dePolicePromise) {
        expect(
          declaration.url,
          `URL de police non relative à l'origine : ${declaration.url}`,
        ).toMatch(/^\/(?!\/)/);
        expect(
          declaration.url,
          `police servie dans un format inattendu : ${declaration.url}`,
        ).toMatch(/\.woff2$/);
        expect(
          declaration.url.startsWith(front.base),
          `« ${declaration.url} » ne commence pas par la base « ${front.base} » de ce front : ` +
            `servi derrière Caddy, le navigateur demanderait un chemin que personne ne sert`,
        ).toBe(true);
      }

      // (d) Le fichier EXISTE là où le CSS le demande, et c'est bien un WOFF2.
      //     Un CSS qui pointe sur un fichier absent est un 404 silencieux : le
      //     texte retombe en police système et tout le reste reste vert.
      for (const declaration of dePolicePromise) {
        const chemin = fichierServiPour(declaration.url, front);
        const octets = readFileSync(chemin);
        expect(octets.length, `fichier de police vide : ${chemin}`).toBeGreaterThan(0);
        // Signature WOFF2 : « wOF2 ». Une taille non nulle ne prouve rien —
        // un `index.html` de repli en ferait tout autant.
        expect(
          octets.subarray(0, 4).toString('latin1'),
          `${chemin} n'est pas un WOFF2 (signature absente)`,
        ).toBe('wOF2');
      }

      // (e) Aucun orphelin dans les deux sens : tout `.woff2` émis est référencé,
      //     tout `.woff2` référencé est émis. Un fichier précaché que personne
      //     n'utilise est du poids pur sur une tablette hors ligne.
      const emises = policesEmises(front.dist).map((p) => p.nom);
      expect(emises.length, `aucun .woff2 émis dans ${front.dist}`).toBeGreaterThan(0);
      const referencees = dePolicePromise.map((d) => d.url.split('/').pop() ?? '');
      expect([...emises].sort()).toEqual([...referencees].sort());
    });

    // -------------------------------------------------------------------------
    // 3. LE BUDGET DE POIDS
    // -------------------------------------------------------------------------
    test('les polices embarquées tiennent dans le budget de précache', () => {
      const emises = policesEmises(front.dist);
      const total = emises.reduce((somme, p) => somme + p.octets, 0);
      const detail = emises.map((p) => `${p.nom} = ${String(p.octets)}`).join('\n  ');
      expect(
        total,
        `poids des polices de ${front.nom} : ${String(total)} octets pour ` +
          `${String(emises.length)} fichier(s), plafond ${String(PLAFOND_POLICES_OCTETS)}.\n  ` +
          `${detail}\n` +
          `Chaque octet ici est précaché sur un iPad en zone blanche et payé sans ` +
          `réseau pour le rattraper. Relever ce plafond est un arbitrage, pas un correctif.`,
      ).toBeLessThanOrEqual(PLAFOND_POLICES_OCTETS);
    });

    // -------------------------------------------------------------------------
    // 2. LE RENDU RÉEL
    // -------------------------------------------------------------------------
    test('la police est RENDUE, et pas seulement déclarée chargée', async ({ page }) => {
      await page.goto(front.url);
      await page.evaluate(() => document.fonts.ready);

      // `check()` seul est le piège que ce test refuse de reproduire : il dit que
      // la face est disponible, jamais que le texte l'utilise. Il reste nécessaire
      // — il distingue « police absente » de « police présente mais mal appliquée ».
      const disponible = await page.evaluate(
        (famille) => document.fonts.check(`600 16px "${famille}"`),
        FAMILLE_PROMISE,
      );
      expect(
        disponible,
        `la face « ${FAMILLE_PROMISE} » n'est pas chargée : le @font-face pointe ` +
          `probablement sur un fichier que le serveur ne sert pas`,
      ).toBe(true);

      // LA VRAIE PREUVE : le texte ne fait pas la même largeur qu'en police
      // système. Deux piles identiques à la première famille près ; si Inter
      // n'était pas RÉELLEMENT utilisée, les deux retomberaient sur `system-ui`
      // et mesureraient EXACTEMENT la même chose — ce test serait rouge.
      const mesures = await page.evaluate((famille) => {
        const texte = 'Cotation du questionnaire — 0123456789 AVWjgy';
        function largeur(pile: string): number {
          const sonde = document.createElement('span');
          sonde.textContent = texte;
          sonde.style.cssText =
            'position:absolute;left:-9999px;top:0;white-space:pre;' +
            `font-size:100px;font-weight:600;font-family:${pile};`;
          document.body.append(sonde);
          const mesure = sonde.getBoundingClientRect().width;
          sonde.remove();
          return mesure;
        }
        return {
          avecPolice: largeur(`"${famille}", system-ui`),
          replicSysteme: largeur('system-ui'),
        };
      }, FAMILLE_PROMISE);

      const ecart =
        Math.abs(mesures.avecPolice - mesures.replicSysteme) /
        Math.max(mesures.avecPolice, mesures.replicSysteme);
      // 1 % à 100 px : bien au-delà de tout bruit de sous-pixel, bien en deçà de
      // l'écart réel entre Inter et n'importe quel sans-serif système.
      expect(
        ecart,
        `le texte mesure ${String(mesures.avecPolice)} px avec « ${FAMILLE_PROMISE} » et ` +
          `${String(mesures.replicSysteme)} px en police système : identiques, donc la page ` +
          `rend en police système et la police embarquée ne sert à rien`,
      ).toBeGreaterThan(0.01);
    });

    // -------------------------------------------------------------------------
    // 5. `latin-ext` EST-IL VRAIMENT GRATUIT ?
    // -------------------------------------------------------------------------
    test('le sous-ensemble étendu ne se télécharge que si un glyphe l’exige', async ({ page }) => {
      // L'argument qui justifie d'embarquer `latin-ext` est que `unicode-range` le
      // rend gratuit à l'exécution. Un argument non mesuré est une opinion : s'il
      // était faux, la page française paierait 85 068 octets de plus au premier
      // chargement, et le budget ci-dessus perdrait son sens.
      const declarations = declarationsDePolice(cssDuBuild(front.dist)).filter(
        (d) => d.famille === FAMILLE_PROMISE,
      );

      // Les deux faces sont identifiées par CE QU'ELLES COUVRENT, jamais par leur
      // nom de fichier : le nommage de @fontsource n'est pas un contrat.
      const faceFrancaise = declarations.find((d) =>
        plageCouvre(d.plageUnicode, POINT_E_ACCENT_AIGU),
      );
      const faceEtendue = declarations.find(
        (d) =>
          plageCouvre(d.plageUnicode, POINT_E_OGONEK) &&
          !plageCouvre(d.plageUnicode, POINT_E_ACCENT_AIGU),
      );
      expect(
        faceFrancaise,
        'aucune face ne couvre « é » : le français ne se rendrait pas',
      ).toBeDefined();
      expect(
        faceEtendue,
        'aucune face étendue distincte : soit elle n’est plus embarquée, soit les ' +
          'sous-ensembles ont été fusionnés — dans ce cas le budget se recalcule',
      ).toBeDefined();
      if (faceFrancaise === undefined || faceEtendue === undefined) return;

      const telecharges = new Set<string>();
      page.on('response', (reponse) => {
        const chemin = new URL(reponse.url()).pathname;
        if (chemin.endsWith('.woff2')) telecharges.add(chemin);
      });

      await page.goto(front.url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);

      expect(
        telecharges.has(faceFrancaise.url),
        `la face qui rend le français (${faceFrancaise.url}) n'a pas été téléchargée`,
      ).toBe(true);
      expect(
        telecharges.has(faceEtendue.url),
        `${faceEtendue.url} a été téléchargé alors qu'AUCUN glyphe de sa plage n'est ` +
          `affiché : \`unicode-range\` ne joue pas son rôle, et l'embarquer coûte ` +
          `réellement son poids à chaque premier chargement`,
      ).toBe(false);

      // CONTRE-CHAMP DU CONTRE-CHAMP : gratuit ne doit pas vouloir dire inutile.
      // On affiche un glyphe étendu — la face DOIT alors arriver. Sans cette
      // moitié, « jamais téléchargé » serait aussi vrai d'un fichier mort.
      await page.evaluate((famille) => {
        const sonde = document.createElement('span');
        // Diacritiques d'Europe centrale et orientale : ę ł ś ź ż Ș Ț.
        sonde.textContent = 'ęłśźż ȘȚ';
        sonde.style.cssText = `position:absolute;left:-9999px;top:0;font-size:64px;font-family:"${famille}";`;
        document.body.append(sonde);
      }, FAMILLE_PROMISE);

      await expect
        .poll(() => telecharges.has(faceEtendue.url), {
          timeout: 10_000,
          message:
            `${faceEtendue.url} n'arrive MÊME PAS quand un glyphe de sa plage est affiché : ` +
            `il est embarqué, précaché, et ne rend jamais rien`,
        })
        .toBe(true);
    });
  });
}

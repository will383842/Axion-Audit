// generer-briefs.mjs — un brief par lot, extrait du pack (docs/) selon l'ordre de lecture de
// CLAUDE.md §0. Un agent lit docs/briefs/L<n>.md (≈ 10 à 40 Ko) au lieu de rouvrir des fichiers de
// 40 à 120 Ko : chaque jeton lu est relu à chaque tour, donc c'est le plus gros levier de forfait.
//
// Les extraits sont COPIÉS À L'IDENTIQUE (aucune reformulation) : le pack reste la source. Les briefs
// sont générés — on ne les édite pas — et `--verifier` (garde de verify:rapide) échoue s'ils sont périmés.
//
//   node scripts/generer-briefs.mjs            écrit docs/briefs/*.md
//   node scripts/generer-briefs.mjs --verifier  échoue si un brief diffère de ce qui serait généré
//
// Audit de vitesse du 2026-10-23 (docs/AUDIT_VITESSE_2026-10-23.md, C12). Aucune dépendance.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(RACINE, 'docs');
const SORTIE = join(DOCS, 'briefs');

// Ordre de lecture de CLAUDE.md §0. `entier` : fichier lu en entier (chemin seulement) ;
// `sections` : extraits copiés dans le brief. Fichier 11 toujours en premier, ajouté plus bas.
const LOTS = {
  L0: { ligne07: 'L0', lire: [['02'], ['06', '10.3'], ['07']] },
  L1: { ligne07: 'L1', lire: [['04'], ['03', '32.1', '32.2'], ['01', '2']] },
  L2: {
    ligne07: 'L2',
    lire: [['06'], ['04'], ['05', '8.1', '9.7', '9.9'], ['03', '34.1', '34.4']],
  },
  L3: {
    ligne07: 'L3',
    lire: [['01'], ['03', 'M1', 'M2', '16', '18.1', '32.2', '32.4', '35.2'], ['04'], ['05']],
  },
  L4: {
    ligne07: 'L4',
    lire: [
      ['03', 'M1.1', '32.1', '32.4', '36.4'],
      ['04', '7.3'],
    ],
  },
  L5: {
    ligne07: 'L5',
    lire: [
      ['03', 'M3', '17', '19', '22.1', '25', '27', '32.5', '33', '34.2'],
      ['01', '20.4'],
      ['05', '9', '31'],
      ['06', '10'],
    ],
  },
  L6: { ligne07: 'L6', lire: [['05', '9'], ['04']] },
  'L7-L8': {
    ligne07: ['L7-min', 'L8'],
    lire: [['03', '18', '22.3', 'M5', '27.1', '32.1', '33.4', '36.3'], ['04']],
  },
  'L10-L11': {
    ligne07: ['L10', 'L11'],
    lire: [['03', 'M6', '26.2', '36.6'], ['01', '20.3'], ['04'], ['06']],
  },
};

const lire = (chemin) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
const fichierDuPack = (numero) => {
  const nom = readdirSync(DOCS).find((f) => f.startsWith(`${numero}_`) && f.endsWith('.md'));
  if (!nom) throw new Error(`fichier ${numero}_*.md introuvable dans docs/`);
  return nom;
};
const ko = (texte) => `${Math.round(Buffer.byteLength(texte) / 1024)} Ko`;
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Entier (« 16 », « 9 ») : titre de niveau 1 « # 16. … ». Pointé (« 32.4 ») ou module (« M1.1 ») :
// titre de niveau 2 à 4, suivi d'un espace, d'un tiret long ou de « : ».
function motif(ref) {
  const r = echapper(ref);
  return /^\d+$/.test(ref) ? new RegExp(`^# ${r}\\.? `) : new RegExp(`^#{2,4} ${r}(?: |—|:|$)`);
}

function extraire(lignes, ref) {
  const re = motif(ref);
  const debut = lignes.findIndex((l) => re.test(l));
  if (debut < 0) return null;
  const niveau = lignes[debut].match(/^#+/)[0].length;
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i++) {
    const m = lignes[i].match(/^(#+) /);
    if (m && m[1].length <= niveau) {
      fin = i;
      break;
    }
  }
  return lignes.slice(debut, fin).join('\n').trimEnd();
}

function ligneDeLaTable07(etiquette, texte07) {
  const debut = `| **${etiquette}** |`;
  const lignes = texte07.split('\n');
  // Phase 2 : les lots L9-L11 sont décrits dans un paragraphe, pas dans une ligne de table.
  return (
    lignes.find((l) => l.startsWith(debut)) ??
    lignes.find((l) => !l.startsWith('|') && l.includes(`${etiquette} `)) ??
    null
  );
}

function composer(lot, def, avertissements) {
  const t07 = lire(join(DOCS, fichierDuPack('07')));
  const etiquettes = [def.ligne07].flat();
  const parties = [];
  const entiers = [{ nom: fichierDuPack('11'), note: 'EN PREMIER, pour tous les lots' }];
  const extraits = [];
  const sources = [];

  for (const [num, ...refs] of def.lire) {
    const nom = fichierDuPack(num);
    const texte = lire(join(DOCS, nom));
    if (refs.length === 0) {
      entiers.push({ nom, note: ko(texte) });
      continue;
    }
    const lignes = texte.split('\n');
    for (const ref of refs) {
      const bloc = extraire(lignes, ref);
      if (bloc === null) {
        avertissements.push(`${lot} : § ${ref} introuvable dans ${nom}`);
        continue;
      }
      extraits.push({ nom, ref, bloc });
      sources.push(bloc);
    }
  }
  sources.push(...entiers.map((e) => e.nom));

  parties.push(`# Brief ${lot}`, '');
  parties.push(
    '> GÉNÉRÉ par `scripts/generer-briefs.mjs` — ne pas éditer (`pnpm briefs:generer` pour régénérer).',
    "> Les extraits sont copiés à l'identique du pack, qui reste LA source ; en cas de doute, ouvrir le §",
    "> dans le fichier d'origine. Ordre de lecture : `CLAUDE.md` §0.",
    '',
  );
  parties.push('## 1. Ce que le lot doit livrer (fichier 07, table des lots)', '');
  const dejaVues = new Set();
  for (const e of etiquettes) {
    const ligne = ligneDeLaTable07(e, t07);
    if (ligne) {
      if (!dejaVues.has(ligne)) parties.push(ligne, '');
      dejaVues.add(ligne);
    } else {
      parties.push(`_Pas de ligne « ${e} » dans la table du fichier 07 : voir 07 §12._`, '');
      avertissements.push(`${lot} : ligne « ${e} » absente de la table 07`);
    }
  }
  parties.push('## 2. À lire en entier (chemins, pas recopiés)', '');
  for (const e of entiers) parties.push(`- \`docs/${e.nom}\` — ${e.note}`);
  parties.push('', "## 3. Extraits du pack (copie à l'identique)", '');
  for (const x of extraits) parties.push(`<!-- ${x.nom} § ${x.ref} -->`, x.bloc, '');
  const corps =
    parties
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n';
  const empreinte = createHash('sha256').update(sources.join('\n')).digest('hex').slice(0, 12);
  return corps + `\n<!-- empreinte des sources : ${empreinte} -->\n`;
}

const verifier = process.argv.includes('--verifier');
const avertissements = [];
const attendus = new Map();
for (const [lot, def] of Object.entries(LOTS)) {
  attendus.set(`${lot}.md`, composer(lot, def, avertissements));
}

if (verifier) {
  const perimes = [];
  for (const [nom, contenu] of attendus) {
    const chemin = join(SORTIE, nom);
    if (!existsSync(chemin) || lire(chemin) !== contenu) perimes.push(nom);
  }
  if (perimes.length > 0) {
    console.error(
      `✗ briefs périmés ou absents : ${perimes.join(', ')}\n  → pnpm briefs:generer puis committer docs/briefs/`,
    );
    process.exit(1);
  }
  console.log(`✓ briefs à jour : ${attendus.size} fichier(s) dans docs/briefs/`);
} else {
  mkdirSync(SORTIE, { recursive: true });
  for (const [nom, contenu] of attendus) {
    writeFileSync(join(SORTIE, nom), contenu, 'utf8');
    console.log(`${nom.padEnd(12)} ${ko(contenu)}`);
  }
}
for (const a of avertissements) console.error(`⚠ ${a}`);
if (avertissements.length > 0 && verifier) process.exit(1);

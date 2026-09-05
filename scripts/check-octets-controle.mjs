#!/usr/bin/env node
// =============================================================================
// GARDE — AUCUN OCTET DE CONTRÔLE DANS UNE SOURCE VERSIONNÉE
// =============================================================================
// Ce garde ferme une famille entière de défauts, et il faut raconter celui qui
// l'a fait naître parce que c'est lui qui explique la forme du contrôle.
//
// MESURE DU 2026-09-04 — `apps/api/src/domaines/pilotage/couverture.ts` portait
// TROIS octets 0x00 littéraux, séparateurs de clés de `Map`. Conséquences
// constatées par deux agents indépendants (A37 puis A36) :
//
//     · ripgrep OMET le fichier, sans un mot ;
//     · `grep` GNU ne rend que « Binary file … matches », sans afficher de ligne ;
//     · `file` répond `data`.
//
// Le fichier le plus dense de l'incrément était donc INVISIBLE aux `grep` sur
// lesquels reposent les étapes 3 (auto-revue), 4 (revue croisée) et 6 (contrôle
// d'acceptation) du pipeline — et « zéro occurrence » y avait l'air d'une bonne
// nouvelle. C'est le pire mode de panne d'un contrôle : il rend du vert.
//
// Git le diffait encore PAR CHANCE : sa détection binaire ne regarde que les
// 8 000 premiers octets, et le premier NUL était à l'octet 8 114. Cent quatorze
// octets de marge séparaient ce dépôt d'un fichier de code que `git diff`
// n'aurait plus affiché en revue.
//
// ── LA CAUSE, ET ELLE N'EST PAS DANS LE CODE ────────────────────────────────
// A32 a tenté le correctif évident — « écris la séquence d'échappement au lieu
// de l'octet » — et LE DÉFAUT S'EST REPRODUIT DANS LE GESTE MÊME QUI LE
// CORRIGEAIT : les outils d'édition de cette chaîne d'agents CONVERTISSENT une
// séquence d'échappement en octet réel au moment de l'écriture. En écrire une
// quatrième a produit un quatrième NUL, qu'il a fallu retirer. C'est ainsi que
// les trois premiers étaient arrivés.
//
// Ce n'est donc pas un défaut de code : c'est un défaut d'OUTILLAGE. Il se
// reproduira chez chaque agent, et aucune consigne écrite ne l'arrêtera — seul
// un garde mécanique le peut. C'est ce fichier.
//
// LA PARADE, la seule qui survive à l'écriture : un APPEL DE FONCTION, dans une
// constante nommée.
//
//     const NUL = String.fromCharCode(0);   // survit à l'outillage
//     const ESC = String.fromCharCode(27);  // survit à l'outillage
//
// ── PÉRIMÈTRE ───────────────────────────────────────────────────────────────
// Tous les fichiers de `git ls-files`, MOINS ceux que git lui-même déclare
// binaires (attribut `binary` du `.gitattributes` : *.png, *.jpg, *.woff2,
// *.docx, *.axionbackup). On INTERROGE `git check-attr` plutôt que de recopier
// cette liste : une liste recopiée dérive, et le jour où `.gitattributes`
// accueille un nouveau type binaire, ce garde le suivra sans qu'on y pense.
//
// SONT AUTORISÉS, et eux seuls : TAB (0x09), LF (0x0A), CR (0x0D).
// SONT REFUSÉS : tout autre octet inférieur à 0x20, et DEL (0x7F).
//
// ── ZÉRO EXCEPTION, DÉLIBÉRÉMENT ────────────────────────────────────────────
// Le balayage d'ouverture (2026-09-05) a trouvé 41 octets ESC (0x1B) dans DIX
// fichiers — des séquences de couleur ANSI, écrites en échappement par un agent
// et converties en octet par le même outillage. Elles ont TOUTES été réécrites
// en `String.fromCharCode(27)` avant que ce garde ne soit branché, plutôt que
// tolérées par une liste d'exceptions. Un garde qui naît avec dix exceptions
// n'est pas un garde, c'est un inventaire (même règle que `EXCEPTIONS = []`
// dans `check-no-skipped-tests.mjs`).
//
// Traçabilité E36/E43 — agent A52 (09 §1), contrat 11 §2 et §7.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

// L'octet NUL lui-même, écrit de la SEULE façon qui survive à l'outillage.
// Ce garde ne peut pas se permettre de contenir ce qu'il interdit : `git ls-files -z`
// sépare ses chemins par un NUL, et l'écrire en échappement rendrait CE FICHIER
// partiellement invisible aux `grep` — le défaut se reproduisant dans son remède.
const NUL = String.fromCharCode(0);

const ESC = String.fromCharCode(27);
const ROUGE = `${ESC}[31m`;
const VERT = `${ESC}[32m`;
const GRIS = `${ESC}[90m`;
const RAZ = `${ESC}[0m`;

const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const DEL = 0x7f;

// Noms des octets refusés, pour que le message NOMME ce qu'il a trouvé. Un
// message qui dirait seulement « octet interdit » enverrait le prochain agent
// chercher au mauvais endroit ; « 0x00 (NUL) » lui donne son mot-clé.
const NOMS = {
  0x00: 'NUL',
  0x01: 'SOH',
  0x02: 'STX',
  0x03: 'ETX',
  0x04: 'EOT',
  0x05: 'ENQ',
  0x06: 'ACK',
  0x07: 'BEL',
  0x08: 'BS (retour arrière)',
  0x0b: 'VT (tabulation verticale)',
  0x0c: 'FF (saut de page)',
  0x0e: 'SO',
  0x0f: 'SI',
  0x10: 'DLE',
  0x11: 'DC1',
  0x12: 'DC2',
  0x13: 'DC3',
  0x14: 'DC4',
  0x15: 'NAK',
  0x16: 'SYN',
  0x17: 'ETB',
  0x18: 'CAN',
  0x19: 'EM',
  0x1a: 'SUB',
  0x1b: 'ESC (séquence de couleur ANSI)',
  0x1c: 'FS',
  0x1d: 'GS',
  0x1e: 'RS',
  0x1f: 'US',
  0x7f: 'DEL',
};

/** La conséquence CONCRÈTE, octet par octet — le « pourquoi c'est refusé ». */
function pourquoiRefuse(octet) {
  if (octet === 0x00) {
    return 'ripgrep OMET le fichier en silence et grep ne rend que « Binary file … matches » : le fichier devient INVISIBLE aux revues des étapes 3, 4 et 6, où « zéro occurrence » ressemble alors à une bonne nouvelle.';
  }
  if (octet === 0x1b) {
    return "séquence d'échappement ANSI littérale : elle se rejoue dans tout terminal qui affiche le fichier (cat, git diff, journal de CI) et colore ou masque du texte qui n'est pas le sien.";
  }
  if (octet === 0x0c || octet === 0x0b) {
    return 'blanc de mise en page hérité : invisible en revue, il déplace des lignes sans que le diff le montre.';
  }
  if (octet === 0x08 || octet === 0x7f) {
    return "octet d'effacement : le terminal affiche alors un texte DIFFÉRENT de celui qui est enregistré.";
  }
  return "octet de contrôle non imprimable : il n'a aucune représentation en revue, et les outils de texte du dépôt le traitent de façon imprévisible.";
}

/** Fichiers versionnés, moins ceux que GIT LUI-MÊME déclare binaires. */
function fichiersATraiter() {
  const versionnes = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 1 << 28 })
    .toString('utf8')
    .split(NUL)
    .filter((c) => c !== '');

  if (versionnes.length === 0) return { versionnes, aScanner: [] };

  // `git check-attr -z --stdin` : entrée ET sortie séparées par NUL, sortie en
  // triplets <chemin> <attribut> <valeur>.
  const sortie = execFileSync('git', ['check-attr', '-z', '--stdin', 'binary'], {
    input: versionnes.join(NUL) + NUL,
    maxBuffer: 1 << 28,
  }).toString('utf8');

  const champs = sortie.split(NUL);
  const binaires = new Set();
  for (let i = 0; i + 2 < champs.length; i += 3) {
    if (champs[i + 2] === 'set') binaires.add(champs[i]);
  }

  return { versionnes, aScanner: versionnes.filter((f) => !binaires.has(f)) };
}

/** Balaye un fichier et rend chaque octet refusé avec sa position humaine. */
function balayer(chemin) {
  let tampon;
  try {
    if (!statSync(chemin).isFile()) return [];
    tampon = readFileSync(chemin);
  } catch {
    // Chemin présent dans l'index mais absent du disque : rien à dire.
    return [];
  }

  const trouvailles = [];
  let ligne = 1;
  let colonne = 1;
  for (let i = 0; i < tampon.length; i++) {
    const octet = tampon[i];
    if (octet === LF) {
      ligne++;
      colonne = 1;
      continue;
    }
    const refuse = (octet < 0x20 && octet !== TAB && octet !== CR) || octet === DEL;
    if (refuse) trouvailles.push({ octet, decalage: i, ligne, colonne });
    colonne++;
  }
  return trouvailles;
}

const { versionnes, aScanner } = fichiersATraiter();

// UN CONTRÔLE QUI N'A RIEN ANALYSÉ NE SORT JAMAIS VERT (même règle que le garde
// anti-skip) : lancé hors dépôt, `git ls-files` rend zéro chemin, et ce script
// afficherait « aucun octet de contrôle » sans avoir ouvert un seul fichier.
if (versionnes.length === 0 || aScanner.length === 0) {
  console.error(`\n${ROUGE}✗ GARDE OCTETS DE CONTRÔLE : rien à analyser.${RAZ}`);
  console.error(
    "  `git ls-files` ne rend aucun fichier texte. Ce contrôle n'a donc RIEN vérifié —\n" +
      '  et un contrôle qui ne vérifie rien ne rend pas EXIT=0.\n',
  );
  process.exit(1);
}

const infractions = [];
for (const chemin of aScanner) {
  for (const t of balayer(chemin)) infractions.push({ chemin, ...t });
}

if (infractions.length > 0) {
  const fichiersAtteints = new Set(infractions.map((i) => i.chemin));
  console.error(`\n${ROUGE}✗ GARDE OCTETS DE CONTRÔLE : build rouge${RAZ}`);
  console.error(
    '  Une source versionnée ne contient que du texte : TAB, LF et CR sont les seuls\n' +
      '  octets de contrôle autorisés (contrat 11 §2 — la revue doit pouvoir LIRE ce que\n' +
      '  la machine exécute, et les grep des étapes 3, 4 et 6 en dépendent).\n',
  );

  const parOctet = new Map();
  for (const i of infractions) {
    if (!parOctet.has(i.octet)) parOctet.set(i.octet, []);
    parOctet.get(i.octet).push(i);
  }

  for (const [octet, liste] of [...parOctet.entries()].sort((a, b) => a[0] - b[0])) {
    const hex = `0x${octet.toString(16).padStart(2, '0')}`;
    console.error(
      `  ${hex} (${NOMS[octet] ?? 'octet de contrôle'}) — ${liste.length} occurrence(s)`,
    );
    console.error(`      POURQUOI C'EST REFUSÉ : ${pourquoiRefuse(octet)}`);
    for (const i of liste.slice(0, 25)) {
      console.error(
        `      ${i.chemin}:${i.ligne}:${i.colonne}  ${hex}  ${GRIS}(décalage ${i.decalage})${RAZ}`,
      );
    }
    if (liste.length > 25) console.error(`      ${GRIS}… ${liste.length - 25} de plus${RAZ}`);
    console.error('');
  }

  console.error(
    `  ${infractions.length} octet(s) dans ${fichiersAtteints.size} fichier(s).\n` +
      '\n' +
      "  LA PARADE — et surtout PAS celle qui vient à l'esprit :\n" +
      "  N'ÉCRIS JAMAIS LA SÉQUENCE D'ÉCHAPPEMENT (barre oblique inversée suivie de u0000,\n" +
      "  de x1b, ou de zéro) dans un fichier de ce dépôt. L'OUTILLAGE D'ÉDITION DE LA\n" +
      "  CHAÎNE D'AGENTS LA CONVERTIT EN OCTET RÉEL À L'ÉCRITURE : corriger ainsi\n" +
      '  reproduit le défaut dans le geste même qui le corrige (mesuré par A32 le\n' +
      '  2026-09-04, sur ce dépôt, en tentant ce correctif-là).\n' +
      '\n' +
      '  La SEULE forme qui survit est un APPEL DE FONCTION, dans une constante nommée :\n' +
      `      ${VERT}const NUL = String.fromCharCode(0);${RAZ}   puis  ${VERT}morceaux.join(NUL)${RAZ}\n` +
      `      ${VERT}const ESC = String.fromCharCode(27);${RAZ}  puis  ${VERT}\`\${ESC}[31m\`${RAZ}\n` +
      '\n' +
      "  Pour VOIR les octets d'un fichier suspect : `cat -v <fichier>`.\n" +
      "  Un `grep` ordinaire, lui, ne les montre pas — c'est tout le problème.\n",
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} octets de contrôle : aucun hors TAB/LF/CR ` +
    `(${aScanner.length} fichier(s) texte analysé(s), ` +
    `${versionnes.length - aScanner.length} binaire(s) déclaré(s) écarté(s)).`,
);

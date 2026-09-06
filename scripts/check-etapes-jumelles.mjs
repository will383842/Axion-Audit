#!/usr/bin/env node
// =============================================================================
// GARDE — DEUX ÉTAPES DE CI CENSÉES ÊTRE IDENTIQUES LE SONT-ELLES ENCORE ?
//
// ── LE BESOIN ───────────────────────────────────────────────────────────────
// `.github/actions/construire-image/action.yml` construit l'image, et la rejoue
// une seconde fois si le registre a hoqueté. GitHub Actions ne sait ni boucler
// sur une étape ni ancrer un bloc YAML : le `with:` est donc écrit DEUX FOIS.
//
// Le danger n'est pas la répétition, c'est qu'elle soit INVISIBLE : le chemin de
// reprise ne s'emprunte qu'en panne de registre. Une divergence entre les deux
// blocs produirait donc une image différente selon que Docker Hub a hoqueté ou
// non — et cette image-là partirait en staging sans que rien ne l'ait signalée.
// C'est très exactement la forme de défaut que ce dépôt traque : un chemin de
// code que personne ne regarde parce qu'il ne sert presque jamais.
//
// ── CE QUE CE GARDE FAIT ────────────────────────────────────────────────────
// Il extrait les deux blocs `with:` et les compare, ligne à ligne, après avoir
// normalisé l'indentation. Rien de plus : la propriété tient en une phrase, le
// contrôle aussi.
//
// AJOUTER UNE PAIRE : une entrée dans `PAIRES`. Le garde refuse de sortir vert
// s'il ne trouve pas ce qu'il cherche — un contrôle muet est pire qu'absent.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// L'octet d'échappement ne s'écrit pas en littéral ici (garde
// `check:octets-controle`) : l'outillage d'édition le convertirait en octet réel.
const ESC = String.fromCharCode(27);
const VERT = ESC + '[32m';
const ROUGE = ESC + '[31m';
const FIN = ESC + '[0m';

const PAIRES = [
  {
    fichier: '.github/actions/construire-image/action.yml',
    quoi: 'les deux tentatives de construction d’image',
    etapes: [
      "Construire (et pousser) l'image — 1re tentative",
      "Construire (et pousser) l'image — 2de tentative",
    ],
  },
];

/**
 * Rend le bloc `with:` d'une étape nommée, dédenté, sans son en-tête.
 *
 * Découpage à l'indentation plutôt qu'avec un analyseur YAML : ajouter une
 * dépendance pour lire quinze lignes serait disproportionné (CLAUDE.md §3-1),
 * et la forme visée est stable — `with:` puis un bloc plus indenté que lui.
 */
function blocWith(source, nomEtape) {
  const lignes = source.split('\n');
  const debut = lignes.findIndex((l) => l.includes(`- name: ${nomEtape}`));
  if (debut < 0) return null;

  const iWith = lignes.findIndex((l, i) => i > debut && /^\s*with:\s*$/.test(l));
  if (iWith < 0) return null;

  const indentWith = (/^(\s*)/.exec(lignes[iWith]) ?? ['', ''])[1].length;
  const corps = [];
  for (let i = iWith + 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (ligne.trim() === '') {
      corps.push('');
      continue;
    }
    const indent = (/^(\s*)/.exec(ligne) ?? ['', ''])[1].length;
    if (indent <= indentWith) break;
    // Les commentaires ne changent pas ce qui est construit : deux blocs qui ne
    // diffèrent que par une explication restent jumeaux.
    if (ligne.trim().startsWith('#')) continue;
    corps.push(ligne.slice(indentWith));
  }
  while (corps.length > 0 && corps[corps.length - 1] === '') corps.pop();
  return corps.join('\n');
}

let anomalies = 0;
let verifiees = 0;

for (const paire of PAIRES) {
  const chemin = resolve(RACINE, paire.fichier);
  if (!existsSync(chemin)) {
    console.error(`${ROUGE}✗${FIN} étapes jumelles : ${paire.fichier} est introuvable.`);
    console.error('  Un fichier déplacé rend ce garde MUET : corrige `PAIRES`.');
    process.exit(1);
  }
  const source = readFileSync(chemin, 'utf8');

  const blocs = paire.etapes.map((nom) => ({ nom, bloc: blocWith(source, nom) }));
  const absent = blocs.find((b) => b.bloc === null);
  if (absent !== undefined) {
    console.error(`${ROUGE}✗${FIN} étapes jumelles : « ${absent.nom} » ou son bloc`);
    console.error(`  d'entrées est introuvable dans ${paire.fichier}.`);
    console.error('  Un garde qui ne trouve pas ce qu’il cherche ne doit JAMAIS sortir vert.');
    process.exit(1);
  }

  verifiees++;
  const [a, b] = blocs;
  if (a.bloc === b.bloc) continue;

  anomalies++;
  console.error(`${ROUGE}✗${FIN} ${paire.fichier} — ${paire.quoi} ONT DIVERGÉ.\n`);
  const la = a.bloc.split('\n');
  const lb = b.bloc.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] === lb[i]) continue;
    console.error(`    ligne ${String(i + 1)} du bloc`);
    console.error(`      1re tentative : ${la[i] ?? '(absente)'}`);
    console.error(`      2de tentative : ${lb[i] ?? '(absente)'}`);
  }
  console.error('');
  console.error('  Le chemin de reprise ne s’emprunte qu’en panne de registre : une');
  console.error('  divergence y produirait une image différente SANS que personne la voie.');
  console.error('  Recopie le bloc modifié dans l’autre étape — les deux, ou aucune.');
}

if (anomalies > 0) process.exit(1);

console.log(
  `${VERT}✓${FIN} étapes jumelles : ${verifiees} paire(s) d’étapes de CI encore identiques.`,
);

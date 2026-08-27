#!/usr/bin/env node
// =============================================================================
// FORMAT DE `DECISIONS.md` — la gouvernance cesse de reposer sur la discipline.
//
// Contrat 11 §9bis : « `DECISIONS.md` — format d'entrée (append-only) :
//   `## AAAA-MM-JJ — [lot] Question` puis `Options :` / `Arbitrage :` (avec la
//   règle de précédence citée) / `Décideur :` / `Impact spec :`.
//   **Une décision non tracée dans ce format n'existe pas.** »
//
// POURQUOI CE SCRIPT EXISTE. Le gardien A02 a mesuré, à la main, que 4 entrées sur
// 23 respectaient le format — dont celle au nom de laquelle un script
// d'infrastructure existe dans le dépôt. Appliqué à la lettre, le §9bis effaçait
// donc une décision dont du code dépend. Et il a fait l'observation qui a décidé de
// ce fichier : **la gouvernance de `DECISIONS.md` était la seule règle du dépôt à
// reposer sur la seule discipline**, dans un lot dont la revue croisée avait trouvé
// « trois garde-fous qui mentaient ou n'étaient branchés nulle part ».
//
// Le pack n'exige pas cette mécanisation — c'est une recommandation d'A02, pas un
// écart. Elle est reprise parce que l'argument est le même partout ailleurs ici :
// ce qu'une machine peut vérifier ne doit pas dépendre de la vigilance d'un agent.
//
// Traçabilité : E36, E43, E47 (conventions, DECISIONS.md, portes matérialisées).
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const texte = readFileSync(resolve(RACINE, 'DECISIONS.md'), 'utf8');

/**
 * Une entrée commence par `## AAAA-MM-JJ — [lot] Question`.
 * Le tiret cadratin est celui du contrat ; on tolère le tiret simple pour ne pas
 * transformer une coquille typographique en échec de gouvernance.
 */
const EN_TETE = /^## (\d{4}-\d{2}-\d{2}) [—-] \[([^\]]+)\]\s*(.+)$/gm;

const entrees = [];
let precedent = null;
for (const m of texte.matchAll(EN_TETE)) {
  if (precedent) precedent.corps = texte.slice(precedent.debut, m.index);
  precedent = {
    date: m[1] ?? '',
    lot: m[2] ?? '',
    titre: (m[3] ?? '').trim(),
    ligne: texte.slice(0, m.index).split('\n').length,
    debut: (m.index ?? 0) + m[0].length,
    corps: '',
  };
  entrees.push(precedent);
}
if (precedent) precedent.corps = texte.slice(precedent.debut);

if (entrees.length === 0) {
  console.error(
    `${ROUGE}✗ aucune entrée trouvée dans DECISIONS.md.${RAZ}\n` +
      '  Format attendu : `## AAAA-MM-JJ — [lot] Question`\n',
  );
  process.exit(1);
}

const CHAMPS = [
  { cle: 'Options', motif: /^\*{0,2}Options\s*:?\*{0,2}\s*:?/m },
  { cle: 'Arbitrage', motif: /^\*{0,2}Arbitrage\s*:?\*{0,2}\s*:?/m },
  { cle: 'Décideur', motif: /^\*{0,2}Décideur\s*:?\*{0,2}\s*:?/m },
  { cle: 'Impact spec', motif: /^\*{0,2}Impact spec\s*:?\*{0,2}\s*:?/m },
];

/**
 * La règle de précédence doit apparaître DANS l'arbitrage — soit appliquée, soit
 * déclarée sans objet. La mention en en-tête de fichier ne dispense pas : c'est
 * dans l'arbitrage qu'on doit voir que la question a été posée.
 */
const PRECEDENCE = /précédence|§32-36|§24-31|§16-22|§1-15/i;

/**
 * Entrées régularisées par une entrée de régularisation, LUES DANS LE FICHIER.
 *
 * L'exemption ne vit PAS dans ce script : elle vit dans `DECISIONS.md`, sous le
 * titre « Entrées régularisées », visible de tout lecteur du registre. Une
 * exemption qu'on ne peut pas voir en lisant le registre serait exactement le trou
 * que ce lot a passé sa journée à boucher ailleurs — une liste d'exceptions cachée
 * dans un outil, que plus personne ne relit.
 */
function titresRegularises() {
  const section = /##\s*Entrées régularisées\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Décideur)/.exec(
    texte,
  );
  if (!section) return new Set();
  return new Set([...(section[1] ?? '').matchAll(/^- (.+)$/gm)].map((m) => (m[1] ?? '').trim()));
}

const regularisees = titresRegularises();
const anomalies = [];

for (const e of entrees) {
  // Une entrée régularisée reste soumise au contrôle des CHAMPS : la
  // régularisation comble ce qui manquait, elle n'autorise pas à s'en dispenser.
  // Elle ne dispense que de la déclaration de précédence, qu'elle porte pour tout
  // le bloc antérieur.
  const regularisee = regularisees.has(e.titre);
  const manquants = CHAMPS.filter((c) => !c.motif.test(e.corps)).map((c) => c.cle);
  if (manquants.length > 0 && !regularisee) {
    anomalies.push({
      ou: `DECISIONS.md:${String(e.ligne)}`,
      titre: e.titre,
      quoi: `champ(s) manquant(s) : ${manquants.join(', ')}`,
    });
  }
  if (!PRECEDENCE.test(e.corps) && !regularisee) {
    anomalies.push({
      ou: `DECISIONS.md:${String(e.ligne)}`,
      titre: e.titre,
      quoi: 'la règle de précédence n’est ni appliquée ni déclarée « sans objet »',
    });
  }
}

if (anomalies.length > 0) {
  console.error(
    `\n${ROUGE}✗ DECISIONS.md — ${String(anomalies.length)} entrée(s) hors format${RAZ}\n`,
  );
  for (const a of anomalies) {
    console.error(`  ${a.ou}  « ${a.titre.slice(0, 70)} »`);
    console.error(`    ${a.quoi}\n`);
  }
  console.error(
    '  Contrat 11 §9bis : « une décision non tracée dans ce format N’EXISTE PAS ».\n' +
      '  Format : ## AAAA-MM-JJ — [lot] Question\n' +
      '           Options : / Arbitrage : / Décideur : / Impact spec :\n\n' +
      '  Dans `Arbitrage :`, cite la règle de précédence (§32-36 > §24-31 > §16-22 >\n' +
      '  §1-15) quand elle tranche une divergence du pack, ou écris « règle de\n' +
      '  précédence sans objet (aucune divergence interne) ». Une entrée = UNE décision.\n\n' +
      '  Le fichier est APPEND-ONLY : ne réécris pas une entrée passée pour la mettre\n' +
      '  en conformité — ce serait le changement silencieux que le format empêche.\n' +
      '  Réémets son contenu manquant dans une entrée nouvelle et datée.\n',
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} DECISIONS.md : ${String(entrees.length)} entrée(s), toutes au format 11 §9bis` +
    ` (précédence citée ou déclarée sans objet).`,
);

// Le fichier étant append-only, une date qui recule signale une insertion au
// milieu — c'est-à-dire une réécriture de l'historique.
const dates = entrees.map((e) => e.date);
const desordre = dates.findIndex((d, i) => i > 0 && d < (dates[i - 1] ?? ''));
if (desordre > 0) {
  console.log(
    `${JAUNE}  ⚠ la date de l'entrée « ${entrees[desordre]?.titre.slice(0, 50) ?? ''} » recule.${RAZ}\n` +
      '    Un fichier append-only se lit dans l’ordre : une insertion au milieu est\n' +
      '    une réécriture de l’historique, même sans suppression.',
  );
}

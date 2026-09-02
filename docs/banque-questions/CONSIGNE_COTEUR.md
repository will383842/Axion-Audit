# CONSIGNE AU COTEUR — cotation croisée du 15/09

Vous êtes l'un des **deux coteurs** d'un exercice de calibrage de la banque de questions d'audit IA.
L'autre coteur reçoit exactement le même matériel. **Vous ne vous parlez pas avant le dépouillement
commun** — c'est la condition de validité de tout l'exercice. Un désaccord entre vos deux grilles
n'est pas une erreur : c'est une ancre ambiguë démasquée, et c'est précisément ce qu'on cherche.

## Votre matériel (rien d'autre)

- `MODE_EMPLOI.md` — les règles du format **et la doctrine de cotation (§5bis), à lire en entier
  avant de commencer** ;
- la banque : `socle.csv` + `socle-bloc-1` à `socle-bloc-9` (100 questions, séparateur `;`) ;
- deux dossiers d'audit fictifs : `cas-fictif-FIL-TPE` (cabinet de 8 personnes) et
  `cas-fictif-FIL-GC` (groupe de 4 200 salariés) — ils décrivent ce qu'un auditeur a vu, entendu et
  obtenu. **Ils ne contiennent aucune cotation : elle est votre travail** ;
- `grille-depouillement.csv` — votre grille à remplir (vos colonnes uniquement).

N'allez pas chercher d'autres documents : tout ce qu'il faut est ici, et le reste fausserait
l'exercice.

## Comment coter

1. **L'ancre, rien que l'ancre.** Chaque question porte ses niveaux 1/3/5 (colonne `guidance_fr`),
   ses options ou son barème. Pas d'intuition d'expert : si l'ancre vous gêne, cotez au plus proche
   et **notez votre gêne** en colonne `ancre_a_revoir` — cette colonne est la récolte de l'exercice.
2. **Toute échéance se calcule contre le 02/09/2026** (« moins de 12 mois » = depuis le 02/09/2025).
   Plusieurs dates des dossiers sont à quelques semaines d'une borne : calculez, n'estimez pas.
3. **Doctrine (MODE_EMPLOI §5bis)**, en résumé : le silence de l'entreprise se cote **1** (NC
   réservé à l'information matériellement non obtenue) · parc hétérogène et multi-sites : **le plus
   défavorable fait la note** · les notes **2 et 4** exigent au moins un élément établi de l'ancre
   supérieure · **NA** seulement là où la guidance de la question le prévoit.
4. **Ordre conseillé** : FIL-TPE d'abord, FIL-GC ensuite. Budget réaliste : **une demi-journée par
   cas**, d'un seul tenant si possible.
5. **Ce que vous inscrivez** : échelle → un entier 1-5 · choix → le `code` de l'option · oui/non ·
   pourcentage → la valeur retenue · relevés à poids 0 → une ligne de synthèse. `NA` avec sa
   justification d'une demi-ligne ; `NC` si l'information n'est pas au dossier au sens de la
   doctrine.

## Ce qu'on attend de vous, et ce qu'on n'attend pas

On n'attend **pas** que vous tombiez juste : il n'y a pas de corrigé. On attend une cotation
**défendable ancre en main** — au dépouillement, chacun lira à voix haute l'ancre qui a fondé sa
note. Une grille sans aucune hésitation signalée serait suspecte : les dossiers sont faits pour
vous faire hésiter à des endroits précis.

**Merci — rendez votre grille à l'animateur, pas à l'autre coteur.**

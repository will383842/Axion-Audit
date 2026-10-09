# Régime rapide — texte de remplacement de CLAUDE.md §4 à §8 et §10

> Adopté par Williams le 2026-10-09. À recopier dans CLAUDE.md à la place des §4-§8 et du §10
> (les §0-§3 et §9 — invariants, interdits, versions, conventions d'API — ne changent pas).

## 4. RÉGIME RAPIDE — 3 ÉTAPES PAR LOT (Williams, 2026-10-09 — prime sur 09 §3)

**But unique de la Phase 1 :** un consultant mène un audit sur tablette → les données remontent au
siège → un rapport en sort. Tout ce qui ne sert pas ce parcours attend.

**Ordre de travail :** (1) séance P-C sur iPad (corriger d'abord le double \`<h1>\`) →
(2) ancres de cotation de la banque (\`ANCRES_ABSENTES\`) → (3) **L6 sync COMPLÈTE**, seule →
(4) scoring branché (route + \`scores.csv\`) → (5) profil d'interlocuteur saisi en entretien →
(6) rapport DOCX v1 → (7) audit fictif de bout en bout ; ce qui bloque devient la liste suivante.
Après : radar, finitions, charge 50 clients, perf détaillée, multi-auditeurs avancé.

1. **Brief** — critères du lot dans le fichier 07 + ordre de lecture §0. Pas de note de conception,
   SAUF L6 (une page).
2. **Code + tests** — **tests écrits AVANT** sur sync, RBAC/propriété, chiffrement local, scoring,
   machine à états. Sur ces zones, **le test n'est jamais écrit par l'agent qui a écrit le code**.
3. **Revue + CI verte → PR** — une revue séparée (sous-agent qui n'a rien produit) **seulement**
   pour sync, RBAC, chiffrement local, étanchéité financière ; ailleurs, l'auto-revue suffit.
   La suite complète tourne en CI.

**Quatre rôles suffisent :** auteur · testeur distinct · relecteur des zones critiques · gardien
des critères (A02, à la porte seulement). Les autres gabarits de \`.claude/agents/\` ne s'invoquent
que pour leur spécialité, jamais par principe.
**Budget d'itération : un bug qui résiste à 3 tentatives = arrêt et question à Williams.**
**L6 se développe SEULE. Une branche à la fois par fichier.** Paralléliser : \`docs/ORGANISATION_AGENTS.md\`.

---

## 5. DEFINITION OF DONE (à la porte)

- [ ] lint + typecheck = **0 erreur** ; tous les tests verts, **AUCUN test skippé**
- [ ] couverture ≥ 90 % **mesurée** sur sync, crypto locale, scoring, RBAC/propriété
- [ ] \`@filrouge\` vert ; écrans livrés avec leurs **4 états** ; axe-core vert
- [ ] migrations up/down sur staging ; **diff schéma-vs-04 = zéro écart**

Plus de matrice de traçabilité à cocher dans les deux sens : \`check:tracabilite\` reste en CI.

---

## 6. AMÉLIORATIONS

Étage 1 (confort évident, sans toucher schéma/API/crypto/périmètre) : autorisé, une ligne dans
\`AMELIORATIONS.md\`. Étage 2 (fonction manquante) : une fiche, **jamais codée avant le oui de Williams**.

---

## 7. GIT

- \`main\` protégé : une branche par incrément → PR → **squash merge**. Jamais de commit direct.
- Commits conventionnels **d'une ligne** (\`feat(l6a): …\`) ; \`wip:\` autorisé sur la branche.
- **\`DECISIONS.md\` : une ligne par vrai arbitrage** (\`date · [lot] · décision · décideur\`).
  Les constats et récits vont dans le commit, pas dans un registre.
- **Pas de PR de documentation seule** : la doc voyage dans la PR de code du lot.
- **Porte** = une fiche \`docs/portes/PORTE_<X>_<date>.md\` : critères du 07, preuve (lien CI ou
  capture), signature de Williams. Rien d'autre (pas de pré-revue, pas de contre-revue).

---

## 8. REPRISE ET DURABILITÉ

- **\`docs/ETAT.md\` = UN seul bloc de ≤ 8 lignes, réécrit** (git garde l'historique) : date, branche,
  dernier commit vert, tâche en cours, prochaine action, tests rouges connus.
- **Commit + push à chaque sous-tâche terminée.** Un commit non poussé n'existe pas.
- \`pre-push\` rejoue \`pnpm verify:rapide\` ; \`pnpm verify\` complet avant d'ouvrir une PR.
- **Reprise** : ETAT.md → \`git log -5\` + \`git status\` → rejouer les tests (la vérité, ce sont
  les tests) → « Prochaine action ».
- **Williams : une séance de 30 min par semaine**, sur une liste préparée d'avance (oui / non).
  Aucun dossier à lire.

---

## 10. SIGNATURE

Auteur → relecteur (zones critiques) → gardien A02 (à la porte) → **Williams** (la porte, le merge).

# TRACABILITE
> **Pack d'implémentation Axion Audit — fichier 08/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Matrice des 47 exigences → sections (V2.9)
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 23. MATRICE DE TRAÇABILITÉ DES EXIGENCES (VÉRIFICATION DE COMPLÉTUDE — V2.9)
*Chaque exigence exprimée par Williams au cours de la conception, tracée vers sa (ses) section(s). Vérifiée le 27/08/2026.*

| # | Exigence | Sections |
|---|---|---|
| E1 | Méthodologie d'audit structurée (8+1 blocs, collecte → livrables) | §2.1 |
| E2 | Toutes tailles d'entreprise (4 → 20 000+), 4 paliers | §2.3, §21 |
| E3 | Tous secteurs d'activité, paquets sectoriels progressifs | §2.3, §21.2 |
| E4 | Filiales, mono/multi-établissements, arbre organisationnel à profondeur libre | §16.2 |
| E5 | Chaque service audité en profondeur (paquets service, scoring par unité, heatmap) | §16.3, §16.4 |
| E6 | Hors ligne total (entrepôts, sous-sols, avion) sur ordinateur ET tablette | §9, §22.1 |
| E7 | Remontée continue au siège dès qu'il y a du réseau (jamais en fin de mission) | §9.3, §22.1 |
| E8 | Durée d'audit libre (jours → mois), statuts sans fin imposée | §1.4-9, §18.3 |
| E9 | Multi-consultants sur une même mission, répartition par unités, sync sans conflit | §18.2, §9.4 |
| E10 | Banque de questions UNIQUE étiquetée (jamais une par métier), versionnée, enrichissement volontaire | §2.3, M1.1, §21.2 |
| E11 | Génération automatique du questionnaire depuis le profil client, figé par mission | M2 |
| E12 | Entretiens par interlocuteur (parcours filtrés), pause/reprise, « à revoir », notes, ad hoc | M3 |
| E13 | Écran d'entretien 3 zones, une question à la fois, saisie clavier, enregistrement continu | M3.1, §17.4 |
| E14 | Consolidation : réponses côte à côte, divergences direction/terrain, scoring maturité, radar | M5 |
| E15 | Rapport 12-60 p. selon le niveau d'audit (§26.1) généré AU SIÈGE en DOCX (retouche Word) puis PDF ; PPTX restitution en V2 | M6, §26.1, §1.4-6/7 |
| E16 | Rédaction assistée IA : 1 appel par bloc, jamais d'invention, brut/généré/validé, coûts tracés | M6.3 |
| E17 | Stack imposée : Hetzner, Docker, PostgreSQL, Fastify, React+Vite PWA, Dexie, docxtemplater | §4.2 |
| E18 | Liaison automatique clients axion-ia.com : console maîtresse, devis signé → mission, statuts remontés, pont formation Qualiopi | M8, §20.6 |
| E19 | Partie A avant-vente : cadrage de l'étendue (entreprise complète / services / filiales) → estimation durée → équipe idéale → simulateur nb auditeurs ↔ durée → devis | §18.1 |
| E20 | Suivi avance/retard temps réel (mission et auditeur), projection de fin | §18.3 |
| E21 | Auditeurs : jamais accès aux devis/montants (RBAC routes + colonnes, testé) | §18.1.4, §18.3, §13 |
| E22 | Console de pilotage siège professionnelle : tous les audits, tous les auditeurs, pilotage individuel, 7 espaces | §22.3 |
| E23 | Hyper intuitif : mode guidé pas-à-pas, novice autonome < 30 min, bac à sable, zéro bouton sauvegarder | §17 |
| E24 | Validation OBLIGATOIRE de chaque étape (verrous, profils guidé strict/expert, dérogations tracées) | §19.1 |
| E25 | Zéro oubli : plan d'entretiens, contrôles de fin d'entretien/visite, écran de couverture, transitions gardées | §17.3, §16.6 |
| E26 | Alertes actives sur les manques (centre d'alertes, 8 types, cliquables, acquittement motivé) | §20.4 |
| E27 | Design moderne, visuel, efficace : charte Axion-IA, composants uniques, dataviz, WCAG AA | §19.2 |
| E28 | Finalité : détecter TOUT le potentiel IA/automatisation (temps, argent, productivité) + besoins de formation par population | §20.5 |
| E29 | Rapport = plan d'action 12 mois mois par mois, paliers avec assimilation, actions indépendantes, trajectoire 3 ans + KPIs | §20.3 |
| E30 | 3 niveaux d'audit (diagnostic cadrage / opérationnel / stratégique groupe) alignés sur l'offre publique 8 étapes | §20.1, §20.2 |
| E31 | Des centaines de clients : généricité absolue (aucune référence client dans le produit), test des 4 missions-archétypes | §21.1 |
| E32 | Audits monde entier : fuseaux horaires, réseaux dégradés, devises, interface 100 % français | §22.2 |
| E33 | Sécurité/RGPD : chiffrement local, consentements, pseudonymisation LLM, purges, AIPD, hébergement UE | §10 |
| E34 | Conformité AI Act (registre usages IA, art. 50, art. 4 → pont formations) | §6.1, bloc 9 |
| E35 | Scalabilité 1 → 50 consultants, ~200 missions/an, sauvegardes 3-2-1 testées chaque nuit | §11 |
| E36 | Exécutable par lots Claude Code avec critères d'acceptation, échéance noyau : fin sept. 2026 | §12 + 00_INDEX (référence de charge unique : noyau 26 j-h) |

| E37 | Scoring intégralement spécifié : barème par type de réponse, agrégation, complétude, divergence, drapeaux rouges, contrôle bloquant à l'import | §32.1, 04 §7.3 |
| E38 | Sauvegarde terrain : sync ≥ 1×/jour + export de secours chiffré (création + restauration testées) + alerte sync muette | §9.7, invariant 8, 07 §15 |
| E39 | Machine à états mission + codes d'étape énumérés + transitions contrôlées | §32.2, 04 |
| E40 | Référentiel ROI normé + règles d'échantillonnage + ancres de cotation obligatoires | §32.4 |
| E41 | Consolidation groupe cadrée (agrégation, heatmap filles×blocs, gabarit dédié) | §32.3 |
| E42 | RGPD renforcé : base légale précisée, AIPD complète, notice versionnée, pseudonymisation 2 passes, rétention activity_log | §10.4 V2.2 |
| E43 | Exécutabilité autopilote : versions épinglées, conventions API, contrat d'ops + processed_ops, format export de secours, seeds codables, incréments commitables, limites d'autonomie | Fichier 11 (V2.3) |
| E44 | UX/UI 2026-2027 : tokens chiffrés, police auto-hébergée offline, règle des 4 états, raccourcis complets, ancres visibles, mode écran partagé, prévisualisation questionnaire, desktop-first console, reduced-motion | §33 (V2.4), §17, §19 |
| E45 | Pilotage humain : matrice console rôle×espace, cockpit auditeur « Aujourd'hui », pouvoirs du lead énumérés, habilitation obligatoire (habilitated_at), runbook de sortie + réaffectation tracée, proportionnalité du suivi d'équipe, anti-collision d'agenda | §34 (V2.5), §18, §22.3 |
| E46 | Bout en bout opérationnel : calendrier consolidé code + non-code daté, format CSV d'import d'arbre, butoir dur L8, pont Qualiopi V1 manuel, postes de coûts, décision maquettes assumée | §35 (V2.6) |
| E47 | Profondeur fonctionnelle : matrice de complétude module par module, format de l'export de mission (ZIP + reponses.csv), format d'import de la banque (contrôle des ancres), conventions git/DECISIONS.md/portes matérialisées, règle de confidentialité de la recherche globale | §36 (V2.7), fichier 11 §9bis |

**Résultat de la vérification V2.7** : **47/47 exigences couvertes** · les 5 bloquants, 14 majeurs et 14 mineurs de la revue adversariale indépendante du 27/08/2026 sont corrigés (journal complet : fichier 10_CHANGELOG_V2.2) · règle de précédence V2.2 documentée en tête de chaque fichier · le DDL vit exclusivement dans le fichier 04. Prochaines révisions légitimes : porte P-D (fin de lot L6, confrontation au code réel) et rétrospective le client pilote (terrain).

---

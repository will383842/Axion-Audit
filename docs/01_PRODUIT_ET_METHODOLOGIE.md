# PRODUIT ET METHODOLOGIE
> **Pack d'implémentation Axion Audit — fichier 01/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Produit, méthodologie d'audit (9 blocs, 3 niveaux, 8 étapes publiques), rôles, généricité multi-clients
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 1. VISION, CONTEXTE ET OBJECTIFS

## 1.1 Le problème

Axion-IA vend des audits IA (un de ses cinq piliers : formation Qualiopi, audit, implémentation, coaching 1-to-1, sites/SaaS augmentés IA). Aujourd'hui, la conduite d'un audit repose sur des documents épars et le savoir-faire du consultant. Ce n'est ni industrialisable, ni scalable à une équipe, ni homogène d'une mission à l'autre.

## 1.2 La solution

**Axion Audit** : une plateforme interne (jamais revendue à d'autres cabinets) qui outille toute la chaîne de l'audit :

```
Création mission → Génération auto du questionnaire adapté →
Collecte terrain HORS LIGNE (entretiens) → Synchronisation continue vers le siège →
Consolidation + scoring de maturité → Génération assistée (IA) du rapport DOCX (12 à 60 pages selon le niveau d'audit, §26.1) →
Retouche humaine → Export PDF → Livraison → Suivi post-audit
```

## 1.3 Objectifs mesurables

| Objectif | Cible |
|---|---|
| Temps de préparation d'une mission (questionnaire prêt) | < 30 min (vs plusieurs jours à la main) |
| Temps de production du premier jet de rapport | < 1 h après clôture de la collecte |
| Perte de données terrain | Zéro (offline-first, aucune saisie perdue) |
| Visibilité siège sur l'avancement des missions | Temps réel (dès qu'il y a du réseau) |
| Montée en charge | 1 consultant (sept. 2026) → 2-3 (2026-2027) → ~50 (cible) |
| Couverture clients | 1 à 20 000+ salariés (de l'indépendant au groupe mondial — TPE : parcours réduit §21.2), tous secteurs, mono ou multi-pays |

## 1.4 Contraintes structurantes (décisions déjà prises — NON NÉGOCIABLES)

1. **Auto-hébergé** sur VPS **Hetzner** (Allemagne → RGPD). Supabase écarté. Souveraineté et maîtrise totale.
2. **PostgreSQL** = source unique de vérité. **Docker** pour tout.
3. **PWA React + Vite**, offline-first, **IndexedDB via Dexie**, file d'attente de synchronisation maison.
4. **Multi-appareils dès la V1** : la même PWA fonctionne sur ordinateur ET tablette (iPad/Android), en ligne comme hors ligne — recette Phase 1 sur les deux (décision mise à jour, voir §22.1).
5. **Sync bidirectionnelle et continue** (pas en fin de mission) ; UUID générés **côté client** ; horodatage ; aucun écrasement entre consultants.
6. Le **rapport lourd se génère au siège**, jamais sur la machine terrain. Le terrain collecte, le siège produit.
7. Rapport en **DOCX** (docxtemplater, gabarit charte Axion-IA : terracotta #c24a1b, ivoire #faf8f3, bleu #1a4dd9, mocha #2a2520) retouché dans Word, **export PDF au dernier moment**.
8. **Banque de questions UNIQUE** étiquetée (bloc, secteur, effectif min/max, interlocuteur, périmètre) — jamais une banque par métier.
9. Une mission n'a **pas de durée imposée** : statuts (préparation / en cours / en analyse / livrée / clôturée), une mission peut durer une semaine ou trois mois.
10. Génération IA : **un appel API par bloc**, jamais un appel géant ; le modèle **rédige à partir des données, n'invente jamais** ; texte brut conservé à côté du généré ; marquage explicite généré / validé.
11. **Liaison native avec l'écosystème axion-ia.com** (console d'administration, CRM Pro) — voir §5.8.
12. Vocabulaire dans tout contenu produit pour les plateformes : jamais « assistant », toujours « prestataire » (règle éditoriale Axion-IA).

## 1.5 Hors périmètre (explicitement exclus)

- Revente de l'outil à des cabinets tiers (usage interne exclusif).
- Application mobile native (la PWA suffit ; réévaluation en V3).
- Portail client en libre-service complet (le client final ne se connecte pas en V1 ; un pré-audit en ligne limité arrive en V2 — §6.3).
- Facturation (portée par la console axion-ia.com existante).

---


# 2. PÉRIMÈTRE MÉTIER — LA MÉTHODOLOGIE D'AUDIT EMBARQUÉE

## 2.1 Les 9 blocs d'audit (référentiel Axion-IA — 8 blocs d'origine + bloc 9 conformité AI Act)

Chaque bloc définit : ce qu'on **collecte** et ce qu'on **produit**.

| # | Bloc | Collecte | Livrable de sortie |
|---|------|----------|--------------------|
| 1 | **Cadrage stratégique** | Historique, structure juridique, organigramme, filiales/pays, CA par activité, objectifs à 3 ans, culture du changement | Note de contexte + cartographie sponsors / freins politiques |
| 2 | **Cartographie des processus** | Service par service : fréquence, temps passé, effectifs impliqués, outils, taux d'erreur, irritants terrain | Cartographie **chiffrée** = base de calcul ROI |
| 3 | **Audit de la donnée** | Localisation, qualité, volume, silos, formats, hébergement, conformité RGPD par pays | Score de maturité data |
| 4 | **Audit technique & sécurité** | Infra, ERP/CRM, intégrabilité API, sécurité, gestion des accès, souveraineté | Liste des prérequis techniques à lever |
| 5 | **Audit humain & compétences** | Littératie IA par service, usages « sauvages » (ChatGPT en douce), appétence, craintes | Cahier des charges du plan de formation Qualiopi |
| 6 | **Cas d'usage** | Croisement blocs 1-5 | Liste de cas d'usage : gain estimé, coût, complexité, délai, risque |
| 7 | **Priorisation** | Matrice impact / effort | 3 vagues : quick wins 0-3 mois, chantiers 3-12 mois, transformations 12+ mois |
| 8 | **Feuille de route & gouvernance** | Planning, budget, KPI, comité de pilotage, conduite du changement, charte d'usage IA | Feuille de route livrable + dispositif de gouvernance |
| 9 | **Conformité AI Act & registre IA** *(nouveau — voir §6.1)* | Inventaire des systèmes d'IA en usage, qualification par niveau de risque, transparence art. 50, preuve de formation art. 4 | Registre des usages IA + plan de mise en conformité |

> Le bloc 9 est un ajout issu de la recherche (§6.1). Le référentiel devient **9 blocs**, le neuvième étant activable/désactivable par mission (activé par défaut pour toute entreprise opérant dans l'UE).

## 2.2 Alignement avec les référentiels de maturité du marché

Le scoring par bloc (§5.5) est mappé sur les dimensions consensuelles des frameworks du marché (stratégie & valeur, data & gouvernance, technologie, personnes & compétences, processus, gouvernance/risque, adoption & culture), avec une échelle de maturité en 5 niveaux inspirée des modèles Gartner/Deloitte (Découverte → Expérimentation → Opérationnel → Systémique → Transformateur). Cela permet de positionner chaque client par rapport à des repères reconnus, et de produire le **radar de maturité** du rapport.

## 2.3 Le système modulaire à trois couches (questionnaire)

1. **Couche socle** — universelle, posée à tous (~150 questions) : gouvernance, données, outils, compétences, conformité.
2. **Couche sectorielle** — paquets de 20-40 questions activés par secteur (artisanat, commerce, industrie, services, santé, transport/logistique, agroalimentaire…). Ajoutés **au fil des missions réelles** (« on construit pendant qu'on facture »).
3. **Couche dimensionnelle** — déclenchée par la taille :

| Palier | Effectif | Dispositif |
|---|---|---|
| **Micro** | 1-10, mono-site | ~30 questions, 1 entretien dirigeant, ½ journée |
| **PME** | 10-250 | 3-5 entretiens |
| **ETI** | 250-5 000 | Directions constituées + DSI, entretiens par direction |
| **Grand compte** | 5 000+ | Filiales, gouvernance groupe, multi-pays, entretiens séparés par service, consolidation groupe |

## 2.4 Périmètre géographique d'une mission

Paramètre de mission dès la V1 : **France seule** ou **multi-pays**. En multi-pays : duplication de la mission par pays (missions filles) + **mission de consolidation groupe** au-dessus. le client pilote n'a pas encore tranché → **décision à ACTER au RDV du 1er septembre (point à l'ordre du jour — V2.2)**. À défaut : plan de repli documenté et chiffré au devis — missions séparées par pays SANS consolidation outillée en V1, collecte hors France via questionnaire exporté en anglais (mode papier M3.4, traduction manuelle des paquets concernés). La consolidation outillée et l'i18n de contenu restent Phase 2 (L14, §32.3) : « prêt dans les deux cas » s'entend au sens du repli, pas d'une consolidation native en octobre.

## 2.5 Stratégie de remplissage de la banque (V1)

Architecture universelle dès le jour 1, mais contenu rempli **uniquement** pour la mission du client pilote : socle universel + palier grand compte multi-pays ≈ **200 questions**. Réutiliser les acquis existants d'Axion-IA :
- La **taxonomie des ~50 cas d'usage IA sur 11 fonctions métier** (travaux page audit du site, mai 2026) → nourrit le bloc 6 et les étiquettes de service.
- Le **formulaire TPE en 8 étapes** (audit à distance TPE) → base du pré-audit en ligne (§6.3) et du palier Micro.
- Le **questionnaire de cadrage amont** (appel pré-session 30-45 min) → checklist de la phase « préparation » d'une mission.

---


# 3. UTILISATEURS, RÔLES ET PERMISSIONS

## 3.1 Rôles (RBAC)

| Rôle | Description | Portée |
|---|---|---|
| **admin** (siège) | Williams + futurs responsables. Voit TOUT. Gère la banque de questions, les utilisateurs, les gabarits de rapport, les intégrations, la conformité | Globale |
| **consultant** | Conduit des missions terrain. Ne voit QUE ses missions (assignées via la table de liaison) | Ses missions |
| **analyste** *(V2)* | Prépare la consolidation et les premiers jets de rapport au siège, sans accès terrain ni administration | Missions assignées, lecture + rédaction rapport |
| **lecteur** *(V2)* | Consultation seule (ex. : associé, contrôle qualité) | Missions assignées, lecture seule |

Principes : moindre privilège ; toute permission vérifiée **côté serveur** (jamais seulement masquée côté client) ; middleware d'autorisation systématique sur chaque route ; les requêtes SQL des consultants sont TOUJOURS filtrées par leurs missions assignées.

## 3.2 Parcours type

- **Admin** : crée le client (ou l'importe depuis la console axion-ia.com), crée la mission, définit le profil (secteur, effectif, sites, pays, périmètre), assigne le(s) consultant(s), suit l'avancement en temps réel, pilote la consolidation, génère et retouche le rapport, livre.
- **Consultant** : ouvre sa mission sur son portable (même sans réseau), crée des sessions d'entretien (nom, fonction, service), déroule les questions filtrées par profil d'interlocuteur, annote, marque « à revoir », ajoute des questions à la volée, synchronise automatiquement dès que le réseau revient.

---


# 20. AVENANT V1.5 — ALIGNEMENT SUR LA MÉTHODOLOGIE COMMERCIALE AXION-IA ET LE LIVRABLE PROMIS AU CLIENT
*(27/08/2026 — source : méthodologie publique « Un audit IA rigoureux, en 8 étapes » (site + infographie) et proposition le client pilote. RDV Teams le client pilote/Mme Roux : mardi 1er septembre, 11 h-12 h. Cet avenant prévaut.)*

## 20.0 Correction de référence client
Le client de la première mission est **le client pilote** (groupe international, ~6 500 salariés). Toute occurrence antérieure « Dély France » est corrigée dans le présent document.

## 20.1 Trois niveaux d'audit (offre client) — MODIFIE missions et M9
Nouveau champ `missions.audit_level` :

| Niveau | Description commerciale | Effet dans l'outil |
|---|---|---|
| `diagnostic_cadrage` | Diagnostic de cadrage — quelques jours | Blocs 1-2-6-7 en densité réduite, entretiens direction uniquement, rapport court (12-18 p., §26.1), abaques dédiées |
| `operationnel` | Audit opérationnel — périmètre défini (services/établissements) | Blocs actifs selon périmètre, paquets service complets, rapport complet |
| `strategique_groupe` | Audit stratégique à l'échelle du groupe | Tous blocs, arbre complet, multi-auditeurs, missions filles si multi-pays, consolidation groupe, rapport 40-60 p. (§26.1) |

**Correspondance avec l'offre publique (V2.8)** — la page audit d'axion-ia.com vend « **4 niveaux** » (diagnostic ciblé · TPE 1 journée · PME · ETI/grandes entreprises) alors que l'outil pilote par 3 `audit_level` × 5 `commercial_offer`. La table de correspondance est FIXÉE ici pour que la page publique, le devis et la mission disent la même chose : **diagnostic ciblé** → `diagnostic_cadrage` × `audit_cible` · **TPE (1 journée, à partir de 1 190 €)** → `diagnostic_cadrage` × `audit_flash` · **PME** → `operationnel` × `mission_pme` · **ETI/grandes entreprises** → `operationnel` × `mission_eti` ou `strategique_groupe` × `grand_programme` selon le périmètre. Les « niveaux » publics sont un langage commercial ; le paramétrage outil est la vérité technique — cette correspondance est la passerelle, à reprendre telle quelle dans les devis.

Le niveau conditionne : la sélection de questions (nouvelle étiquette `levels JSONB` sur les questions), les abaques d'estimation (M9), le gabarit de rapport. La nomenclature CRM (`commercial_offer` : audit_flash…) est conservée comme axe de scoring prospection ; **mapping** administrable entre les deux (ex. Audit Flash → diagnostic_cadrage).

## 20.2 Superposition pilote de mission ↔ 8 étapes publiques — MODIFIE §17.2
Ce que le client achète (les 8 étapes du site) = ce que l'outil déroule. Le pilote affiche désormais la numérotation publique :

| Étape publique (site/infographie) | Dans l'outil | Livrable de l'étape |
|---|---|---|
| 01 Cadrage de la mission et des objectifs | Pilote 1-2 : Cadrage + Préparation (M9 : arbre, périmètre, plan d'entretiens, NDA coché) | Périmètre & objectifs validés |
| 02 Entretiens métier et qualification | Pilote 3 : Collecte (blocs 1-5 + bloc 9) | Cartographie des usages & frictions |
| 03 Consolidation et analyse approfondie | Pilote 4 : Analyse (agrégation, scores, divergences) | Pistes IA qualifiées (candidats `use_cases`) |
| 04 Pré-évaluation et filtrage des options | Analyse : tri des use_cases (impact × faisabilité, statut `ecarte`/`short_list` ajouté) | Short-list priorisée |
| 05 Évaluation et recommandations | Analyse : chiffrage des finalistes (gain, coût, conditions de réussite, ROI) | Recommandations chiffrées (ROI) |
| 06 Restitution et feuille de route IA | Pilote 5-6 : Rapport + Livraison | Rapport + cartographie par service + roadmap priorisée |
| 07 Mise en œuvre des recommandations | HORS AUDIT — export vers prestation d'implémentation Axion-IA (M8.3 : la console déclenche la suite commerciale) | Solutions intégrées, par priorité |
| 08 Adoption, formation et pilotage dans la durée | HORS AUDIT — export plan de formation (M8.4) + ré-audit/suivi (§6.4) qui outille le pilotage dans la durée | Adoption, KPIs & trajectoire 3 ans |

Les étapes 07-08 apparaissent dans le pilote en « étapes de continuité » (grisées pendant l'audit, activées si le client signe la suite) — le consultant voit ainsi le cycle complet vendu, et l'outil matérialise le tunnel audit → implémentation → formation.

## 20.3 Structure du rapport final — REMPLACE M6.1 (alignée sur la promesse client)
1. Page de garde · 2. Synthèse dirigeant (2 p. : où vous en êtes, où sont les gains, par quoi commencer) · 3. Contexte, périmètre et méthodologie (8 étapes, entretiens menés, NDA) · 4. Cartographie des usages & frictions (par service — heatmap unités × blocs, divergences direction/terrain) · 5. Maturité (radar + benchmarks + drapeaux rouges) · 6. Registre des usages IA & conformité (RGPD, AI Act) · 7. Cartographie des opportunités IA **service par service** (outils et technos conseillés à l'appui — le mot exact de la promesse) · 8. Recommandations chiffrées : une **fiche par action** — gain attendu, coût, délai, complexité, risques, conditions de réussite, prérequis, **chaque action indépendante et actionnable ponctuellement** · 9. **Plan d'action 12 mois, mois par mois**, organisé en **paliers avec temps d'assimilation** entre chaque palier (« on ne passe au suivant que lorsque le précédent est réellement maîtrisé ») — gains identifiés action par action · 10. **Trajectoire à 3 ans** : vision, gouvernance (rôles, principes, comité), KPIs de valeur, points d'ajustement annuels · 11. Plan de formation recommandé (par population : dirigeants, managers, équipes — relié au catalogue Qualiopi, financement OPCO mentionné selon les règles de communication en vigueur) · 12. Annexes.

Modèle de données : `use_cases.status` ajouté (`candidate`/`short_list`/`ecarte`/`retenu`), `use_cases.conditions` TEXT, `roadmap_items(id, mission_id, use_case_id FK NULL, palier INT, month_start, month_end, description, expected_gain, kpi, assimilation_weeks INT)` — le plan 12 mois et la trajectoire 3 ans sont des DONNÉES structurées, pas du texte libre : elles alimentent le rapport ET le suivi du ré-audit (§6.4, findings/remédiation).

## 20.4 Centre d'alertes de l'auditeur — COMPLÈTE §17.3 et §18.4
Icône cloche permanente (badge compteur) sur l'app terrain ET la console. Types d'alerte côté auditeur : unité in_scope sans entretien planifié/réalisé · entretien commencé non terminé depuis > 24 h · à-revoir non levés (par ancienneté) · question critique (`bloquant`) sans réponse · consentement manquant · retard sur le planning (> seuil) · sync en échec ou muette · document demandé non reçu avant la date de visite. Chaque alerte est cliquable → écran de résolution ; une alerte peut être « acquittée avec motif » (journalisé) mais jamais supprimée. Côté admin : les mêmes + agrégées par mission/auditeur (§18.4). Réglage des seuils dans `app_settings`. Aucune notification push intrusive en entretien (règle §17.3) : la cloche s'incrémente en silence.

## 20.5 Finalité réaffirmée du produit (cadrage de la banque de questions)
L'audit cherche systématiquement, pour CHAQUE service : tout ce qui peut être fait pour **introduire ou étendre l'IA et les automatisations** — gains de temps, d'argent, de productivité — ET les **besoins de formation** de chaque population (dirigeants, managers, équipes). Chaque question de la banque doit servir au moins l'une de ces deux sorties (opportunité ou formation) ; c'est le critère d'admission d'une question en banque (ajouté aux règles M1.1).

## 20.6 Pont formation précisé — COMPLÈTE M8.4
Le dispositif de formation Axion-IA prévoit un **questionnaire de positionnement** individuel avant chaque session (niveau IA + tâches réelles du quotidien). L'export M8.4 pré-remplit désormais, par population identifiée à l'audit : niveau initial estimé (bloc 5), tâches dominantes (bloc 2), outils en place (bloc 3-4), cas d'usage retenus les concernant (bloc 6) → la console génère des questionnaires de positionnement pré-contextualisés et des propositions de formation adaptées au cœur de métier (la promesse « à l'issue de l'audit, des formations parfaitement adaptées »). L'évaluation à froid à 30 jours (dispositif formation) pourra être rapprochée des KPIs du plan d'action lors du ré-audit.

## 20.7 Impacts planning
`audit_level` + étiquette `levels` + statuts use_cases + `roadmap_items` + centre d'alertes minimal : +1,5 j (chiffrage historique — la référence de charge unique est dans le 00_INDEX du pack). Toujours jouable pour une collecte du client pilote en octobre : le RDV du 1er septembre est un rendez-vous de découverte (présentation des 3 niveaux + proposition ensuite), la signature puis la collecte suivront — le calendrier réel du client donne l'air nécessaire. Priorité de développement inchangée : L0-L6 (terrain + sync) d'abord.

---


# 21. AVENANT V1.6 — GÉNÉRICITÉ TOTALE ET PLAN D'INDUSTRIALISATION DU CONTENU (CENTAINES DE CLIENTS)
*(27/08/2026. Principe gravé : l'outil est construit pour des centaines de clients de toutes tailles et tous secteurs. Aucune spécificité client dans le produit.)*

## 21.1 Règle de généricité (invariant produit)
**Aucune ligne de code, aucun écran, aucun gabarit, aucune règle ne peut référencer un client.** Tout ce qui varie d'un client à l'autre est une DONNÉE de mission : profil (taille, secteurs, pays), arbre organisationnel, niveau d'audit, périmètre, questions ad hoc, réponses. Test de recette permanent : créer 4 missions types et vérifier que l'outil les sert toutes sans aucune configuration technique : **(a)** TPE artisanale 1-2 p. (racine unique, diagnostic de cadrage, 1 entretien, ~30 q.) ; **(b)** PME multi-établissements 100-150 p. (ex. groupe hôtelier 8 sites : un arbre, palier PME, paquet sectoriel) ; **(c)** ETI industrielle 3 000-6 000 p. multi-sites/multi-pays (arbre usines + services, missions filles par pays, consolidation) ; **(d)** grand groupe hyper-décentralisé 100 000+ p. à entités autonomes (ex. 75 filiales/Maisons à SI indépendants : missions filles PAR ENTITÉ — le mécanisme multi-pays s'applique à l'identique au multi-entités — chacune avec son arbre et ses auditeurs, consolidation groupe au sommet). Ces 4 archétypes couvrent l'ensemble du spectre client. Ce qui a été intégré de la relation le client pilote est la MÉTHODOLOGIE AXION-IA (8 étapes publiques, 3 niveaux, structure du rapport 12 mois + 3 ans) — c'est le standard maison appliqué à tous les clients, pas une adaptation à l'un d'eux.

## 21.2 Plan d'industrialisation de la banque de questions (le vrai actif)
L'outil est le moteur ; la banque est le carburant. Trajectoire de contenu :

| Étape | Contenu | Quand |
|---|---|---|
| C1 | **Socle universel** (~150 q.) : gouvernance, données, outils, compétences, conformité (dont bloc 9 AI Act) — sert TOUS les clients dès la mission 1 | Sept. 2026 |
| C2 | **11 paquets service** (25-40 q. chacun) : RH, finance/compta, commercial, marketing/contenu, service client, logistique/opérations, production, juridique, DSI/data, direction, support — couvre l'immense majorité des services de n'importe quelle entreprise, tous secteurs confondus | Sept.-nov. 2026 (les paquets des services présents chez le client 1 d'abord) |
| C3 | **Variantes par palier** : formulations et profondeur adaptées micro/PME vs ETI/groupe (étiquettes effectif déjà en place) | Au fil de C2 |
| C4 | **Paquets sectoriels** (20-40 q.) : priorisés par le pipeline réel du CRM Pro (secteurs les plus représentés dans la prospection) — industrie/agro, commerce/distribution, services B2B, BTP/artisanat, santé, transport/logistique en premières cibles | 1 paquet / mois dès déc. 2026 |
| C5 | **Amélioration continue** : chaque mission verse ses questions ad hoc qualifiées (M1.1), ses temps réels (abaques M9), ses scores (benchmarks §6.2) — la banque, le chiffrage et les repères s'améliorent à chaque audit, quel que soit le client | Permanent |

Gouvernance du contenu : revue trimestrielle de la banque (questions jamais utilisées → archivage ; questions systématiquement « N/A » → reformulation ou re-étiquetage ; nouveaux usages IA du marché → nouvelles questions). La banque est versionnée et exportable : c'est un actif de propriété intellectuelle d'Axion-IA au même titre que le code.

## 21.3 Ce qui garantit déjà la couverture « centaines de clients »
Rappel des mécanismes en place, tous indépendants du client : paliers de taille (§2.3) · paquets sectoriels activables (§2.3, C4) · paquets service (§16.3) · arbre organisationnel à profondeur libre, de la racine unique au groupe à filiales (§16.2) · périmètre libre — entreprise entière, filiales, établissements ou services choisis (§18.1.1) · 3 niveaux d'audit (§20.1) · multi-pays par missions filles (§2.4) · i18n prête (§6.7) · chiffrage par abaques administrables (§18.1.2) · benchmarks par secteur × palier (§6.2) · mapping offres CRM (§20.1). Capacité : ~200 missions/an à 50 consultants (§11.1) — soit précisément des centaines de clients.

---


# 26. AVENANT V1.8 — DESIGN DES RAPPORTS, AUDITS PARTIELS JUSQU'AU POSTE, FICHE ENTREPRISE 360°
*(V2.9 — copie unique : le texte normatif de §26 (26.1 à 26.5) vit EXCLUSIVEMENT au fichier 03 §26 ; l'ancienne copie intégrale ici est supprimée pour éliminer le risque de deux exemplaires divergents du même numéro de section. Toute modification de §26 se fait au fichier 03.)*

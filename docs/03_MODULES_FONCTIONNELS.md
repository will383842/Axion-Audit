# MODULES FONCTIONNELS

> **Pack d'implémentation Axion Audit — fichier 03/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Spécifications fonctionnelles : modules M1-M9, arbre organisationnel, UX guidée, validation d'étapes, chiffrage, pilotage, console 7 espaces, design system, multi-appareils, monde entier
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 5. SPÉCIFICATIONS FONCTIONNELLES DÉTAILLÉES

## M1 — Back-office d'administration (siège)

Application web réservée aux rôles admin (et analyste en lecture partielle). Accessible uniquement en ligne.

### M1.1 Gestion de la banque de questions

- CRUD complet des questions via formulaire : texte, aide/consigne au consultant (texte affiché sous la question pour guider la relance), type de réponse, options, bloc, ordre dans le bloc.
- **Types de réponse** : oui/non · échelle 1-5 · choix unique · choix multiple · texte libre · nombre · pourcentage · durée (h/semaine) · monnaie (€) · date · tableau simple (lignes libres, ex. inventaire d'outils).
- **Étiquettes** par question : secteurs applicables (multi) · effectif min / effectif max · profils d'interlocuteur visés (dirigeant, DSI, DAF, DRH, responsable métier, salarié terrain…) · périmètre (mono-pays / multi-pays / les deux) · criticité (bloquant / important / informatif).
- **Pondération** : poids de la question dans le score du bloc (défaut 1 ; 0 = hors scoring, ex. questions ouvertes).
- **Logique conditionnelle** _(V2)_ : « afficher si » — une question peut dépendre d'une réponse antérieure (ex. si « Avez-vous un CRM ? » = non → sauter les 6 questions CRM). Modélisée en base (question_id déclencheuse + valeurs déclenchantes), jamais en dur.
- **Versionnage** : une question modifiée après avoir été utilisée crée une **nouvelle version** ; les anciennes réponses conservent la copie du texte saisi au moment de la réponse (décision V1 : snapshot du texte dans la réponse). Statuts : brouillon / active / archivée.
- **Import/export** de la banque en CSV/JSON (injection initiale par script — permet de sauter l'UI M1 les premières semaines, décision prise).
- **Proposition de versement en banque** : quand un consultant a créé une question à la volée en mission, elle apparaît dans une file « à qualifier » ; l'admin l'étiquette et la verse en banque, ou la laisse locale à la mission. Jamais de versement automatique (anti-pollution, décision prise).

### M1.2 Gestion des blocs et référentiels

- CRUD blocs (nom, ordre, description, activable par défaut ou non — le bloc 9 AI Act est activable par mission).
- Référentiels administrables : secteurs, services/fonctions métier (les 11 fonctions de la taxonomie Axion-IA), profils d'interlocuteur, paliers d'effectif.

### M1.3 Gestion des clients et missions

- CRUD entreprises clientes (ou import depuis la console axion-ia.com, §5.8).
- Création de mission : client, périmètre géo (France / multi-pays), palier auto-calculé depuis l'effectif (surchargeable), secteurs activés, blocs activés, consultants assignés, dates prévisionnelles, statut.
- **Missions multi-pays** : bouton « décliner par pays » → crée les missions filles + la mission de consolidation groupe.
- Duplication de mission (repartir d'une mission modèle).

### M1.4 Gestion des utilisateurs

- CRUD utilisateurs, rôles, activation/désactivation immédiate (un consultant qui part = accès coupé + tokens révoqués), réinitialisation mot de passe, journal des connexions.

### M1.5 Gabarits de rapport

- Upload des gabarits DOCX (charte Axion-IA), variables disponibles documentées à l'écran, versionnage des gabarits, gabarit par palier (un rapport Micro ≠ un rapport Grand compte).

## M2 — Moteur de génération de questionnaire

Entrée : profil de mission (palier, secteurs, périmètre, blocs actifs). Sortie : le questionnaire assemblé, figé pour la mission.

Règles d'assemblage :

1. Sélection = questions actives dont les étiquettes matchent (palier dans [min,max], secteur ∈ secteurs activés OU universelle, périmètre compatible, bloc actif).
2. Tri : ordre des blocs → ordre dans le bloc.
3. Répartition par interlocuteur : le questionnaire est projeté en **parcours par profil** (le parcours « dirigeant » ≠ le parcours « salarié terrain »).
4. **Snapshot** : à la création de la mission, les questions sélectionnées sont figées (copie version + texte) dans `mission_questions`. La banque peut évoluer ensuite sans toucher aux missions en cours. Un bouton « resynchroniser le questionnaire » (admin, avec diff affiché) permet d'intégrer volontairement des ajouts.
5. Questions ad hoc : un consultant peut ajouter une question locale à la mission à tout moment (y compris hors ligne) ; elle entre dans la file « à qualifier » (M1.1).

## M3 — Application terrain (PWA offline-first)

### M3.1 Écran d'entretien (cœur de l'outil)

Disposition 3 zones (décision prise) :

- **Gauche** : liste des blocs + progression (x/y répondues, dont « à revoir »), navigation directe.
- **Centre** : UNE question à la fois, gros caractères, consigne consultant, zone de saisie adaptée au type, boutons Précédent/Suivant, raccourcis clavier (↵ suivant, 1-5 pour les échelles).
- **Droite** : notes libres horodatées attachées à la question courante ET bloc-notes général de l'entretien (le plus précieux se dit à côté des questions — décision prise).

Sur chaque question : bouton **« à revoir »** (flag + motif optionnel), bouton « non applicable » (avec motif), ajout de **pièce jointe** (photo — ex. tableau blanc, process affiché en atelier — ou fichier remis par le client), ajout de question ad hoc.

### M3.2 Sessions d'entretien

- « Nouvel entretien » : nom, fonction, service, email (optionnel), date auto. → l'outil filtre le parcours selon le profil.
- Pause / reprise à l'identique (tout est persisté localement en continu, à chaque frappe débouncée).
- **Accord de participation (V2.10 — moment et libellé tranchés)** : case sur l'écran de démarrage de session (y compris au démarrage pré-rempli §34.2 — c'est la SEULE étape humaine restante), libellé « Accord de participation » et non « consentement » (la base RGPD de la collecte est l'intérêt légitime — le libellé ne doit pas suggérer une base consentement), avec une **phrase-script fournie** que l'auditeur lit à l'interlocuteur ; horodatée. L'enregistrement audio (V2, §6.5) exige lui un CONSENTEMENT explicite distinct — là, le mot est le bon.
- Un entretien peut être marqué « terminé » ou rouvert.
- Vue « synthèse mission » sur le terrain : liste des entretiens, complétude par bloc, liste consolidée des « à revoir » (= la liste des zones d'ombre à éclaircir avant de partir — décision prise).

### M3.3 Mode hors ligne

- Au premier chargement de la mission (en ligne), la PWA télécharge : questionnaire figé, référentiels, entretiens existants de la mission. Ensuite : zéro dépendance réseau.
- Indicateur permanent : état réseau, nombre d'éléments en attente de sync, dernière sync réussie.
- Multi-missions embarquées : un consultant peut embarquer plusieurs missions sur sa machine.

### M3.4 Mode papier (dégradé assumé)

- Export PDF du **questionnaire vierge** par parcours d'interlocuteur (cases, lignes de réponse, en-tête mission/entretien) pour impression.
- Écran de **ressaisie rapide** au retour (saisie au kilomètre, navigation 100 % clavier).

## M4 — Moteur de synchronisation (voir spécification complète §9)

## M5 — Consolidation & scoring (siège)

### M5.1 Agrégation

- Par question : toutes les réponses côte à côte avec nom/fonction/service du répondant. Mise en évidence automatique des **divergences** (écart-type sur les échelles, réponses contradictoires sur les oui/non) — notamment **direction vs terrain** (l'or du rapport, décision prise).
- Filtres : par bloc, par service, par site/pays, par interlocuteur.

### M5.2 Scoring de maturité

- Score par bloc = moyenne pondérée des questions scorables (pondération M1.1), normalisé sur 5. Échelle de maturité en 5 niveaux (§2.2).
- Score global + **radar 8-9 axes** (généré en SVG côté siège, injecté dans le DOCX en image).
- Détail du calcul consultable question par question (auditabilité du score — un client peut demander « pourquoi 2,1 en data ? »).

### M5.3 File « à revoir » et complétude

- Tableau de bord de clôture de collecte : questions sans réponse par parcours, « à revoir » non levés, entretiens non terminés. Une mission ne passe « en analyse » que si l'admin force ou si la complétude minimale est atteinte (seuil configurable).

## M6 — Génération du rapport (siège)

### M6.1 Structure du rapport (volumétrie par niveau d'audit — §26.1 fait foi : 12-18 / 25-40 / 40-60 p.)

1. Page de garde (charte Axion-IA) · 2. Synthèse dirigeant (2 pages max) · 3. Contexte et méthodologie (entretiens menés, périmètre) · 4. Radar de maturité + benchmarks (§6.2) · 5. Constats par bloc (1 chapitre / bloc : constats, verbatims anonymisés ou attribués selon consentement, divergences, score) · 6. Registre des usages IA & conformité AI Act (bloc 9) · 7. Cas d'usage détaillés (fiches : gain, coût, complexité, délai, risque) · 8. Matrice de priorisation (3 vagues) · 9. Feuille de route mois par mois (1/2/3/6/12/24 mois selon budget — format déjà défini dans l'offre commerciale Axion-IA) avec chiffrage par action · 10. Plan de formation recommandé (pont Qualiopi, §6.4) · 11. Gouvernance et charte IA · 12. Annexes (détail des scores, inventaires).

### M6.2 Mécanique docxtemplater

- Gabarit DOCX chartée + variables ({{client.nom}}, boucles sur blocs/cas d'usage, images radar/graphiques). Génération dans le worker BullMQ, fichier versionné dans MinIO, téléchargement depuis le back-office.
- Le DOCX est **retouché dans Word** par l'humain (décision prise), puis export PDF au dernier moment (manuel V1, LibreOffice headless V2).
- _(V2)_ Gabarit **PPTX de restitution orale** (15-20 slides) généré depuis les mêmes données — la restitution se fait toujours en réunion, pas seulement par rapport.

### M6.3 Rédaction assistée par IA (règles strictes — décisions prises)

- **Un appel API par bloc**. Entrée : réponses du bloc + scores + divergences + verbatims + gabarit de rédaction (prompt système versionné en base). Sortie : constat rédigé, ton rapport professionnel.
- Le prompt interdit explicitement l'invention ; toute affirmation doit être rattachable aux données fournies.
- Régénération bloc par bloc, indépendante.
- **Trois états par section** : brut (données) / généré (IA) / **validé** (humain). Le rapport final n'assemble que du validé. L'état est visible et journalisé (qui a validé, quand).
- Journal des appels LLM : modèle, tokens, coût, durée (pilotage des coûts — même exigence de traçabilité que les scraper_runs du CRM Pro).
- Option client sensible : bascule vers un modèle hébergé UE (paramètre de mission).

## M7 — Tableau de bord siège (temps réel) — _spécification détaillée et remplacée par la console 7 espaces, §22.3_

- Portefeuille : missions par statut, complétude, dernière sync par consultant, alertes (mission sans sync depuis X jours, « à revoir » en souffrance).
- Vue mission : avancement par bloc et par entretien, carte des sites/pays couverts (multi-pays).
- Statistiques transverses : scores moyens par secteur/palier (alimente les benchmarks §6.2), cas d'usage les plus fréquents (alimente le marketing et les offres packagées Audit Flash / Audit Ciblé du CRM Pro).

## M8 — Intégration écosystème axion-ia.com (EXIGENCE : liaison automatique clients)

L'outil ne vit pas seul : il est relié à la console d'administration axion-ia.com et à Axion CRM Pro.

### M8.1 Référentiel client partagé

- **La console axion-ia.com est maîtresse du référentiel client** (identité, SIREN, contacts, contrats). Axion Audit consomme.
- À la création d'une mission : recherche du client dans la console via API (`GET /api/clients?query=`) → import (id_console conservé en clé étrangère `external_ref`) → création locale seulement si le client n'existe pas encore côté console (avec renvoi de création vers la console — pas de doublon de vérité).
- Synchronisation périodique (job BullMQ) des fiches clients importées.

### M8.2 Déclenchement de mission depuis la console

- Webhook console → Axion Audit : quand un devis d'audit est **signé** dans la console (le cycle commercial devis→encaissement y est déjà automatisé), un événement `audit.commande` crée automatiquement la mission en statut « préparation », pré-remplie (client, périmètre vendu : Audit Flash / Audit Ciblé / Mission PME / Mission ETI / Grand programme — la nomenclature du scoring CRM Pro), et notifie l'admin.

### M8.3 Remontée de statut vers la console

- Webhooks sortants signés (HMAC) : `mission.created`, `mission.status_changed`, `mission.delivered` (+ lien vers le rapport). La console affiche l'état de la prestation dans la fiche client ; le CRM Pro peut déclencher ses séquences post-livraison (upsell implémentation / formation).

### M8.4 Pont formation Qualiopi (bloc 5 → catalogue)

- À la livraison, export structuré du « cahier des charges formation » (bloc 5) : population par service, niveau initial, besoins → transmis à la console pour pré-remplir une proposition de formation (programmes IAF/ADP/IAE… existants). C'est le tunnel audit → formation, cœur du modèle Axion-IA.

### M8.5 SSO

- V1 : comptes locaux Axion Audit (JWT maison). V2 : SSO avec l'annuaire de la console (OIDC) pour ne gérer les consultants qu'à un seul endroit. L'architecture V1 isole l'auth dans un module unique pour rendre ce remplacement indolore.

### M8.6 Contrat d'interface

- Toutes les intégrations passent par des webhooks signés + API REST versionnée (`/v1/`), avec file de retry (BullMQ) et journal des échanges (table `integration_events` : direction, payload, statut, tentatives). Si la console est indisponible, Axion Audit fonctionne en autonomie complète (dégradation gracieuse).

---

# 6. FONCTIONNALITÉS ADDITIONNELLES ISSUES DE LA RECHERCHE

_(Ce qui n'avait pas été dit dans la conception initiale et qui doit entrer au cahier des charges)_

## 6.1 Module Conformité AI Act (bloc 9) — PRIORITAIRE, ARGUMENT COMMERCIAL MAJEUR

Contexte réglementaire (vérifié août 2026) : l'AI Act (Règlement UE 2024/1689) s'applique progressivement — interdictions et obligation de littératie IA (art. 4) depuis février 2025, obligations GPAI depuis août 2025, et **le 2 août 2026 les obligations de transparence de l'article 50 sont entrées en application** (chatbots, contenus générés par IA, deepfakes), tandis que le paquet Omnibus numérique (règlement UE 2026/1744, en vigueur depuis le 27 juillet 2026) a décalé le régime « haut risque » : annexe III reportée au 2 décembre 2027, article 6(1) au 2 août 2028. Les sanctions atteignent 15 M€ ou 3 % du CA mondial pour les manquements de transparence, jusqu'à 35 M€ ou 7 % pour les infractions les plus graves. Toute entreprise utilisant un chatbot, un ATS, un CRM prédictif ou un outil de génération de contenu est « déployeur » au sens du règlement. L'obligation de littératie IA (art. 4, applicable depuis février 2025) est devenue avec l'Omnibus une **obligation de MOYENS** : l'entreprise doit démontrer les mesures prises pour développer la maîtrise de l'IA de ses équipes (plans et preuves de formation) — l'argumentaire commercial Axion-IA (l'audit révèle l'obligation, la formation Qualiopi la couvre) reste entier ; toute formulation « niveau garanti/contrôlé » est proscrite des rapports. Complément V2.2 : le bloc 9 gagne en Phase 2 (L12) une table de correspondance vers **ISO/IEC 42001** (système de management de l'IA) et une référence **NIST AI RMF** — attendues par les directions achats/risques des grands comptes.

Conséquences produit :

- Le bloc 9 outille la constitution du **registre des usages IA** du client : pour chaque système détecté (y compris les usages « sauvages » remontés au bloc 5) — outil, fournisseur, usage, données traitées, service, responsable métier, rôle (déployeur/fournisseur), niveau de risque AI Act (inacceptable / haut risque / risque limité art. 50 / minimal), obligations applicables, état de conformité.
- Sortie rapport : chapitre « Registre IA & conformité » + plan de mise en conformité priorisé.
- **Pont commercial** : la preuve de formation art. 4 = argument direct pour vendre les formations Qualiopi Axion-IA (l'audit révèle l'obligation, la formation la couvre). À intégrer dans l'export M8.4.
- Table dédiée `ai_systems` (registre par mission), exportable en autonomie (le registre vit après l'audit).

## 6.2 Benchmarks inter-missions anonymisés

Chaque mission enrichit une base de scores par secteur × palier. Dès ~10 missions, le rapport positionne le client : « votre maturité data : 2,1/5 — médiane de votre secteur : 2,8 ». Anonymisation stricte (agrégats uniquement, k ≥ 5 missions avant affichage d'un benchmark). C'est un actif concurrentiel qui prend de la valeur à chaque audit.

## 6.3 Pré-audit en ligne auto-administré (V2)

Avant la visite : lien sécurisé (token à durée limitée, sans compte) envoyé au client pour remplir en amont les questions factuelles (effectifs, outils, volumes…). Réutilise le formulaire TPE 8 étapes existant. Gains : temps terrain concentré sur le qualitatif ; pour les TPE, peut constituer l'audit à distance complet (format déjà vendu par Axion-IA). Les réponses pré-remplies sont marquées « déclaratif client » et confirmées en entretien.

## 6.4 Suivi post-audit et ré-audit (V2)

- Statut « clôturée » ≠ fin de relation : planification d'un **ré-audit à 6/12 mois** (rappel automatique, opportunité commerciale récurrente).
- Le ré-audit duplique la mission et affiche la **progression des scores** (avant/après) — la preuve chiffrée de la valeur Axion-IA, exactement ce qui manque au marketing (« aucune preuve chiffrée client disponible à ce jour »).
- Suivi de la feuille de route : chaque action recommandée peut être cochée réalisée/en cours/abandonnée lors du ré-audit.

## 6.5 Enregistrement audio des entretiens + transcription (V2, option par mission)

- Enregistrement local (PWA, MediaRecorder), consentement explicite horodaté obligatoire, upload à la sync, transcription par le worker (modèle STT auto-hébergé ou API UE selon sensibilité), transcription rattachée à l'entretien et exploitable par la génération IA (verbatims).
- Purge automatique des audios à J+X après livraison (paramètre RGPD, défaut 90 jours).

## 6.6 Journal d'audit interne (audit trail) — V1

Table `activity_log` : qui a fait quoi, quand, sur quoi (connexions, création/modification/suppression, validations de sections, exports, accès rapport). Indispensable pour un outil manipulant des données stratégiques de clients grands comptes — et exigible par leurs services achats/sécurité.

## 6.7 Multi-langue (V2)

le client pilote est mondiale : si le périmètre devient multi-pays, les entretiens hors France se feront en anglais minimum. Structure i18n dès la V1 (table `question_translations` prévue au schéma, remplie en V2 ; interface FR d'abord, EN ensuite). Le rapport reste produit en FR (V1) puis EN (V2).

## 6.8 Lettre de mission et émargement (V2)

Génération de la lettre de mission depuis le gabarit (comme les ~35 documents auto-générés de conformité formation côté console) ; feuille de présence des entretiens signable au doigt/souris (grands comptes : la DRH veut la liste des personnes interrogées) ; PV de restitution signé.

## 6.9 Pondération contextuelle des scores et seuils d'alerte (V1 léger)

Questions « bloquantes » (criticité M1.1) : une réponse rouge (ex. « aucune sauvegarde des données ») lève un **drapeau rouge** dans le rapport indépendamment du score moyen — un 3/5 de moyenne ne doit pas masquer un risque majeur. Liste des drapeaux rouges en synthèse dirigeant.

## 6.10 Ce qui a été évalué puis volontairement écarté

- Application native iOS/Android : la PWA couvre le besoin ; réévaluer seulement si besoin d'enregistrement audio > 1 h en arrière-plan sur iPad.
- CRDT/moteurs de sync génériques (ElectricSQL, PowerSync…) : sur-ingénierie pour un modèle append-only par consultant ; la file d'attente maison est plus simple à maîtriser (décision cohérente avec le différenciateur « code propriétaire, pas d'assemblage d'outils tiers »).
- Portail client complet : contraire au positionnement (l'outil est interne) ; seul le pré-audit 6.3 expose une surface client, minimale et à jeton.

---

# 16. AVENANT V1.1 — PROFONDEUR ORGANISATIONNELLE ET AUDIT PAR SERVICE

_(Ajouts issus de la revue comparative avec les plateformes d'assessment et logiciels d'audit interne professionnels — 27/08/2026. Cet avenant PRÉVAUT sur les sections qu'il modifie.)_

## 16.1 Constat

La V1.0 gérait la dimension géographique (missions filles par pays) mais modélisait trop faiblement la structure interne : filiales, établissements multiples, directions et services n'existaient que comme libellés. Pour des audits extrêmement poussés service par service, quelle que soit la structure (mono-établissement de 4 personnes ou groupe à filiales multi-sites de 20 000), trois capacités manquaient : l'arbre organisationnel, les paquets de questions par service, et le scoring par unité.

## 16.2 Arbre organisationnel (`org_units`) — MODIFIE §7

Chaque mission construit (en phase de préparation, modifiable ensuite) l'arbre réel du client, à profondeur libre :

```sql
org_units(id, mission_id FK, parent_id FK NULL,
          kind CHECK IN ('groupe','filiale','etablissement','direction','service','equipe'),
          name, country_code NULL, headcount INT NULL,
          service_ref_id FK services NULL,   -- mapping vers la taxonomie des 11 fonctions métier
          in_scope BOOL DEFAULT true,        -- une unité peut être hors périmètre (documenté)
          position, created_at, updated_at)
```

- **Cas simple** : boulanger 5 personnes → 1 seule unité racine. Zéro friction (l'arbre est optionnel en pratique : une racine est créée par défaut).
- **Cas le client pilote** : groupe → filiales par pays → établissements → directions → services. L'arbre se saisit au cadrage (bloc 1 : l'organigramme collecté SERT à construire l'arbre) ou s'importe (CSV).
- `interviews.org_unit_id FK` **remplace** `site_label` : chaque entretien est rattaché à une unité précise de l'arbre (+ le profil de l'interlocuteur). `ai_systems.org_unit_id` et `use_cases.org_unit_id` ajoutés de même.
- Les missions filles par pays (§2.4) restent pour les grands périmètres multi-pays ; pour une structure nationale à filiales, l'arbre suffit (pas besoin de missions filles). Règle : missions filles = quand des équipes différentes auditent en parallèle des périmètres autonomes ; arbre = structure interne d'un périmètre.

## 16.3 Paquets de questions par service — MODIFIE M1.1 et M2

- Nouvelle étiquette sur les questions : `target_services JSONB` ([] = transverse). La banque comporte désormais, au-dessus du socle : **des paquets par fonction métier** (RH, finance/compta, commercial/ventes, marketing/contenu, service client, logistique/opérations, production, juridique/conformité, DSI/data, direction générale, support/admin — la taxonomie Axion-IA des 11 fonctions), chacun sondant en profondeur : processus détaillés du service, volumes, outils spécifiques, données produites/consommées, irritants, cas d'usage IA propres au service.
- Le moteur M2 croise désormais : palier × secteur × périmètre × **unités in_scope de l'arbre** (les paquets « logistique » ne sont générés que si l'arbre contient une unité logistique) × interlocuteur.
- Objectif de contenu (cible fin 2026) : socle ~150 + 11 paquets service de 25-40 questions + paquets sectoriels. Pour le client pilote (phase 1) : socle + paquets des services réellement présents chez eux.

## 16.4 Scoring par unité et heatmap — MODIFIE M5.2 et M6.1

```sql
unit_scores(mission_id FK, org_unit_id FK, block_id FK, score NUMERIC, answers_count INT,
            computed_at, PRIMARY KEY(mission_id, org_unit_id, block_id))
```

- Score par bloc × unité (roll-up : le score d'une filiale agrège ses établissements, pondéré par effectifs).
- **Heatmap unités × blocs** (vert/jaune/rouge + delta vs moyenne entreprise, tri du plus faible au plus fort) : à l'écran (dashboard M7) et dans le rapport (chapitre 5 enrichi d'une double lecture : par bloc ET par service). Un seuil de fiabilité (answers_count minimal, **défaut 3**, paramétrable via `estimation_params`) évite d'afficher un score sur 1 réponse.
- Les divergences direction vs terrain (M5.1) deviennent calculables par unité (siège vs filiale X, direction vs atelier de l'établissement Y).

## 16.5 Gestion structurée des constats (`findings`) — COMPLÈTE M5/M6

```sql
findings(id, mission_id FK, org_unit_id FK NULL, block_id FK NULL,
         severity CHECK IN ('drapeau_rouge','majeur','mineur','point_fort'),
         title, statement TEXT,                -- le constat, rattaché aux données (answer_ids JSONB)
         recommendation TEXT, owner_suggested,
         remediation_status CHECK IN ('a_traiter','planifie','en_cours','clos','abandonne') DEFAULT 'a_traiter',
         wave CHECK IN ('quick_win','chantier','transformation') NULL,
         created_by FK, created_at, updated_at)
```

- Les drapeaux rouges (§6.9) deviennent des findings de sévérité maximale. Chaque finding est traçable jusqu'aux réponses qui le fondent (exigence d'auditabilité des cabinets professionnels).
- Le rapport (M6.1) génère les chapitres constats DEPUIS les findings validés ; le **ré-audit** (§6.4) rouvre les findings et mesure la remédiation — c'est le suivi « du constat à la clôture » standard du métier, et la preuve chiffrée de valeur pour Axion-IA.

## 16.6 Plan de couverture d'audit — COMPLÈTE M7

Écran « couverture » par mission : pour chaque unité in_scope — nombre d'entretiens menés / prévus, profils rencontrés, complétude des paquets, blocs non couverts. Alerte visuelle sur toute unité in_scope sans aucun entretien. C'est la garantie qu'« chaque service est extrêmement audité » : rien ne peut passer sous le radar sans que ce soit visible et justifié (unité marquée hors périmètre avec motif).

## 16.7 Demandes de documents pré-audit — COMPLÈTE §6.3

```sql
document_requests(id, mission_id FK, org_unit_id FK NULL, label, description,
                  status CHECK IN ('demande','recu','partiel','non_disponible'), attachment_id FK NULL,
                  requested_at, received_at)
```

Liste type par palier (organigramme, cartographie SI, inventaire licences, registre RGPD, exports volumétriques…), suivie à l'écran, relances notées. Les documents reçus sont des `attachments` de mission analysables pendant la phase de préparation.

## 16.8 Impacts sur le plan d'implémentation (Phase 1 ajustée)

- **L3+** (+0,5 j) : table `org_units` + saisie de l'arbre à la création de mission (import CSV inclus) + croisement du moteur M2 avec l'arbre.
- **L5+** (+0,5 j) : rattachement de l'entretien à une unité (sélecteur d'arbre, disponible hors ligne).
- **L7/L8+** (+1 j) : `unit_scores` + heatmap dashboard + écran de couverture + table `findings` (saisie manuelle V1, la génération assistée des findings arrive avec L11).
- `document_requests` → Phase 2 (L13bis). Total Phase 1 : chiffrage historique — la référence de charge unique est dans le 00_INDEX du pack (échéance inchangée : le rapport reste produit à la main en V1).

## 16.9 Étalon de complétude vs marché

Après cet avenant, l'outil couvre le cycle complet attendu d'une plateforme professionnelle — univers d'audit (clients + arbre organisationnel), planification (missions, plan d'entretiens, demandes de documents), terrain (collecte hors ligne, preuves), constats (findings tracés jusqu'aux réponses), scoring multi-niveaux (mission / unité / service, heatmaps), rapport (DOCX assisté IA, états validés), suivi de remédiation (ré-audit) — appliqué au domaine spécifique d'Axion-IA : la maturité et l'opportunité IA, avec en plus le registre AI Act que les outils génériques d'audit interne n'adressent pas.

---

# 17. AVENANT V1.2 — EXPÉRIENCE UTILISATEUR GUIDÉE « ZÉRO FRICTION, ZÉRO OUBLI »

_(Exigence : un consultant junior sans expérience de l'outil doit pouvoir conduire un audit complet correctement, guidé de bout en bout. 27/08/2026.)_

## 17.1 Principe directeur

L'outil ne présente jamais un espace vide ou un menu : il présente **la prochaine action**. À tout moment, chaque écran répond à trois questions : où j'en suis, qu'est-ce qui me reste à faire, quelle est la prochaine étape. Le mode guidé est le mode par défaut ; un mode libre (navigation directe) existe pour les consultants expérimentés — le guidé n'enferme jamais.

## 17.2 Le fil conducteur de mission (« pilote de mission »)

Chaque mission affiche en permanence sa **timeline d'étapes** avec état (fait / en cours / à faire / bloqué) :

```
1. Cadrage        → client relié console · périmètre géo tranché · arbre organisationnel saisi
2. Préparation    → questionnaire généré · plan d'entretiens établi · documents demandés · consentements prêts
3. Collecte       → entretiens (couverture par unité) · à-revoir purgés · pièces jointes montées · sync OK
4. Analyse        → complétude atteinte · scores calculés · divergences revues · findings rédigés
5. Rapport        → sections générées · sections validées · DOCX produit · relu · PDF
6. Livraison      → restitution faite · export formation transmis · ré-audit planifié · mission clôturée
```

Chaque item est **calculé automatiquement** depuis les données (pas de case cochée à la main quand l'état est vérifiable) ; cliquer sur un item incomplet amène directement à l'écran qui le résout. **Jeu de conditions automatiques V1 (V2.9 — une condition dont la fonctionnalité porteuse n'est pas livrée est RÉPUTÉE SATISFAITE, jamais un verrou sur une feature absente)** : Cadrage = périmètre géo tranché + arbre confirmé (« client relié console » s'ACTIVE avec le lot L13) · Préparation = questionnaire généré + plan d'entretiens établi + NDA référencé (« documents demandés » s'ACTIVE avec L13bis) · les conditions Collecte/Analyse/Rapport/Livraison sont déjà calculables en V1 (couverture, à-revoir, export, validation humaine). La checklist de livraison (§15) devient donc VIVANTE dans l'outil, pas un document à côté.

## 17.3 Anti-oubli systémique (garde-fous bloquants et non bloquants)

- **Plan d'entretiens obligatoire en préparation** : pour chaque unité in_scope, l'outil propose les profils à rencontrer selon le palier (généré depuis les règles dimensionnelles) ; le consultant valide/ajuste. La collecte démarre avec une cible chiffrée par unité — l'écran de couverture (§16.6) compare ensuite réel vs plan.
- **Fin d'entretien contrôlée** : au clic « terminer l'entretien », récapitulatif automatique : questions sans réponse (avec saut direct), à-revoir ouverts, consentement manquant. Terminer reste possible (le réel commande) mais l'état est tracé.
- **Fin de visite contrôlée** : action « quitter le site » → synthèse : unités du site sans entretien, à-revoir du site, photos en attente de sync. C'est la traduction outillée de la règle « purger les zones d'ombre avant de partir ».
- **Transitions de statut gardées** : passer « en analyse » ou « livrée » affiche les manques (seuils §M5.3) ; l'admin peut forcer, avec motif journalisé.
- **Rappels passifs** : bandeau discret (jamais de popup en plein entretien) : « 3 à-revoir sur ce bloc », « unité Logistique : 0/2 entretiens ».

## 17.4 Écran d'entretien : friction minimale

- Démarrage d'un entretien en **3 champs** (nom, fonction, unité) — tout le reste est optionnel ou différable.
- Une question par écran, saisie au clavier intégrale (1-5, o/n, ↵, tab), **enregistrement continu** (aucun bouton « sauvegarder » nulle part dans l'application terrain).
- Boutons toujours identiques et aux mêmes places : Précédent · À revoir · N/A · Note · Photo · **Recherche** (hors-parcours §25.4 — **bouton visible : le raccourci / est un accélérateur PC, jamais le seul accès**, V2.10) · Suivant (zone basse droite, atteignable au pouce). **Décision V2.10 : PAS d'avancement automatique après cotation** — coter n'est pas finir une question (la note, l'à-revoir, la photo arrivent APRÈS la cote) ; l'avance est toujours volontaire (Suivant, ↵ ou swipe).
- « Je ne sais pas où la mettre » : bouton **note volante** globale (capture immédiate, rattachement différé) — rien de ce qui se dit ne doit attendre qu'on trouve la bonne case.
- Reprise instantanée : rouvrir l'app = revenir exactement à la question en cours.
- Jamais de jargon interne à l'écran (pas de « mission_questions », « sync push ») : vocabulaire métier français simple.

## 17.5 Prise en main d'un nouveau consultant

- **Mission bac à sable** pré-chargée (client fictif, 2 entretiens à jouer) : un nouveau consultant fait un audit blanc en 1 h avant sa première vraie mission.
- Visite guidée au premier lancement (5 étapes, revisionnable), aides contextuelles « ? » par écran.
- La consigne sous chaque question (M1.1) porte le savoir-faire : questions de relance, pièges, ce qu'un bon auditeur creuse — la banque de questions EST le manuel de formation des consultants.

## 17.6 États vides et messages d'erreur

Chaque état vide dit quoi faire (« Aucun entretien — créez le premier ou consultez le plan d'entretiens »). Chaque erreur dit la cause ET l'action (« Synchronisation en attente : 12 éléments — reprise automatique au retour du réseau, rien à faire »). Aucune erreur technique brute n'atteint l'écran.

## 17.7 Critères d'acceptation UX (recette Phase 1, ajoutés à §13)

1. Un testeur n'ayant jamais vu l'outil crée une mission et termine un entretien fictif **sans aide extérieure ni documentation** en < 30 min.
2. Zéro clic « sauvegarder » sur l'app terrain ; coupure de courant en pleine saisie = zéro perte à la réouverture.
3. Toute donnée attendue non collectée est visible sur au moins un écran de contrôle (couverture, fin d'entretien, fin de visite, transition de statut) — test : retirer volontairement 3 éléments d'une mission témoin, vérifier que les 3 sont signalés.
4. Navigation complète d'un entretien au clavier seul.
5. Impact planning : +1,5 j sur L5/L7 (pilote de mission, garde-fous, bac à sable) (chiffrage historique — référence de charge unique : 00_INDEX), échéance inchangée.

---

# 18. AVENANT V1.3 — MODULE CADRAGE-CHIFFRAGE (M9), RÉPARTITION MULTI-AUDITEURS ET PILOTAGE AVANCE/RETARD

_(27/08/2026. L'outil se structure désormais officiellement en DEUX parties : Partie A = cadrage & chiffrage (avant-vente, alimente le devis) · Partie B = réalisation de l'audit. Cet avenant prévaut sur les sections qu'il modifie.)_

## 18.1 M9 — Cadrage & chiffrage (Partie A, avant-vente)

### 18.1.1 Formulaire de cadrage

Saisi lors du premier échange commercial (par l'admin, ou pré-rempli par le prospect via le pré-audit en ligne §6.3) :

- Entreprise : effectif, secteurs, nombre de filiales / établissements / pays.
- **Étendue de l'audit** : entreprise complète · certaines filiales · certains établissements · certains services / secteurs d'activité seulement. Concrètement : construction d'une première version de l'arbre organisationnel (§16.2) avec cases in_scope — le même arbre servira ensuite à l'audit (rien n'est ressaisi).
- Contraintes : périmètre géo, langues, déplacements (nb de sites à visiter, distances), disponibilité des interlocuteurs, échéance souhaitée par le client.

### 18.1.2 Moteur d'estimation de charge

À partir du cadrage, l'outil calcule automatiquement :

```
Charge (j-h) = préparation (abaque par palier)
             + Σ entretiens prévus × durée-type par profil (abaques)
             + temps de déplacement (nb sites × abaque)
             + analyse & consolidation (abaque par bloc actif × volume)
             + rédaction rapport (abaque par palier)
             + restitution
```

- Le **plan d'entretiens prévisionnel** est généré depuis l'arbre in_scope + les règles dimensionnelles (§17.3) → nb d'entretiens par unité et par profil. C'est LA base objective du chiffrage.
- **Abaques 100 % administrables** (table `estimation_params`) : durée d'un entretien dirigeant (1 h 30), responsable (1 h), salarié (45 min), analyse par bloc, etc. Les abaques s'affinent mission après mission grâce aux temps réels mesurés (§18.3) — le chiffrage devient plus précis à chaque audit (actif d'apprentissage, comme les benchmarks).

### 18.1.3 Simulateur d'équipe

- L'outil propose **l'équipe idéale** : nb d'auditeurs recommandé = f(charge totale, échéance client, contrainte de parallélisme réel — les entretiens d'un même petit site ne se parallélisent pas à l'infini, facteur de coordination +10 %/auditeur au-delà de 2).
- **Curseur interactif** : l'admin choisit le nombre d'auditeurs → l'outil recalcule la durée calendaire (et inversement : je veux tenir 3 semaines → il faut 3 auditeurs). Chaque scénario est enregistrable et comparable.
- Cohérence avec les règles de dimensionnement commerciales déjà définies par Axion-IA (1 spécialiste TPE, 1-2 PME, 2-N ETI/grands comptes) : ces règles servent de bornes par défaut aux recommandations.

### 18.1.4 Devis

- Le scénario retenu (jours × équipe) est valorisé : `TJM` par profil d'auditeur (table admin, **chiffres financiers visibles UNIQUEMENT par le rôle admin**) + frais estimés → montant du devis.
- **Poussé vers la console axion-ia.com** (M8) qui reste maîtresse du cycle commercial : la console émet le devis officiel ; à la signature, le webhook `audit.commande` (M8.2) transforme le cadrage en mission réelle — arbre, plan d'entretiens et planning prévisionnel déjà en place. Zéro ressaisie entre l'avant-vente et le terrain.

```sql
scoping_estimates(id, company_id FK, mission_id FK NULL,   -- lié à la mission dès conversion
    scope_tree JSONB, planned_interviews JSONB,
    workload_days NUMERIC, team_size INT, calendar_days INT, scenario_label,
    daily_rates JSONB, travel_costs NUMERIC, total_amount NUMERIC,   -- champs financiers : admin only (RBAC colonne/route)
    status CHECK IN ('brouillon','envoye_console','signe','abandonne'),
    created_by FK, created_at, updated_at)
estimation_params(key PRIMARY KEY, value NUMERIC, unit, description, updated_by FK, updated_at)
```

## 18.2 Répartition de l'audit entre plusieurs auditeurs — MODIFIE §16.6 et M3

```sql
work_assignments(id, mission_id FK, user_id FK, org_unit_id FK,
                 planned_interviews INT, planned_days NUMERIC,
                 date_from, date_to, PRIMARY KEY-like UNIQUE(mission_id, user_id, org_unit_id))
```

- L'admin répartit les unités de l'arbre (et donc leurs entretiens prévus) entre les auditeurs, avec dates. Un même site peut être partagé (répartition par profils d'interlocuteurs).
- **Vue terrain filtrée** : chaque auditeur voit par défaut SON périmètre (ses unités, son plan, sa progression) ; le reste de la mission est consultable en lecture (coordination) mais son tableau de bord personnel ne porte que sur sa part.
- L'écran de couverture (§16.6) devient croisé : unité × auditeur × prévu × réalisé.
- La sync multi-auditeurs était déjà garantie sans conflit par construction (§9.4) : chaque entretien appartient à un auditeur.

## 18.3 Suivi avance / retard (temps réel)

- Le planning prévisionnel (issu de M9) définit une **courbe de référence** : entretiens cumulés attendus par jour ouvré (par mission ET par auditeur).
- La sync continue alimente le **réalisé** : entretiens terminés, blocs complétés. L'outil calcule l'écart en jours : `EN AVANCE (+1,5 j)` · `À L'HEURE` · `EN RETARD (−2 j)` + projection de la date de fin à rythme constant.
- Les durées réelles des entretiens (horodatage début/fin, déjà collecté) nourrissent les abaques (§18.1.2).
- **Visibilité par rôle (exigence ferme)** : l'auditeur voit son avance/retard, son plan, ses dates — il ne voit JAMAIS le TJM, les montants, ni le devis (RBAC : routes et colonnes financières réservées admin ; testé explicitement en recette §13).

## 18.4 Console de pilotage siège — REMPLACE ET RENFORCE M7

Écran d'accueil admin = **tour de contrôle** :

- **Vue portefeuille** : toutes les missions en cours, chacune avec : client, statut, jauge d'avancement, badge avance/retard (vert/orange/rouge), auditeurs assignés, dernière sync par auditeur, alertes (sync muette > 48 h, retard > seuil, couverture en risque, à-revoir en souffrance).
- **Vue par auditeur** : charge en cours et à venir (toutes missions confondues — plan de charge de l'équipe), performance de rythme (réalisé vs prévu), disponibilités pour affecter les prochaines missions.
- **Vue mission détaillée** : timeline du pilote (§17.2), heatmap unités × blocs, couverture × auditeur, courbe prévu/réalisé, findings, journal de sync.
- Drill-down partout ; export du tableau de pilotage (PDF hebdo automatique par email interne en option V2).

## 18.5 Impacts plan d'implémentation

- **Phase 1 (+2 j — chiffrage historique, référence de charge unique : 00_INDEX ; échéance le client pilote tenue)** : `estimation_params` + calcul de charge + simulateur simple + plan d'entretiens prévisionnel (nécessaire de toute façon pour §17.3) + `work_assignments` + badge avance/retard mission + RBAC financier. Le devis le client pilote peut ainsi être produit AVEC l'outil dès septembre.
- **Phase 2** : push devis → console (avec M8), courbes prévu/réalisé détaillées par auditeur, apprentissage des abaques, plan de charge d'équipe, rapport de pilotage hebdo.

---

# 19. AVENANT V1.4 — WORKFLOW À VALIDATION D'ÉTAPES ET DESIGN SYSTEM

_(27/08/2026. Complète §17 (UX guidée). Prévaut sur les points qu'il modifie.)_

## 19.1 Workflow à validation d'étapes (passage à niveau obligatoire)

Le pilote de mission (§17.2) devient un **workflow verrouillé** : l'étape N+1 est inaccessible tant que l'étape N n'est pas VALIDÉE. Une validation = deux conditions cumulées :

1. **Conditions automatiques remplies** (calculées par l'outil, §17.2) — ex. pour valider « Préparation » : questionnaire généré ✓, plan d'entretiens établi ✓, arbre organisationnel confirmé ✓.
2. **Validation humaine explicite** : bouton « Valider cette étape » + récapitulatif de ce qui a été fait, horodaté et journalisé (qui, quand). L'auditeur s'engage sur la complétude de son étape — c'est aussi un outil de responsabilisation et de qualité homogène entre 50 consultants.

Granularité de la validation pendant la collecte (l'étape la plus longue) :

- **Fin d'entretien** : validation de l'entretien (récapitulatif §17.3 → « Valider l'entretien ») ; un entretien validé est verrouillé en modification (correction possible via révision tracée uniquement).
- **Fin d'unité** : quand toutes les cibles d'une unité sont atteintes → « Valider l'unité [Service X] » (les à-revoir de l'unité doivent être levés ou motivés).
- **Fin de collecte** : toutes les unités du périmètre de l'auditeur validées → l'étape Collecte se valide, la mission peut passer en Analyse.

**Règle V2.10 — TERMINER ≠ VALIDER (deux gestes, deux moments — jamais fusionnés)** : « **Terminer l'entretien** » est le geste À CHAUD de fin de rencontre (récapitulatif §17.3, état `termine`) — l'entretien reste **ROUVRABLE librement par son auteur** tant qu'il n'est pas validé : la note de couloir dix minutes après a sa place, sans révision ni paperasse. « **Valider l'entretien** » est le geste QUALITÉ qui verrouille (§19.1 — toute modification ultérieure = révision tracée), typiquement posé **en fin de journée** depuis la synthèse mission, où la **validation GROUPÉE** est possible (les entretiens terminés du jour cochés → une seule confirmation, un seul récapitulatif cumulé). Le verrou de qualité est conservé intégralement — il est juste posé au bon moment.

Règles de souplesse (le réel commande, mais tracé) :

- **Deux profils d'usage par utilisateur** (réglé par l'admin) : `guidé strict` (défaut pour tout nouvel auditeur : étapes verrouillées, aucune dérogation) · `expert` (les verrous deviennent des garde-fous contournables avec motif obligatoire, journalisé).
- **Déverrouillage admin** : l'admin peut toujours débloquer une étape à distance (cas de force majeure terrain), avec motif ; visible dans le journal de mission.
- Aucun verrou ne peut jamais bloquer la SAISIE de données (on peut toujours créer un entretien, noter, photographier) — les verrous portent sur la PROGRESSION d'étapes, pas sur la collecte. Un imprévu terrain ne doit jamais empêcher de capturer de l'information.

Interface : chaque étape verrouillée affiche PRÉCISÉMENT ce qui manque pour la déverrouiller (liste cliquable), jamais un simple cadenas muet.

## 19.2 Design system « Axion Audit »

**Identité.** Charte Axion-IA appliquée : ivoire `#faf8f3` (fonds), mocha `#2a2520` (textes), terracotta `#c24a1b` (actions principales, progression, identité), bleu `#1a4dd9` (informations, liens, états système). Sémantique : vert succès/validé, ambre attention/à-revoir, rouge retard/drapeau. Le terracotta est réservé à l'action et à l'accomplissement — jamais utilisé pour l'alerte (pas d'ambiguïté rouge/terracotta : l'alerte est un rouge franc distinct).

**Style.** Moderne, chaleureux, épuré : interfaces claires sur ivoire, cartes à coins arrondis et ombres douces, une seule action principale terracotta par écran, typographie Inter (UI) avec chiffres tabulaires pour les scores et durées, iconographie Lucide, espaces généreux. Pas de skeuomorphisme, pas de dégradés criards, pas d'animations gratuites — micro-transitions sobres (150-200 ms) qui confirment l'action (validation d'étape = coche animée + étape suivante qui se déploie).

**Visualisation de données** (l'outil est visuel par nature) : anneaux de progression (mission, unité, entretien), timeline verticale du pilote avec états colorés, heatmap unités × blocs interactive, radar de maturité, courbe prévu/réalisé avec zone d'avance/retard colorée, badges de statut uniformes partout (même vocabulaire visuel du terrain à la console de pilotage).

**Composants.** Bibliothèque unique partagée (`packages/ui`) : shadcn/ui + Tailwind (tokens de la charte), réutilisée par l'app terrain ET la console siège — cohérence totale, maintenance unique. Chaque composant a ses états définis : défaut, survol, focus visible, chargement, vide, erreur.

**Ergonomie terrain spécifique.** Mode entretien = plein écran sans distraction (chrome minimal, question au centre, saisie immédiate) ; cibles tactiles ≥ 44 px (prêt pour la tablette) ; contraste WCAG AA minimum ; navigation clavier intégrale (§17.4) ; état réseau/sync toujours visible mais discret (pastille, jamais de bannière anxiogène) ; mode sombre en V2 (les entretiens en atelier sombre existent).

**Gouvernance.** Le SKILL frontend-design + les tokens de la charte sont fournis à Claude Code à chaque lot d'interface ; aucune couleur ou taille en dur dans le code (tokens uniquement) ; une page « /design » interne (storybook léger) montre tous les composants — c'est la référence de recette visuelle.

## 19.3 Critères d'acceptation ajoutés (§13)

1. Impossible d'atteindre l'étape Analyse avec un entretien non validé en profil `guidé strict` ; possible en `expert` uniquement avec motif saisi et journalisé.
2. Toute étape verrouillée liste ses conditions manquantes, chacune cliquable vers l'écran de résolution.
3. Un entretien validé ne peut être modifié que par révision tracée.
4. Audit visuel de recette : zéro couleur hors tokens, contraste AA vérifié (axe-core en CI), focus visible sur 100 % des éléments interactifs.
5. Le test « testeur novice < 30 min » (§17.7) se fait en profil `guidé strict`, sans aucune dérogation admin.

Impact planning : +1 j (machine à états de validation + page /design) (chiffrage historique — référence : 00_INDEX). Échéance le client pilote : toujours tenable (l'app terrain et le noyau restent la priorité ; la console de pilotage complète peut glisser d'une semaine sans impacter la collecte).

---

# 22. AVENANT V1.7 — MULTI-APPAREILS DÈS LA V1, AUDITS MONDE ENTIER, ET CONSOLE D'ADMINISTRATION PROFESSIONNELLE (SPÉCIFICATION DÉTAILLÉE)

_(27/08/2026. Prévaut sur §4, §11, §18.4 et le phasage tablette.)_

## 22.1 Multi-appareils : tablette ET ordinateur dès la Phase 1 — MODIFIE la décision « tablette plus tard »

La PWA est par nature multi-appareils : la MÊME application terrain s'installe et fonctionne sur ordinateur (Windows/Mac, Chrome/Edge) et sur tablette (iPad Safari ≥ 16.4, Android Chrome), en ligne comme hors ligne. La décision antérieure de reporter la tablette est **remplacée** par : support tablette dès la Phase 1, garanti par construction (design responsive, cibles tactiles ≥ 44 px déjà spécifiées §19.2, saisie tactile des échelles et choix par gros boutons, clavier virtuel géré sans masquer la zone de saisie). **Hiérarchie des cas (V2.6) : l'iPad/Safari est volontairement la CIBLE LA PLUS DURE** (règles de stockage les plus restrictives du marché, PWA la plus contrainte) — ce qui passe la recette iPad passe partout ailleurs ; Android/Chrome est un cas PLUS FACILE (installation PWA native, persistance du stockage plus permissive) : supporté par construction, il entre dans la matrice de recette au premier appareil Android réellement mis en service (aujourd'hui le parc = ton PC + ton iPad).

- Recette Phase 1 étendue : le parcours entretien complet (dont mode avion) est validé sur iPad ET sur portable.
- Limites documentées : sur iPad, l'installation « Sur l'écran d'accueil » est requise pour la persistance longue durée d'IndexedDB (procédure d'installation guidée fournie dans l'outil) ; l'espace local est vérifié au chargement d'une mission (alerte si quota insuffisant pour les pièces jointes prévues).
- Continuité d'appareil : un auditeur peut préparer sur ordinateur et auditer sur tablette — les entretiens étant rattachés à son compte, la sync fait suivre le travail d'un appareil à l'autre (le travail non synchronisé reste local à l'appareil qui l'a saisi, indicateur clair par appareil).
- En ligne : la remontée vers la console est CONTINUE (sync §9, cadence 30 s) — le siège voit l'entretien progresser quasi en direct. Hors ligne : tout est capté localement et remonte intégralement au retour du réseau. Aucune différence fonctionnelle entre les deux modes pour l'auditeur.

## 22.2 Audits dans le monde entier (interface en français)

- **Fuseaux horaires** : tous les horodatages stockés en UTC (TIMESTAMPTZ, déjà le cas) + `missions.timezone` et `org_units.timezone` (héritage arbre). Affichage console : heure locale du site audité AVEC heure de Grenoble entre parenthèses (« Entretien terminé à 16 h 40 heure de Singapour — 10 h 40 à Grenoble »). Le suivi avance/retard (§18.3) calcule en jours ouvrés du fuseau de la mission. L'horloge locale déréglée d'un appareil est déjà neutralisée par l'offset serveur estimé (§9.2).
- **Réseaux dégradés mondiaux** : payloads de sync compressés (gzip), lots adaptatifs (réduction automatique de la taille des lots si le débit est faible), reprise d'upload par chunks déjà spécifiée (§9.6), aucun timeout agressif. Un audit à l'autre bout du monde avec une 3G intermittente doit synchroniser aussi sûrement qu'à Grenoble — juste plus lentement.
- **Langue** : interface 100 % en FRANÇAIS pour les auditeurs (V1 et suivantes) — les équipes Axion-IA travaillent en français partout dans le monde. L'i18n (§6.7) reste réservée au CONTENU (questions traduites pour interroger des interlocuteurs non francophones, V2) — jamais une condition pour déployer l'outil à l'étranger.
- Formats : dates JJ/MM/AAAA, montants en €, mais champ devise sur les données financières collectées (CA d'une filiale étrangère saisi dans sa devise, conversion indicative au rapport).
- Souveraineté : données hébergées UE (Hetzner) quel que soit le pays audité — mentionné dans la fiche sécurité client (§10.5) ; vigilance contractuelle pour les pays à exigence de localisation des données (Chine, Russie) : clause d'exclusion ou traitement au cas par cas.

## 22.3 Console d'administration — spécification professionnelle détaillée (REMPLACE §18.4)

La console (`apps/hq`) est le poste de commandement du siège. Sept espaces :

**1. Tour de contrôle (accueil)** — Vue portefeuille temps réel : cartes mission (client, niveau d'audit, statut, jauge, badge avance/retard vert/orange/rouge, auditeurs avec pastille de dernière sync, prochaine échéance) ; filtres (statut, auditeur, pays, niveau, retard) ; tri par risque ; bandeau d'alertes agrégées (§20.4) ; carte du monde des missions actives (les audits internationaux se VOIENT). Chiffres clés : missions actives, entretiens cette semaine, retards, rapports en attente de validation.

**2. Pilotage mission** — Timeline 8 étapes (§20.2) avec validations ; couverture unité × auditeur (prévu/réalisé) ; heatmap unités × blocs ; courbe prévu/réalisé ; flux d'activité en direct (« 10 h 12 — entretien Resp. logistique terminé, site de Lyon ») ; à-revoir et alertes de la mission ; journal de sync par auditeur/appareil ; actions : réaffecter des unités, ajuster le planning, déverrouiller une étape (motif), relancer un document.

**3. Équipe & plan de charge** — Fiche par auditeur : missions en cours/à venir, charge (j-h) sur 8 semaines glissantes, rythme réel vs prévu, historique ; vue calendrier de l'équipe (affectations, déplacements, conflits d'agenda) ; affectation par glisser-déposer ; profil guidé strict / expert (§19.1) ; gestion des comptes et révocations.

**4. Chiffrage & devis** (admin seul, §18.1) — Cadrages en cours, simulateur d'équipe, scénarios comparés, envoi console commerciale, taux de conversion cadrage→signature, précision des estimations (estimé vs réalisé par mission — la boucle d'apprentissage des abaques rendue visible).

**5. Contenu** (banque de questions, M1) — Édition, étiquettes, versions, file « à qualifier », statistiques d'usage des questions (jamais posée / souvent N/A / souvent à-revoir → candidates à révision, §21.2), import/export.

**6. Analyse & rapports** — Espace de consolidation par mission (agrégation, divergences, findings, use cases, roadmap 12 mois/3 ans) ; atelier de rédaction assistée (sections brut/généré/validé, coûts LLM) ; génération DOCX/PPTX ; bibliothèque des rapports livrés ; benchmarks transverses (§6.2) et statistiques du cabinet (scores moyens par secteur, cas d'usage récurrents — matière marketing).

**7. Administration système** — Utilisateurs & rôles, paramètres (`app_settings`, abaques, seuils d'alerte), intégrations console/CRM (santé des webhooks, rejeu), journal d'audit interne, purges RGPD, état des sauvegardes (dernier test de restauration), santé plateforme (files, disque, sync en échec).

Transversal : recherche globale (client, mission, auditeur, question) ; fil d'ariane constant ; chaque écran exportable (CSV/PDF) ; performance cible < 1,5 s par écran à 200 missions/an d'historique ; design system §19.2 ; français intégral.

## 22.4 Impacts planning

Tablette validée en recette Phase 1 : +0,5 j (tests iPad). Fuseaux horaires (colonnes + affichage) : +0,5 j. La console complète à 7 espaces se construit progressivement : Phase 1 = espaces 1, 2 (essentiel), 7 (minimal) ; Phase 2 = 3, 4, 5, 6. (chiffrage historique — référence de charge unique : 00_INDEX) — priorité inchangée : terrain + sync d'abord, la console s'étoffe pendant que les premières collectes tournent.

---

# 25. CORRECTIONS ISSUES DE LA RECETTE EN CONDITIONS RÉELLES (27/08/2026) — APPLIQUÉES

_(Le rapport de recette en conditions réelles n'est pas joint au pack : ses conclusions — constats N1-N8 d'une simulation d'exploitation d'une semaine — sont intégralement reprises ici.)_

## 25.1 Recalage de mission post-cadrage (N2 — Phase 2 ; processus manuel documenté pour la mission 1)

À la validation de l'étape Cadrage : comparaison automatique plan VENDU (scoping_estimate signé) vs plan RÉEL (arbre et entretiens après cadrage) — écart en entretiens et en jours, visible ADMIN SEUL. Trois issues tracées dans `mission_rebaselines(id, mission_id, delta_interviews, delta_days, decision CHECK IN ('absorbe','avenant','descope'), note, decided_by, decided_at)` : absorber / avenant commercial (événement poussé vers la console) / réduction de périmètre (unités `in_scope=false` avec motif). **Devenir des données d'une unité sortie du périmètre (règle V2.2)** : les sessions et réponses déjà collectées sont CONSERVÉES, exclues du scoring et de la couverture, et listées au rapport en annexe « périmètre réduit » ; les findings rattachés sont conservés avec mention. Le suivi avance/retard se recale sur le plan validé post-cadrage.

## 25.2 Agenda d'entretiens (N4 — noyau strict, version simple)

`interviews` gagne : `scheduled_at TIMESTAMPTZ NULL, scheduled_duration_min INT NULL, schedule_status CHECK IN ('a_planifier','planifie','confirme','realise','reporte','annule') DEFAULT 'a_planifier'`. Saisie hors ligne, liste par jour partagée entre auditeurs de la mission, visible au siège ; la courbe avance/retard utilise les dates planifiées quand elles existent. Détection de chevauchement même interlocuteur (avertissement, non bloquant).

## 25.3 Proposition d'unité depuis le terrain (N1 — noyau strict)

`org_units.status CHECK IN ('active','proposee','fusionnee') DEFAULT 'active'` + `proposed_by FK NULL` + UUID client. Un auditeur crée hors ligne une unité `proposee` (nom, type, rattachement supposé, effectif estimé, note) et y rattache immédiatement des entretiens. À la sync : alerte au lead/admin → valider (devient `active`, entre dans la couverture et le scoring) ou fusionner avec une unité existante (`fusionnee` + `merged_into_id` ; les entretiens sont re-rattachés automatiquement). Amendement de la règle §9.5 : le terrain ne MODIFIE jamais les entités siège, mais peut PROPOSER (unités, questions ad hoc) — le siège qualifie.

## 25.4 Question hors parcours (N3 — noyau strict)

En entretien : recherche plein texte dans TOUTES les questions figées de la mission (locale, hors ligne). La réponse est enregistrée sur l'entretien courant avec `answers.hors_parcours BOOL DEFAULT false → true`. Disponible en guidé strict (ce n'est pas une dérogation au workflow : c'est le geste normal d'un auditeur qui suit son interlocuteur). L'agrégation M5.1 affiche ces réponses avec leur badge.

## 25.5 Point d'étape (N5 — Phase 2)

Export DOCX court « Point d'étape » (gabarit dédié `report_templates.kind='point_etape'`) : périmètre, couverture réalisée par unité, calendrier tenu/écarts, thèmes émergents (titres de findings `brouillon` sélectionnés à la main). RÈGLE MÉTIER GRAVÉE dans le gabarit : jamais de scores ni de recommandations avant consolidation complète.

## 25.6 Compléments légers (noyau strict / Phase 2)

- **N6** : `interviews.type CHECK IN ('sur_site','distanciel','complementaire') DEFAULT 'sur_site'` + `linked_review_answer_id NULL` — l'entretien complémentaire lève un à-revoir : réponse initiale révisée (revision tracée), flag levé avec référence.
- **N7 (Phase 2)** : apprentissage des abaques sur la MÉDIANE par type d'entretien, exclusion > P90, mise à jour PROPOSÉE à l'admin avec échantillon visible — jamais automatique.

## 25.7 Backlog V2 assumé (N8)

Commentaires internes par mission/entretien (fil de coordination) ; gestion des absences dans le plan de charge. Décision : PAS en V1 — les canaux internes existants (WhatsApp/Telegram) suffisent à 1-3 consultants, et chaque brique ajoutée menace l'échéance.

## 25.8 Impact planning

N1 + N3 + N4 simple + N6 dans le noyau strict : +1,5 j (chiffrage historique — référence : 00_INDEX). N2, N5, N7 en Phase 2. Échéance le client pilote : tenable.

# 26. AVENANT V1.8 — DESIGN DES RAPPORTS, AUDITS PARTIELS JUSQU'AU POSTE, FICHE ENTREPRISE 360°

_(27/08/2026. Prévaut.)_

## 26.1 Conformité des rapports à la promesse axion-ia.com — CONFIRMÉE ET NORMÉE

Le rapport (structure §20.3) reprend exactement les livrables promis sur la page audit publique : rapport structuré (constats, hypothèses, risques, recommandations) · cartographie des opportunités IA service par service, outils et technos conseillés à l'appui · feuille de route priorisée (par quoi commencer, quand, avec quelles ressources) · recommandations chiffrées (ROI) · plan d'action mois par mois selon le budget. **Volumétrie normée par niveau** : diagnostic de cadrage 12-18 p. · audit opérationnel 25-40 p. · audit stratégique groupe 40-60 p. Règle : la pagination découle du nombre d'unités auditées et d'actions recommandées, jamais du remplissage ; la synthèse dirigeant ne dépasse JAMAIS 2 pages. **(V2.9)** La section benchmarks (§6.2) est CONDITIONNELLE : tant que la base k ≥ 5 n'existe pas (missions 1 à ~10), le chapitre Maturité s'écrit SANS positionnement marché (mention « repères sectoriels disponibles à partir de N missions ») — jamais de comparaison inventée.

## 26.2 Design system des RAPPORTS (gabarits DOCX/PDF — complète §19.2)

- **Identité** : charte Axion-IA — couverture ivoire avec bandeau terracotta, titre de mission, client, période, niveau d'audit, mention de confidentialité ; pied de page : logo + « Confidentiel — [Client] » + pagination X/Y ; interdit d'utiliser le terracotta pour signaler un risque (rouge distinct, comme dans l'outil).
- **Typographie** : titres en gras mocha hiérarchisés (3 niveaux max), corps sobre et aéré (interlignage généreux), chiffres tabulaires dans les tableaux. Sommaire automatique cliquable (PDF), en-têtes de chapitre sur page nouvelle avec numéro de bloc.
- **Éléments visuels normés** (générés par l'outil, insérés en PNG 2x) : radar de maturité pleine page · heatmap unités × blocs · matrice impact/effort des actions · **timeline visuelle du plan 12 mois** (paliers colorés, temps d'assimilation hachurés) · jauges de score par bloc en tête de chapitre. Chaque visuel a sa légende et sa source (« d'après N entretiens, M unités »).
- **Fiches action** : encart normé d'1 page max par action — bandeau titre, 6 cartouches (gain, coût, délai, complexité, risque, prérequis), conditions de réussite en liste courte, vague (quick win / chantier / transformation) en badge couleur.
- **Drapeaux rouges** : encadré rouge normé, repris en synthèse dirigeant.
- **Verbatims** : cités en italique, anonymisés (« un responsable de production »), jamais plus de 2 par page.
- Un **gabarit maître** par niveau d'audit + le gabarit « point d'étape » (§25.5) ; tous versionnés dans l'outil (M1.5), maquettés une fois dans Word aux couleurs exactes de la charte puis remplis par docxtemplater.

## 26.3 Audit partiel jusqu'au POSTE — MODIFIE §16.2

`org_units.kind` gagne la valeur **`poste`** (sous `service`/`equipe`). Une mission peut donc porter sur : l'entreprise entière · des filiales · des établissements · des services · **un poste unique** (ex. « gestionnaire ADV », « accueil client ») — typiquement en niveau diagnostic ciblé : 2-4 entretiens (titulaire(s) du poste + son responsable), paquet de questions du service parent + questions transverses, rapport court centré sur les gains du poste. Le chiffrage (M9) gère nativement ce cas (peu d'entretiens → petit devis → prestation d'entrée de gamme et porte d'entrée commerciale).

## 26.4 Fiche entreprise 360° — COMPLÈTE la console (§22.3, nouvel écran de l'espace 1)

Pour chaque entreprise cliente : **historique de toutes les missions** (dates, niveaux, périmètres, statuts, rapports livrés téléchargeables) · **évolution des scores** entre audits successifs (courbes par bloc — la preuve chiffrée de la valeur Axion-IA) · **couverture cumulée** : unités/services déjà audités vs jamais audités (radar d'upsell : « logistique auditée en 2026, finance jamais ») · suivi de la remédiation des findings d'un audit à l'autre · prochaine échéance de ré-audit + relance planifiée · contacts clés rencontrés (fonctions) · synchronisation avec la fiche client de la console axion-ia.com (external_ref). Les audits complémentaires d'un même client sont donc le parcours NORMAL du produit : chaque nouvelle mission hérite du contexte (arbre déjà construit, réutilisable et ajustable ; documents déjà reçus signalés).

## 26.5 Impact planning

Gabarits maquettés (design rapports) : travail de maquette Word (2 j, non-code, parallélisable) + fiche 360° et kind `poste` : Phase 2 (+1 j). Noyau strict : voir la référence de charge unique (00_INDEX).

# 27. AVENANT V1.9 — COLLECTE MULTI-SOURCES (AU-DELÀ DES ENTRETIENS), CARTOGRAPHIE COMPLÈTE, ET GESTION DES INFORMATIONS NON COMMUNIQUÉES

_(27/08/2026. Corrige un biais structurel : le modèle était trop entretien-centrique. Prévaut sur M3, M5 et §7 pour les points modifiés.)_

## 27.1 Les 5 sources de collecte d'un audit — GÉNÉRALISE la table `interviews` en SESSIONS DE COLLECTE

Un audit comprend, service par service, cinq types de sessions (la table `interviews` devient conceptuellement `collecte` ; techniquement : extension de `interviews.type`, champs personne rendus optionnels) :

| Type                                                 | Ce qu'on fait                                                                  | Ce que l'outil affiche                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entretien` (sur site / distanciel / complémentaire) | On interroge une personne                                                      | Le parcours de questions par profil (inchangé)                                                                                                                                                                               |
| **`observation`**                                    | On regarde le travail réel : un poste, un atelier, un flux (shadowing)         | Grille d'observation par unité : tâches observées, durées relevées, gestes répétitifs, ruptures de flux, outils réellement utilisés (vs déclarés), photos ; questions étiquetées `source:observation` proposées en checklist |
| **`demonstration`**                                  | Un utilisateur montre SON outil (ERP, CRM, Excel maison) en conditions réelles | Checklist de démonstration : parcours type chronométré, nb de clics/ressaisies, exports possibles, données accessibles ; captures d'écran autorisées (consentement)                                                          |
| **`analyse_documentaire`**                           | On lit les documents remis (organigramme, procédures, contrats, exports)       | Fiche de lecture par document (rattachée au `document_request`/`attachment`) : constats extraits, rattachés aux blocs et unités ; les questions factuelles peuvent être répondues DEPUIS un document (provenance tracée)     |
| **`releve_donnees`**                                 | On collecte des chiffres : volumétries, temps, coûts, effectifs par tâche      | Tableaux de relevé normés par bloc (volumes/mois, temps unitaire, taux d'erreur, coût), avec unité et source du chiffre (déclaré / mesuré / extrait système)                                                                 |

**Chaque réponse porte désormais sa PROVENANCE** (`answers.source CHECK IN ('entretien','observation','demonstration','document','releve') DEFAULT 'entretien'` + session d'origine). Le plan de mission (§17.3) planifie les CINQ types par unité selon le palier (ex. ETI industrielle : par usine, 4 entretiens + 1 observation d'atelier + 1 démo ERP + analyse des procédures + relevé de volumétrie) ; l'écran de couverture (§16.6) contrôle la couverture PAR TYPE DE SOURCE, pas seulement en entretiens. Les abaques de chiffrage (M9) intègrent des durées-types par type de session.

## 27.2 Triangulation — RENFORCE l'analyse (M5.1)

L'agrégation affiche, pour chaque sujet, la convergence ENTRE SOURCES : ce que la direction déclare (entretien) × ce que le terrain vit (entretien terrain) × ce qu'on a VU (observation/démo) × ce que disent les documents et les chiffres. Les divergences déclaré↔observé sont marquées (c'est souvent là que se cachent les plus gros gisements : « le processus prend 10 minutes » déclaré, 40 minutes observées). **Règle métier gravée : tout finding s'appuie sur au moins une source tracée, idéalement deux de types différents** — le rapport cite la nature des sources (« constaté en observation et confirmé par les volumétries »), jamais « il nous semble ».

## 27.3 Cartographie complète de l'entreprise — LE LIVRABLE CENTRAL, désormais outillé de bout en bout

La compréhension de bout en bout produit par l'audit s'appuie sur quatre inventaires structurés (pas du texte libre) :

1. **L'arbre organisationnel** (§16.2) — la structure.
2. **La cartographie des processus** (bloc 2, alimentée par les 5 sources) — qui fait quoi, comment, en combien de temps, avec quel taux d'erreur.
3. **L'inventaire des outils et systèmes** — NOUVELLE table `tools_inventory(id, mission_id, org_unit_id FK, name, category CHECK IN ('erp','crm','bureautique','metier','ia','fichier_excel','papier','autre'), vendor NULL, usage_description, users_count, criticality CHECK IN ('critique','importante','faible'), data_quality_note, source_session_id FK, created_at)` — collecté en entretien ET vérifié en démonstration ; nourrit les blocs 3-4, le registre AI Act (`ai_systems` pour la part IA), et la cartographie SI du rapport.
4. **Le registre des usages IA** (`ai_systems`, bloc 9).
   Le rapport (§20.3) matérialise cette cartographie : schéma de l'organisation auditée, tableau processus × unités avec chiffres clés, cartographie applicative par unité, registre IA — la « photo fidèle et partagée, loin des slides » promise sur axion-ia.com.

## 27.4 Informations non communiquées (données sensibles refusées) — TRAITEMENT NORMAL, PAS UNE ANOMALIE

Une entreprise peut refuser de communiquer CA, marges, salaires, contrats… L'outil le gère proprement :

- Sur toute question : statut **« non communiqué »** (`answers.withheld BOOL DEFAULT false` + `withheld_reason CHECK IN ('confidentiel','non_disponible','hors_perimetre','autre')` + note). Distinct de « N/A » (sans objet) et de « à revoir » (à creuser).
- **Effet sur le scoring** : la question sort du calcul (jamais de pénalité pour un refus) ; chaque bloc affiche son **indice de complétude** (« score 3,2/5, établi sur 84 % des questions — 6 non communiquées ») ; sous un seuil (paramétrable, défaut 60 %), le score du bloc est marqué « indicatif ».
- **Effet sur le rapport** : chapitre méthodologie enrichi d'une rubrique normée **« Limites et réserves »** listant les informations non communiquées et leur impact sur les recommandations (« le ROI de l'action 7 est estimé en fourchette, le coût complet du service n'ayant pas été communiqué ») — c'est une pratique d'auditeur professionnel qui PROTÈGE Axion-IA (on ne garantit pas ce qu'on n'a pas pu vérifier) et met le client face à son choix.
- **Alternatives proposées à l'auditeur** : demander une FOURCHETTE plutôt qu'un chiffre exact (les types de réponse gagnent un mode « fourchette »), un ordre de grandeur, ou un chiffre relatif (« +30 % vs N-1 ») — souvent accepté quand l'exact est refusé ; consigne intégrée à la banque sur les questions sensibles.
- Rappel automatique du NDA sur la fiche mission (référence du NDA signé, date) — argument de l'auditeur face au refus.

## 27.5 Revue de densité des étapes (réponse au « certains postes semblent légers »)

Passage en revue : **Cadrage** — complet (M9 + arbre + plan multi-sources + recalage §25.1). **Préparation** — complet (questionnaire + documents + NDA + agenda). **Collecte** — ÉTAIT le maillon léger : corrigé par les 5 sources (§27.1), c'était la bonne intuition. **Analyse** — renforcée par la triangulation (§27.2) et les inventaires (§27.3). **Rapport** — complet et normé (§20.3, §26.1-26.2, limites §27.4). **Livraison/suite** — complet (restitution, pont formation, ré-audit, fiche 360°). Aucune étape légère restante identifiée.

## 27.6 Impacts

Schéma : extension `interviews.type` + `answers.source` + `answers.withheld*` + table `tools_inventory` + mode « fourchette ». Noyau strict : les 5 types de session en VERSION SIMPLE (type + grilles génériques + provenance + non-communiqué) = +1,5 j (chiffrage historique — référence : 00_INDEX) ; les grilles d'observation/démo riches et les tableaux de relevé normés → Phase 2. La banque de questions doit étiqueter la source attendue de chaque question (entretien / document / observation / relevé) — intégré au format de rédaction du socle.

# 28. AVENANT V2.0 — ANALYSE CONCURRENTIELLE (CABINETS D'AUDIT IA HAUT DE GAMME) : 10 COMPLÉMENTS

_(27/08/2026. Source : étude des méthodologies IAvenir, Jaydai, Tandem, RSM, DOOR3, ExCo Partners, Diag Data IA Bpifrance, pratiques process mining. Positionnement confirmé : notre outil dépasse le marché sur le terrain hors ligne, le multi-auditeurs, la triangulation, la fiche 360°, le chiffrage apprenant, le registre AI Act et le pont formation. Les 10 compléments ci-dessous alignent ou dépassent le reste.)_

## 28.1 Intégrés au NOYAU STRICT (impact faible, valeur forte)

1. **Baseline de mesure sur chaque action** (`use_cases` + `roadmap_items` : `baseline_value`, `baseline_unit`, `baseline_source_session_id`, `target_value`) — la valeur ACTUELLE du processus (temps, taux d'erreur, coût) est capturée PENDANT l'audit ; le ré-audit mesure le progrès contre elle. Règle métier : une action sans baseline mesurable est signalée (le rapport l'assume explicitement). C'est la réponse au principal reproche du marché : « des audits qui s'arrêtent au rapport ».
2. **Faisabilité par cas d'usage** (`use_cases` : `data_required`, `data_available CHECK IN ('oui','partiel','non','a_verifier')`, `approach CHECK IN ('acheter','integrer','developper')`, `success_metric`) — chaque fiche action dit si les données existent et par quelle voie passer.
3. **Type de session « atelier »** (`interviews.type` + `'atelier'`) — workshop collectif de co-identification (5-10 participants d'une unité), avec liste des participants et restitution structurée en cas d'usage candidats.

## 28.2 Phase 2 (oct.-déc. 2026)

4. **Module SONDAGE COLLABORATEURS anonyme** — nouveau : `surveys(id, mission_id, org_unit_scope JSONB, questions JSONB, opens_at, closes_at)` + `survey_responses(id, survey_id, org_unit_id, answers JSONB, submitted_at)` — SANS identité (anonymat structurel : aucun champ nominatif, seuil d'affichage k≥5 par unité). Lien public à jeton par service, questionnaire court (10-15 questions fermées : usages IA réels, outils utilisés en douce, appétence, craintes, temps perdu estimé). Résultats : statistiques par unité intégrées au bloc 5 et au rapport (« n=642 répondants, 63 % utilisent une IA générative sans cadre »). Poids statistique que l'entretien seul ne donne jamais ; complète (ne remplace pas) les entretiens.
5. **Business case normé par action** (`use_cases` : `assumptions TEXT`, `gain_low`, `gain_high`, `payback_months`) — hypothèses écrites, fourchettes, délai de retour ; gabarit de fiche action enrichi (§26.2).
6. **Interdépendances de feuille de route** (`roadmap_items.depends_on JSONB` — ids d'actions) — contrôle de cohérence (pas d'action planifiée avant ses prérequis) + affichage des chaînes dans la timeline visuelle.
7. **Catalogue de solutions Axion-IA** — nouveau : `solutions_catalog(id, name, vendor, category, use_case_tags JSONB, indicative_cost, eu_hosting BOOL, notes, missions_used JSONB, status, updated_at)` — référentiel interne administré (console, espace Contenu) des outils recommandables ; les fiches action y puisent (« outils et technos conseillés à l'appui », promesse du site) ; enrichi mission après mission comme la banque de questions. Revue trimestrielle (le marché IA bouge vite).
8. **Scénarios de feuille de route** (`roadmap_items.scenario CHECK IN ('standard','prudent','ambitieux') DEFAULT 'standard'`) — deux variantes max par mission selon le budget ; le rapport présente le scénario retenu et mentionne l'alternative.

## 28.3 Phase 3 / V3 (2027)

9. **Process mining allégé** — import d'extraits de journaux système (CSV normalisé : cas, activité, horodatage) pour missions ETI/groupe : reconstitution simple des parcours réels, volumes, délais entre étapes, variantes principales — vérification du déclaratif par les données système (le différenciateur des cabinets premium), sans plateforme lourde type Celonis. En attendant : le relevé de données (§27.1) accepte déjà des extraits système.
10. **Audit d'IA existante (gouvernance de modèles)** — pour clients avancés : évaluation des systèmes IA en production (performance, dérive, supervision humaine, documentation AI Act). Marché distinct, offre future ; le registre `ai_systems` en est déjà le socle.

## 28.4 Impacts

Noyau strict : +0,5 j (champs + type atelier) — chiffrage historique, référence : 00_INDEX. Le sondage (n°4) est le complément Phase 2 le plus différenciant : à prioriser en tête de Phase 2, il peut même être lancé chez le client pilote PENDANT la collecte terrain d'octobre.

# 29. CORRECTIONS DE LA CERTIFICATION FINALE 60 AGENTS (27/08/2026) — SPÉCIFICATION CLOSE

_(Le rapport de certification finale n'est pas joint au pack : ses conclusions — 6 pôles, 6/6 PASSE, 6 constats résiduels mineurs — sont intégralement traitées ci-dessous.)_

- **R1 — Parcours EXPRESS micro** : en niveau `diagnostic_cadrage` sur structure mono-unité, les étapes du pilote trivialement satisfaites se valident automatiquement ; pilote condensé (3 étapes visibles). Guidé intégral dès > 1 unité ou > 3 entretiens.
- **R2 — Compression des photos côté client** : redimensionnement max 2048 px, qualité 85, avant stockage local ; originaux non conservés (règle d'exploitation, divise stockage et sync par ~4).
- **R3 — Rapprochement client par SIREN** : le SIREN est la clé de déduplication outil↔console (nom en second) ; alerte si deux fiches partagent un SIREN.
- **R4 — Secteur pré-rempli par code NAF** : à la création d'un client français, le code APE/NAF renseigne automatiquement le secteur via table de correspondance NAF→secteurs (administrée, console espace Contenu).
- **R5 — Console responsive en LECTURE** : tour de contrôle, pilotage mission et alertes consultables sur tablette ; les actions lourdes (banque, atelier de rédaction) restent desktop.
- **R6 — Secteur surchargé par unité** : `org_units.sector_id NULL` — une unité peut porter son propre secteur (holdings multi-activités) ; le moteur applique le paquet sectoriel de l'unité s'il existe, celui de la mission sinon.

**Impact : +0,5 j → noyau strict 26 j-h (= la référence de charge unique du 00_INDEX). La spécification V2.1 était close ; la revue adversariale indépendante du 27/08/2026 l'a rouverte et les corrections V2.2 (§32) sont APPLIQUÉES (voir décision de certification). Prochaines revues légitimes : fin de lot L6 (code) et rétrospective le client pilote (terrain).**

# 31. COMPLÉMENT PWA — 3 RÈGLES RÉSIDUELLES (27/08/2026)

_(V2.9 — copie unique : le texte normatif de §31 vit EXCLUSIVEMENT au fichier 05 §31 ; l'ancienne copie intégrale ici est supprimée pour éliminer le risque de deux exemplaires divergents du même numéro de section. Toute modification de §31 se fait au fichier 05.)_

---

# 32. CORRECTIONS V2.2 — REVUE ADVERSARIALE INDÉPENDANTE (27/08/2026) — APPLIQUÉES

_(Revue du pack V2.1 complet + CDC. Journal exhaustif constat→correction : fichier 10_CHANGELOG_V2.2. Les corrections de sync et d'API vivent dans le fichier 05 (§9.3, §9.4, §9.6, §9.7, §9.9, §8.5-8.6), celles de sécurité/RGPD dans le fichier 06, le DDL dans le fichier 04. La présente section porte les spécifications MÉTIER manquantes.)_

## 32.1 Spécification complète du scoring (lève le majeur M1 — le scoring était incalculable)

**Barème par type de réponse** (champ `questions.scoring` JSONB, figé par mission dans `mission_questions.scoring_snapshot`) :

- `yes_no` : `{"map": {"oui": 5, "non": 0}}` — inversable question par question (« Avez-vous des fichiers Excel critiques non sauvegardés ? » → oui = 0).
- `scale_1_5` : `{"map": "identity"}` (la valeur EST le score).
- `single_choice` / `multi_choice` : les scores vivent dans `options[].score` (structure normée `[{code, label, score}]`) ; multi : `{"aggregate": "max"}` par défaut (`"mean"` possible).
- `number` / `percent` / `duration` / `money` : bandes `{"bands": [{"max": 20, "score": 1}, {"max": 50, "score": 3}, {"score": 5}]}` — ou `weight = 0` (donnée factuelle hors scoring, cas par défaut recommandé).
- `free_text` / `date` / `table` : `weight = 0` obligatoire (alimentent findings et rapport, jamais le score).
- Réponse en **fourchette** (§27.4) : le score s'évalue sur la borne BASSE (prudence). Réponse **non communiquée** ou **N/A** : exclue du numérateur ET du dénominateur.
  **Agrégation** (tous les scores sont sur 0-5 par construction) :

1. Score d'une question pour une unité = moyenne des scores des réponses VALIDES (révision courante, non withheld, non N/A) de toutes les sessions de l'unité.
2. Score d'un bloc pour une unité = Σ(poids × score_question) / Σ(poids) sur les questions RÉPONDUES.
3. **Complétude** = questions scorables répondues / questions scorables posées ; sous le seuil (défaut 60 %, `estimation_params`) le score est affiché « indicatif » (`is_indicative`).
4. **Roll-up** vers les unités parentes et l'entreprise = moyenne pondérée par `headcount` des enfants (headcount NULL → poids 1 ; règle affichée dans l'UI).
5. **Divergence** (M5.4) : sur échelle, écart-type ≥ 1,5 (seuil `estimation_params`) entre réponses d'une même question/unité (V2.9 : évaluée à partir de 2 réponses — n = 1 : pas de divergence, jamais de NaN) → à creuser ; oui/non contradictoires si les deux valeurs coexistent. La lecture « direction vs terrain » compare les moyennes par `interlocutor_profiles.group_code` (direction / encadrement / terrain).
6. **Drapeau rouge** : `scoring.red_flag` (`{"values": ["non"]}` ou `{"below": 2}`), évalué UNIQUEMENT si `criticality='bloquant'` → finding `drapeau_rouge` AUTO-PROPOSÉ en brouillon (validation humaine obligatoire, §16.5) ; jamais masqué par une moyenne.
   **Contrôle à l'import (L4, bloquant)** : toute question `weight > 0` sans `scoring` valide est rejetée.

## 32.2 Machine à états mission et codes d'étape (lève le majeur M5 — trois systèmes concurrents non mappés)

**Trois niveaux, UN pivot** : le statut mission (`missions.status`, 5 valeurs) est le pivot technique ; les 6 étapes du pilote de mission (§17.2) le raffinent ; les 8 étapes publiques (§20.2) sont un HABILLAGE de communication (mapping d'affichage, aucune logique).
**Mapping statut ↔ étapes pilote** : `preparation` ⇔ étapes Cadrage + Préparation · `en_cours` ⇔ Collecte · `en_analyse` ⇔ Analyse + Rapport · `livree` ⇔ Livraison faite · `cloturee` ⇔ après rétrospective.
**Transitions autorisées** (toute autre = rejetée avec motif) : `preparation → en_cours` (conditions : étapes cadrage ET preparation validées dans `step_validations`, questionnaire figé, plan d'entretiens existant) · `en_cours → en_analyse` (étape collecte validée, ou override admin motivé) · `en_analyse → livree` (export réalisé + validation humaine de livraison) · `livree → cloturee` (rétrospective faite).
**Retours arrière** (admin uniquement, motif obligatoire, tracés `activity_log`) : `en_cours → preparation` · `en_analyse → en_cours` (réouverture de collecte) · `livree → en_analyse` (correction de rapport). **`cloturee` est TERMINAL** (jamais rouvert ; suite = ré-audit, nouvelle mission §6.4).
**Codes d'étape** (`step_validations.step_code`, CHECK fermé — fichier 04) : `cadrage`, `preparation`, `collecte`, `analyse`, `rapport`, `livraison` (scope mission) · `entretien` (scope interview) · `unite` (scope org_unit). Granularités §19.1 couvertes : fin d'entretien = `entretien`, fin d'unité = `unite`, fin de collecte = `collecte`.

## 32.3 Consolidation groupe — cadre spécifié (lève le majeur M8 ; réalisation Phase 2, lot L14)

- Modèle : `missions.parent_mission_id` — la mission mère (niveau `strategique_groupe`) référence ses missions filles (une par pays/périmètre).
- Agrégation : score groupe par bloc = moyenne pondérée par headcount TOTAL de chaque mission fille des scores de bloc des filles ; arbre virtuel groupe = racines des filles rattachées à la racine mère (lecture seule).
- Restitution : heatmap filles × blocs (console, espace 6 « consolidation ») + chapitre consolidation du rapport (gabarit `strategique_groupe`, variante consolidation).
- Findings groupe = sélection ÉDITORIALE par le consultant parmi les findings des filles (jamais de fusion automatique) ; cas d'usage transverses marqués « groupe ».
- Le tout n'existe qu'en Phase 2 : en V1, le repli multi-pays est celui du §2.4 (missions séparées, consolidation manuelle dans le rapport).

## 32.4 Référentiel ROI, règles d'échantillonnage, ancres de cotation (complétude métier)

**ROI normé** (utilisé à la main en V1 sur l'export, outillé en Phase 2 avec §28.2) : gain annuel estimé = volume annuel de l'activité × temps unitaire économisé × **taux horaire chargé** de la catégorie de poste (`estimation_params`, clés `taux_horaire_charge_*`, valeurs par défaut France ajustables par mission). Toute estimation porte ses HYPOTHÈSES explicites (champ `assumptions`) et une fourchette basse/haute (`gain_low`/`gain_high`) — le rapport n'affiche JAMAIS un ROI sans ses hypothèses.
**Échantillonnage** (règle affichée au plan d'entretiens, M9/§18.1) : unité ≤ 10 pers. → 1-2 entretiens · 11-50 → 3 entretiens · 51-200 → 4-6 entretiens + 1 observation · > 200 → 6-10 entretiens + observation + démonstration + relevé de données. Le consultant peut dévier (le plan est un guide) ; l'écart est visible dans la couverture.
**Ancres de cotation** (critère d'ADMISSION en banque, M1.1) : toute question à échelle porte dans `guidance_fr` des ancres explicites (« 1 = aucun processus documenté · 3 = documenté mais non appliqué · 5 = documenté, appliqué, mesuré »). Exercice de **cotation croisée** au bac à sable (§17.5) sur 2 cas fictifs avant la première mission — jalon contenu du 15/09 (fichier 07 §14).

## 32.5 Sauvegarde terrain (lève le bloquant B5)

Spécification complète : fichier 05 §9.7 (export de secours chiffré + garde-fou reset) et 02 §11.4 (RPO terrain corrigé). Règle d'exploitation : invariant 8 du 00_INDEX (sync ≥ 1×/jour + export quotidien + alerte au-delà de 24 h). Tests et checklist : fichier 07 (§13, §15).

## 32.6 Décisions de résolution des collisions internes (V2.2)

1. **Types de session** : `interviews.kind` (6 valeurs : entretien, observation, demonstration, analyse_documentaire, releve_donnees, atelier — §27.1/§28.1) est DISTINCT du mode d'entretien `interviews.mode` (sur_site, distanciel, complementaire — §25.6, applicable si kind='entretien'). « Complémentaire » est un mode, pas un type.
2. **Unicité des réponses** : UNIQUE(interview_id, mission_question_id) — une réponse par question et par session ; toute re-réponse est une révision ; le hors-parcours est un flag de la même réponse.
3. **Gabarits de rapport** : la clé est le NIVEAU D'AUDIT (`report_templates.audit_level`, §26.2 prévaut sur M1.5/palier) + `kind` (rapport / point d'étape §25.5).
4. **Divergence direction/terrain** : portée par `interlocutor_profiles.group_code` (référentiel, seedé) — pas de liste de profils codée en dur.

---

# 33. UX/UI V2.4 — EXPÉRIENCE 2026-2027, TOKENS CHIFFRÉS ET INTUITIVITÉ TOTALE (27/08/2026) — APPLIQUÉ

_(Complète §17 (UX guidée) et §19 (design system) sans les répéter : tout ce qui suit s'ajoute. Objectif : n'importe quel consultant recruté demain mène un audit sans formation, et l'interface tient la comparaison avec les meilleurs outils pro 2026-2027 — calme, chaleureuse, rapide.)_

## 33.1 Fondations chiffrées (les tokens de §19.2 reçoivent leurs VALEURS — l'autopilote ne devine plus)

- **Typographie** : Inter variable **auto-hébergée** (`@fontsource-variable/inter` — JAMAIS de CDN : la PWA doit rendre parfaitement en mode avion), fallback `system-ui`. Échelle : 12 / 14 / **16 (corps)** / 18 / 22 / 28 / 36 px. Interlignage 1,5 (corps), 1,2 (titres). Chiffres tabulaires (`font-variant-numeric`) partout où des nombres s'alignent (déjà §19.2).
- **Espacement** : échelle de 4 px (4/8/12/16/24/32/48/64). **Rayons** : 8 (contrôles), 12 (cartes), 16 (surfaces/sheets). **Ombres** : 2 niveaux max (sm, md) — élévation discrète.
- **Motion** : 150 ms (micro-feedback), 250 ms (transitions d'écran), easing `ease-out` ; **`prefers-reduced-motion` respecté** (les transitions deviennent des fondus instantanés) ; aucune animation bloquante ni décorative.
- **Nuances neutres** : 5 crans dérivés du mocha (texte principal, secondaire, tertiaire, bordures, fonds de zone) — en tokens, montrés sur /design.
- **Mode sombre** : décision §19.2 CONFIRMÉE — clair uniquement en V1 (`color-scheme: light` déclaré) ; l'ivoire EST l'identité et l'audit se mène de jour en entreprise ; sombre = V2 (déjà prévu).

## 33.2 Règle des quatre états (systématise §17.6)

Chaque écran et chaque liste livre ses QUATRE états : **vide** (message qui dit quoi faire, §17.6), **chargement** (skeletons aux dimensions finales — jamais de spinner plein écran), **erreur** (cause + action, français clair, code technique replié), **hors ligne** (pastille discrète + rappel des capacités locales). Critère de revue croisée A29 et de recette A54 : un écran sans ses 4 états ne passe pas.

## 33.3 Terrain — vitesse et confiance en entretien (complète §17.4)

- **Raccourcis complets** (PC) : 1-5 échelles · O/N oui-non · A = N/A · R = à revoir · ↵ suivant · ↑↓ navigation · **/** = recherche de question (le champ hors-parcours §25.4 sert de palette de saut). **Règle (V2.8) : les raccourcis à une touche (O/N/A/R/E, 1-5, /) ne sont actifs que HORS focus d'un champ de saisie** — taper « Rien à signaler » dans une note ne déclenche jamais rien ; Échap rend le focus. iPad : **swipe horizontal** = question suivante/précédente, clavier virtuel adapté au type (numérique sur nombres/%, e-mail sur e-mails), jamais de champ masqué par le clavier (déjà §22.1).
- **Ancres de cotation VISIBLES** : sur toute échelle 1-5, les ancres (§32.4, dans guidance) s'affichent SOUS le curseur — la cotation homogène ne dépend pas de la mémoire du consultant.
- **Micro-indicateur « Enregistré »** : l'enregistrement continu (§17.4) devient VISIBLE — pastille furtive à chaque écriture locale ; la confiance se voit.
- **MODE ÉCRAN PARTAGÉ (nouveau — différenciant métier)** : un toggle (icône œil, raccourci E) masque INSTANTANÉMENT tout ce qui est interne — notes, notes volantes, flags à-revoir, motifs non-communiqué, navigation privée — pour montrer l'écran à l'interviewé sans rien faire fuiter. État visible en permanence (bandeau fin « écran partagé »). Réflexe naturel d'auditeur, couvert par le produit.
- **Type `table` sur tactile (V2.10)** : rendu V1 = **LISTE de lignes** (un petit formulaire par ligne, ajout/suppression, gros boutons) — jamais de grille type tableur au doigt ; les tableaux de relevé riches restent Phase 2 (§27.6).
- **Fin d'entretien** : l'écran de validation (§19.1) présente la synthèse en une carte lisible : répondu / à revoir / N/A / notes / pièces — puis les contrôles bloquants.

## 33.4 Console — pilotage calme et dense (complète M7/§22.3)

- **Desktop-first ≥ 1280 px** (tolérance 1024) ; PAS de console mobile en V1 (assumé — le terrain a la PWA). AppShell : barre latérale fixe (7 espaces), en-tête avec sélecteur de mission.
- **Wizard de mission avec PRÉVISUALISATION (nouveau, L3)** : avant le snapshot M2 (figeage), un écran montre le questionnaire assemblé — total et répartition par bloc × interlocuteur, liste dépliable — puis demande confirmation. Plus jamais de « 240 questions découvertes après figeage ».
- Tableaux denses (lignes 40 px), tri/filtres persistants ; dataviz §19.2 avec infobulles.
- **Palette de commandes Cmd+K** (navigation entre missions/espaces) : Phase 2 — standard 2026 des outils pro, gratuite avec cmdk/shadcn, mais la console Phase 1 est minimale (L7-min) : inutile d'y investir avant qu'il y ait des espaces à naviguer.

## 33.5 Inventaire packages/ui (ordre de construction A21 — base shadcn/ui + composants MÉTIER)

Base shadcn (Button, Input, Select, Checkbox, Toggle, Tabs, Sheet, Dialog, Toast, Tooltip, Badge, Table, Skeleton) + composants métier à construire : **ÉchelleAncrée** (slider 1-5 + ancres dépliées) · **SegmenteONA** (Oui/Non/N-A gros boutons tactiles) · **SaisieFourchette** (bas/haut §27.4) · **PastilleSync** · **BandeauPartage** (mode écran partagé) · **AnneauProgression** · **TimelinePilote** (étapes + verrous parlants §19.1) · **CarteSynthèseEntretien** · **Radar** · **Heatmap** · **CourbePrévuRéel** · **ÉtatVide**. Chacun : états complets (§19.2) + exemple sur /design.

## 33.6 Accessibilité renforcée (complète A28)

Navigation clavier complète console (pas seulement terrain), focus visible 2 px sur fond ivoire, contraste AA vérifié PAR TOKEN (test automatisé sur la palette, pas au cas par cas), `prefers-reduced-motion`, aucune information portée par la couleur seule (déjà invariant), libellés explicites sur toute icône seule. Grand texte terrain (+2 crans) : Phase 2.

## 33.7 Impact et critères

Charge : mode écran partagé + swipe + indicateur Enregistré + 4 états = L5 porté à 8 j ; prévisualisation questionnaire absorbée dans L3 ; marge ramenée à 2 j — **total noyau strict INCHANGÉ : 26 j-h** (fichier 07 mis à jour). Porte P-C enrichie : 4 états vérifiés écran par écran, raccourcis complets, ancres visibles, mode écran partagé démontré, police rendue en mode avion. **Ajouts V2.10 (journée terrain simulée)** : session planifiée démarrée en UN tap + accord de participation ; AUCUNE ressaisie de mot de passe pendant une session active de 45 min (verrou §9.7) ; « Fin de journée » = sync + export de secours + synthèse en un geste ; un entretien TERMINÉ reçoit une note additionnelle sans révision PUIS est validé en groupe. Charge : tout est de l'ASSEMBLAGE de fonctions déjà spécifiées (démarrage pré-rempli, écran Fin de journée, validation groupée) — absorbé L5, au besoin 0,5 j pris sur la marge (2 j → 1,5 j) ; **total noyau strict INCHANGÉ : 26 j-h**. La grille §33 s'ajoute à la checklist A54.

---

# 34. PILOTAGE HUMAIN V2.5 — CONSOLE, AUDITEURS ET CYCLE DE VIE DE L'ÉQUIPE (27/08/2026) — APPLIQUÉ

_(Complète §18 et §22.3 : la MÉCANIQUE du pilotage existait ; voici les RÈGLES humaines qui manquaient — qui voit quoi, qui peut quoi, comment un auditeur entre, travaille et sort.)_

## 34.1 Matrice console — rôle × espace (tranchée)

| Espace (§22.3)                                                                                                                                                                                                                                                                   | admin  | lead (sur SES missions) | consultant | analyste            | lecteur        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- | ---------- | ------------------- | -------------- |
| 1. Tour de contrôle                                                                                                                                                                                                                                                              | ✔      | —                       | —          | —                   | —              |
| 2. Pilotage mission                                                                                                                                                                                                                                                              | ✔      | ✔ (Phase 2)             | —          | —                   | —              |
| 3. Équipe & plan de charge                                                                                                                                                                                                                                                       | ✔      | —                       | —          | —                   | —              |
| 4. Chiffrage & devis                                                                                                                                                                                                                                                             | ✔ SEUL | —                       | —          | —                   | —              |
| 5. Contenu (banque)                                                                                                                                                                                                                                                              | ✔      | —                       | —          | —                   | —              |
| 6. Analyse & rapports                                                                                                                                                                                                                                                            | ✔      | ✔ (Phase 2)             | —          | ✔ lecture+rédaction | lecture livrés |
| 7. Administration                                                                                                                                                                                                                                                                | ✔      | —                       | —          | —                   | —              |
| **Décision V1 : la console est ADMIN SEUL** (Phase 1 tu es seul auditeur — rien à perdre). **Le cockpit du consultant, c'est la PWA** (§34.2) : il n'a JAMAIS besoin de la console pour travailler. Le lead y entre en Phase 2, borné à SES missions. Testé rôle × espace (A36). |

## 34.2 Cockpit auditeur — écran d'accueil PWA « Aujourd'hui » (précise M3/§18.2 — données 100 % locales, absorbé L5)

À l'ouverture, l'auditeur voit EN UN ÉCRAN, toutes missions embarquées confondues : **ses sessions du jour** (agenda §25.2 agrégé, avec unité, personne, type, heure locale du site) · **ses à-revoir en attente** (compteur cliquable par mission) · **l'état de sync par mission** (pastille + dernier succès + taille d'outbox) · **ses alertes personnelles** (V2.9 : en noyau, alertes CALCULÉES LOCALEMENT — à-revoir en attente, sync muette > 24 h, entretien commencé non terminé ; les alertes SERVEUR §20.4 rejoignent le pull avec le centre d'alertes différable — le cockpit reste 100 % local) · le bouton reprendre là où il s'est arrêté. Zéro navigation pour répondre à « qu'est-ce que je fais maintenant ? ». Son tableau de bord ne porte que sur SON périmètre (§18.2) — le reste de la mission en lecture pour la coordination.
**Compléments V2.10 (fluidité quotidienne — trois gestes qui suppriment la ressaisie et la discipline de mémoire)** : 1) taper une session **PLANIFIÉE** du jour la **DÉMARRE PRÉ-REMPLIE** (nom, fonction, unité, type — déjà saisis à la planification §25.2 : zéro champ à ressaisir, ne reste que l'accord de participation) ; « Nouvel entretien » en 3 champs (§17.4) demeure pour l'imprévu. 2) Bouton « **Fin de journée** » : UN geste = sync forcée + **export de secours chiffré (§9.7)** + synthèse du jour (à-revoir ouverts, entretiens terminés non validés → **validation groupée §19.1**, photos en attente de sync) — **l'invariant 8 cesse d'être une discipline de mémoire et devient un bouton** ; rappel discret sur le cockpit tant que le rituel du jour n'est pas fait. 3) L'action « **Quitter le site** » (§17.3) vit ici aussi, et elle est suggérée après la dernière session planifiée du jour sur ce site.

## 34.3 Pouvoirs du LEAD de mission (complète mission_users.role_on_mission — le rôle existait, ses droits n'étaient pas énumérés)

Sur SA mission uniquement : valider/faire valider les étapes (`step_validations`) · qualifier les unités proposées (§25.3 : valider/fusionner) · corriger une réponse via `PATCH /v1/answers/:id` (§9.9, motif, révision) · **réaffecter une session PLANIFIÉE non commencée** (§34.4) · ajuster le plan d'entretiens et les `work_assignments` de sa mission · voir l'avance/retard de TOUS les auditeurs de sa mission · demander (pas exécuter) un recalage §25.1. JAMAIS : le financier (§18.3, admin seul), les autres missions, la banque de questions, les comptes.

## 34.4 Cycle de vie d'un auditeur (le manque principal — rien n'était écrit)

**ENTRÉE — habilitation obligatoire avant toute mission réelle** : 1) compte créé (rôle consultant, profil guidé strict par défaut §19.1) → 2) **bac à sable** (§17.5) : mission fictive complète en autonomie → 3) **exercice de cotation croisée** (§32.4) : 2 cas fictifs cotés, écart moyen ≤ 0,5 point vs la cotation de référence, débriefé → 4) l'admin pose `users.habilitated_at` (colonne V2.5, fichier 04). **Règle serveur : l'affectation à une mission réelle (`mission_users`) est REFUSÉE si `habilitated_at` est NULL.** Un auditeur non habilité ne touche jamais un client.
**ACTIVITÉ** : affectations par unité (`work_assignments`), agenda §25.2, invariant 8 (sync quotidienne). L'espace 3 pilote la charge.
**SORTIE / INDISPONIBILITÉ (runbook)** : 1) sync forcée + export de secours de chaque appareil (si récupérable) → 2) révocation compte + refresh tokens + retrait des `mission_users` → 3) **réaffectation des sessions PLANIFIÉES non commencées** : `PATCH /v1/interviews/:id/reassign {new_user_id, motif}` (admin/lead, `activity_log`, autorisé UNIQUEMENT si `status ≠ en_cours/termine`) — le nouvel auditeur les récupère à son prochain pull → 4) **les sessions RÉALISÉES restent à leur auteur** (`conducted_by` immuable après coup : l'historique d'un audit ne se réécrit jamais) → 5) appareil non récupérable : perte bornée par l'invariant 8 (≤ 24 h ouvrées de saisie), constat tracé. Checklist ajoutée au runbook d'exploitation (02 §11).

## 34.5 Suivi d'équipe et proportionnalité (les auditeurs sont aussi des salariés — RGPD/CNIL)

L'espace 3 pilote l'ACTIVITÉ, pas les personnes : granularité = sessions réalisées vs planifiées, jours consommés vs prévus, à-revoir ouverts, dernière sync. **INTERDIT dans les fiches individuelles** : temps par question, cadences horaires, heatmap d'activité de la journée — les durées réelles d'entretien nourrissent les ABAQUES AGRÉGÉES (§18.1.2), jamais l'évaluation individuelle. Accès espace 3 : admin seul (§34.1). Les auditeurs sont informés du dispositif de suivi (charte d'utilisation interne remise à l'embauche — gabarit Word manuel, comme la feuille de présence §10.4). Même philosophie que pour les audités : piloter, pas surveiller.

## 34.6 Anti-collision d'agenda (précise §25.2 + espace 3)

À la planification d'une session, avertissement NON bloquant si la même unité ou la même personne a déjà une session sur un créneau chevauchant par un AUTRE auditeur (données déjà disponibles au pull). La résolution se fait au calendrier d'équipe (espace 3) ; le terrain n'est jamais bloqué par le planning d'un collègue.

## 34.7 Phasage (réaliste)

Phase 1 (le client pilote, toi seul) : cockpit §34.2 (absorbé L5), habilitation §34.4 (colonne + règle serveur, absorbé L2), route reassign (absorbée L3), matrice §34.1 réduite à « console = admin ». **L'espace 3 complet passe EN TÊTE de Phase 2, déclenché par le premier recrutement d'auditeur** — c'est lui qui conditionne le passage à plusieurs, pas la collecte le client pilote.

---

# 35. MARCHE À BLANC DE BOUT EN BOUT V2.6 — CALENDRIER CONSOLIDÉ CODE + NON-CODE (27/08/2026) — APPLIQUÉ

_(Dernière vérification qui avait du sens : dérouler la mission le client pilote jour par jour, de l'avant-vente à la livraison, et vérifier que CHAQUE geste a son outil OU son chantier daté. Constat : le code était planifié (07/09), les livrables NON-code étaient cités mais jamais datés ni rassemblés. Corrigé ici.)_

## 35.1 Calendrier consolidé (hypothèse de travail — recalé à la signature du devis)

| Semaine       | CODE (autopilote, fichier 09)                                                                                 | NON-CODE (Williams — c'est TOI le chemin critique ici)                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31/08 - 04/09 | S1 : L0+L1+L2 (portes P-A, P-B) + packages/ui                                                                 | **RDV le client pilote 01/09** : découverte, 3 niveaux, **décision multi-pays à l'ordre du jour** · tableur d'abaques (valeurs `estimation_params`) pour chiffrer · validation des valeurs par défaut avant P-A (fichier 11 §5) |
| 07/09 - 11/09 | S2 : L3+L4 + début L5                                                                                         | Proposition + devis le client pilote (sur tableur d'abaques — l'outil de chiffrage est différable) · NDA envoyé · rédaction banque : socle transverse                                                                           |
| 14/09 - 18/09 | S3 : fin L5 (P-C) + L6 EXCLUSIF (P-D)                                                                         | **15/09 — P-DESCOPE + jalon contenu : 100 questions relues, ancrées, cotation croisée faite** · AIPD complète rédigée · mention d'information versionnée · feuille de présence maquettée                                  |
| 21/09 - 25/09 | S4 : L7-min + recette (P-E, GO/NO-GO) + L8 si P-D à l'heure                                                   | Fin de la banque (200 questions) + import réel L4 · arbre le client pilote collecté auprès du sponsor (format §35.2) · plan d'entretiens co-validé                                                                              |
| 28/09 - 02/10 | Corrections de recette                                                                                        | Checklist §15 déroulée à 100 % · signature devis attendue · mission créée + figée                                                                                                                                         |
| Octobre       | **L8 si pas encore livré — BUTOIR : dernier jour de collecte (§35.3)** · tête de Phase 2 si air (sondage §28) | **COLLECTE** (checklist « pendant » §15) · **gabarit Word du rapport maquetté (2 j, §26.2) — pendant la collecte, PAS après**                                                                                             |
| Novembre      | Phase 2 selon backlog                                                                                         | Analyse (scores L8 ou calcul sur export) · rédaction manuelle sur gabarit · relecture → PDF · **livraison + restitution orale** · pont Qualiopi §35.4                                                                     |
| Décembre      | Phase 2                                                                                                       | Rétrospective outil + terrain · backlog Phase 2 ajusté · proposition de ré-audit à 12 mois envoyée                                                                                                                        |

Règle de lecture : la colonne de droite ne se délègue pas à l'autopilote — la banque, l'AIPD, le gabarit et le devis sont TON plan de charge personnel, au même titre que le code est celui de Claude Code.

## 35.2 Format du CSV d'import de l'arbre organisationnel (L3 — jamais spécifié jusqu'ici)

UTF-8, séparateur `;` (ou `,` détecté), en-têtes OBLIGATOIRES, import ATOMIQUE (une erreur = rien d'importé + rapport d'erreurs ligne par ligne). Colonnes :
`ref` (identifiant de ligne, libre, unique) · `name`* · `kind`* (groupe|filiale|etablissement|direction|service|equipe|poste) · `parent_ref` (vide = racine) · `country_code` · `headcount` · `service_code` (taxonomie des 11 fonctions, fichier 11 §5) · `sector_code` · `timezone` (vide = héritage). Exemple :

```csv
ref;name;kind;parent_ref;country_code;headcount;service_code;sector_code;timezone
1;Groupe le client pilote;groupe;;FR;6500;;;
2;le client pilote France;filiale;1;FR;3200;;;
3;Logistique Lyon;service;2;FR;85;logistique_operations;;
```

Ce fichier se remplit avec le sponsor au cadrage (souvent depuis leur organigramme Excel) — le format est fait pour être saisissable à la main.

## 35.3 Butoir du lot L8 (le « différable » gagne une date dure)

« Livrable pendant la collecte » ne suffisait pas : l'ANALYSE a besoin du scoring. Règle : **L8 doit être en production au plus tard le dernier jour de collecte**. À défaut (cas dégradé assumé) : calcul manuel sur l'export selon les formules §32.1 (tableur) — possible mais coûteux ; le butoir existe pour ne pas y arriver.

## 35.4 Pont Qualiopi en V1 (précision)

L'export « cahier des charges formation » (§15) est transmis à la console axion-ia.com **MANUELLEMENT** en V1 (fichier envoyé) — l'intégration outillée est le lot L13 (Phase 2). Aucune dépendance de la livraison le client pilote à L13.

## 35.5 Postes de coûts d'exploitation (Phase 1 — à confirmer aux tarifs du jour, aucun engagement caché)

VPS Hetzner prod (+ Storage Box sauvegardes) · nom de domaine · GitHub repo privé (offre standard) · API Anthropic (variable, plafonnée PAR MISSION via `llm_calls` §M6 — et ZÉRO en Phase 1 : la génération LLM est L11/Phase 2) · licence module image docxtemplater (Phase 2, achat unique, décision P1-8) · tout le reste (polices, icônes, bibliothèques, k6, ZAP) = open source, 0 €. Ordre de grandeur mensuel Phase 1 : quelques dizaines d'euros hors API. Aucun SaaS tiers, aucune donnée client chez un tiers hors Hetzner (+ Anthropic en Phase 2 sous DPA §10).

## 35.6 Décision assumée : pas de maquettes Figma

Le design n'a volontairement PAS de phase maquette : il émerge du design system chiffré (§33.1), de la page /design (référence de recette visuelle §19.2) et des portes P-C/P-E qui servent de revues de goût. Risque assumé : 1-2 itérations d'ajustement visuel à P-C. **Option recommandée (hors chemin critique, 0,5 j)** : avant le lot L5, faire produire sur /design une maquette HTML statique des 3 écrans clés (écran d'entretien, « Aujourd'hui », tour de contrôle) et la valider — ça transforme la revue de goût de P-C en formalité. À toi de décider au lancement de S2.

---

# 36. PROFONDEUR FONCTIONNELLE V2.7 — AUDIT MODULE PAR MODULE + FORMATS MANQUANTS (27/08/2026) — APPLIQUÉ

_(Septième passe : chaque fonctionnalité confrontée à « a-t-elle ses données, son API, son écran, ses critères ? ». Verdict global : le noyau était profond, DEUX formats critiques manquaient — l'export de mission (la matière du rapport V1 !) et l'import de la banque. Corrigés ici, avec la matrice de complétude.)_

## 36.1 Principe de profondeur par phase (règle d'or, désormais écrite)

**Noyau (Phase 1) : spécifié à l'implémentation près** — c'est fait (§32-36). **Phase 2 : spécifié au niveau DÉCISION** (quoi, pourquoi, modèle de données, périmètre) — le brief détaillé s'écrit AU LANCEMENT du lot, comme §32-35 l'ont fait pour le noyau. **Phase 3 : intention + modèle.** C'est délibéré : détailler aujourd'hui l'écran d'un lot de 2027 produirait de la spécification périmée avant d'être codée. « Survolé » n'est un défaut QUE pour le noyau — et le noyau ne l'est plus.

## 36.2 Matrice de complétude (l'inventaire demandé — rien d'oublié)

| Fonctionnalité                                                                      | Profondeur                                                                                                                                                                                                                                                              | Où                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| M1 banque (CRUD, types, étiquettes, versions, file à qualifier)                     | Noyau : import scripté PROFOND (§36.4) ; back-office UI : Phase 2 décision                                                                                                                                                                                              | M1.1-1.2, L4/L9           |
| M2 moteur questionnaire (matrices, snapshot, prévisualisation)                      | PROFOND                                                                                                                                                                                                                                                                 | M2, §33.4                 |
| M3 PWA terrain (3 zones, types, sessions, offline, crypto, export secours, cockpit) | PROFOND (6 passes)                                                                                                                                                                                                                                                      | M3, §17, §25, §27, §31-34 |
| M3.4 mode papier                                                                    | Phase 2 décision (PDF vierge + ressaisie ; les réponses ressaisies portent `source` normale + note d'origine « papier » dans la session)                                                                                                                                | L15                       |
| M4 sync (contrat d'ops, LWW, chunks, propriété, 8 scénarios)                        | PROFOND                                                                                                                                                                                                                                                                 | §9 intégral               |
| M5 scoring/analyse (barèmes, agrégation, divergence, drapeaux)                      | PROFOND                                                                                                                                                                                                                                                                 | §32.1                     |
| M6 rapports (structure, gabarits par niveau, génération)                            | Structure + gabarit manuel V1 PROFONDS ; génération DOCX/LLM : Phase 2 décision + brief L10 durci                                                                                                                                                                       | §20.3, §26.2, L10-L11     |
| M7/console (7 espaces, tour de contrôle, pilotage, équipe)                          | Espaces 1-2-7 noyau PROFONDS ; 3-6 Phase 2 décision détaillée                                                                                                                                                                                                           | §22.3, §34                |
| M8 intégration console/CRM (webhooks, anti-rejeu, SIREN)                            | Phase 2 décision (contrat d'événements §8.6)                                                                                                                                                                                                                            | L13                       |
| M9 cadrage/chiffrage (formulaire, moteur, simulateur, devis, étanchéité)            | PROFOND (V1 = tableur d'abaques assumé §35.1)                                                                                                                                                                                                                           | §18.1                     |
| Alertes (8 types énumérés, acquittement, seuils)                                    | PROFOND                                                                                                                                                                                                                                                                 | §20.4                     |
| Recherche                                                                           | Terrain : plein texte mission PROFOND (§25.4). Console globale : Phase 2 — périmètre = clients/missions/auditeurs/questions ; **JAMAIS les réponses en recherche globale** (confidentialité inter-missions) : les réponses ne se cherchent QUE dans une mission ouverte | §22.3                     |
| Exports d'écran console (CSV/PDF), benchmarks, pré-audit, audio, sondage            | Phase 2/3 décision                                                                                                                                                                                                                                                      | §6, §28                   |

## 36.3 FORMAT DE L'EXPORT DE MISSION (L7-min — le fichier avec lequel le rapport V1 s'écrit ; jamais spécifié jusqu'ici)

Un ZIP `export_mission_<ref>_<AAAAMMJJ>.zip`, UTF-8 avec BOM (Excel FR), séparateur `;` :

- `mission.json` — méta complète : client, niveau, périmètre, dates, auditeurs, complétude globale, paramètres, présence ou non des scores (L8), version d'export.
- `arbre.csv` — unités aplaties : ref, nom, kind, parent, effectif, in_scope, sessions prévues/réalisées (couverture).
- `sessions.csv` — une ligne par session : id, type, mode, unité, fonction de la personne, auditeur, planifié/réalisé, durée, statut.
- **`reponses.csv` — LE fichier central**, une ligne par réponse, triée bloc → unité → question : bloc, texte de question (snapshot), unité **+ colonne `unite_in_scope` (V2.8 : les réponses des unités sorties du périmètre §25.1 SONT dans le fichier, flaguées `false` — jamais deux fichiers de réponses ; `unites_hors_perimetre.csv` liste seulement les unités et motifs)**, session + type + provenance (`source`), valeur APLATIE LISIBLE (choix = libellés, fourchette = « 20 – 30 », tableau = JSON), non-communiqué + motif, hors-parcours, N/A + motif, à-revoir, note du consultant, criticité, poids, score unitaire (si L8), horodatage.
- `constats.csv` (findings + sources), `cas_usage.csv`, `inventaire_outils.csv`, `registre_ia.csv`, `unites_hors_perimetre.csv` (annexe §25.1), `scores.csv` (bloc × unité + complétude + indicatif — si L8, sinon absent et signalé).
- `pieces_jointes/manifest.csv` (id, session, question, type, fichier) ; les FICHIERS eux-mêmes sont une option cochée à l'export (sinon manifest seul).
  **Critère d'acceptation L7-min (remplace le critère vague)** : le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP, sans retourner dans l'outil.

## 36.4 FORMAT D'IMPORT DE LA BANQUE (L4 — mêmes règles que §35.2 : atomique, rapport d'erreurs ligne à ligne)

CSV UTF-8, en-têtes obligatoires : `code`* (unique — colonne `questions.code`, V2.9 : clé de ré-import/versionnage) · `bloc_code`* · `texte_fr`* · `guidance_fr` (AVEC les ancres pour les échelles) · `answer_type`* · `options` (JSON en cellule : `[{"code":"a","label":"…","score":3}]`) · `allow_range` · `poids` · `scoring` (JSON §32.1) · `criticality` · `expected_source` · `secteurs` (codes séparés par `|`, vide = universelle) · `services_cibles` · `niveaux` · `effectif_min` · `effectif_max` · `profils` · `geo`.
**Contrôles bloquants à l'import** : code unique · bloc existant · `scoring` valide si `poids > 0` (déjà §32.1) · **ancres présentes dans `guidance_fr` si `answer_type = scale_1_5`** · options JSON valides. Une erreur = rien d'importé + rapport.

## 36.5 Verdict d'harmonie

Les 9 modules, 20 avenants/sections de correction et 47 exigences se référencent sans contradiction (contrôles des passes 1-7) ; chaque flux de bout en bout (§35.1) atterrit sur des fonctionnalités spécifiées ; chaque donnée saisie sur le terrain a un chemin jusqu'au rapport (terrain → sync → agrégation → export §36.3 → gabarit §26.2). Les seules zones volontairement légères sont Phase 2/3 — règle §36.1.

## 36.6 Checklist qualité rapport (V2.8 — la promesse publique rendue OPPOSABLE)

La page audit d'axion-ia.com promet : « chaque recommandation justifiée, chiffrée, priorisée, avec estimation d'effort honnête », « pas une ligne de remplissage », gains « en heures et en cash ». Contrôle AVANT toute livraison (page de contrôle interne intégrée au gabarit Word, retirée avant le PDF) :

1. **Chaque recommandation** porte : gain chiffré en HEURES **et** en EUROS (formule §32.4) + hypothèses explicites + fourchette basse/haute · effort/complexité/délai · prérequis et conditions de réussite · risques · vague (quick win / chantier / transformation). **(V2.9)** Exception assumée : les actions de CONFORMITÉ, de RISQUE ou de GOUVERNANCE (ex. mise en conformité art. 50, charte IA) portent un bénéfice QUALITATIF explicite (obligation couverte, risque évité, sanction encourue citée) — jamais un chiffre inventé pour cocher la case ; la formule §32.4 s'applique aux actions de productivité.
2. **Chaque constat** cite au moins une source (§27.2) remontant à l'export §36.3 — tout chiffre du rapport est retrouvable dans `reponses.csv` (traçabilité intégrale ; aucune affirmation d'auteur sans donnée derrière).
3. **Faisabilité données** renseignée sur toute action retenue (`data_required` / `data_available` — « décisions sécurisées » de la promesse).
4. **Divergences direction/terrain** traitées (jamais tues), **drapeaux rouges** tous adressés, rubrique **Limites et réserves** (§27.4) présente, annexe périmètre réduit si applicable (§25.1).
5. **Dire NON fait partie du rapport** : les cas d'usage écartés (`status = 'ecarte'`) apparaissent AVEC leur motif — recommander d'arrêter un projet prématuré est un livrable, pas un oubli (c'est l'avis client le plus fort de la page publique).
6. **Zéro remplissage** : la volumétrie découle du contenu (§26.1) ; toute section qui n'apprend rien au client saute ; la synthèse dirigeant tient en 2 pages.
   Un rapport qui ne passe pas les 6 points ne part pas. Cette checklist s'ajoute à la checklist de livraison (07 §15).

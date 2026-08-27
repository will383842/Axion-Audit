# API ET SYNC

> **Pack d'implémentation Axion Audit — fichier 05/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Spécification API REST /v1 (complétée §24.2) et moteur de synchronisation hors ligne (spécification critique)
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 8. SPÉCIFICATION DE L'API (REST, versionnée /v1/)

Fastify + TypeScript + Zod. Réponses JSON `{data}` ou `{error:{code,message}}`. Auth : `Authorization: Bearer <JWT>`. Toutes les routes consultants filtrées par missions assignées (middleware).

## 8.1 Auth

```
POST /v1/auth/login              {email, password} → {access(15min), refresh(30j, rotatif)}
POST /v1/auth/refresh            rotation du refresh token (détection de réutilisation → révocation famille)
POST /v1/auth/logout             révoque le refresh
```

## 8.2 Administration (admin)

```
CRUD /v1/questions (+ /versions, + /import, + /export)      /v1/blocks   /v1/sectors
CRUD /v1/users     /v1/report-templates
GET  /v1/questions/pending-adhoc        file « à qualifier » ; POST .../promote  (versement en banque)
```

## 8.3 Clients & missions

```
GET  /v1/companies?query=            recherche locale + console (§M8.1, fusion des résultats)
POST /v1/companies                   (avec renvoi création console si absent)
CRUD /v1/missions                    POST /v1/missions/:id/decline-by-country
POST /v1/missions/:id/generate-questionnaire     (assemblage + snapshot M2)
POST /v1/missions/:id/resync-questionnaire       (diff affiché, action volontaire)
POST /v1/missions/:id/status         transitions contrôlées (machine à états)
GET  /v1/missions/:id/dashboard      complétude, à-revoir, dernière sync
```

## 8.4 Synchronisation (PWA)

```
GET  /v1/sync/pull?mission_id=&since=<cursor>     questionnaire figé, référentiels, entretiens,
                                                  réponses (delta par curseur)
POST /v1/sync/push                                lot d'opérations idempotentes (§9)
POST /v1/sync/attachments/:id                     upload multipart (reprise par chunk)
```

## 8.5 Analyse & rapport (siège)

```
POST /v1/missions/:id/compute-scores
GET  /v1/missions/:id/aggregation?block=&service=
CRUD /v1/missions/:id/use-cases          /v1/missions/:id/ai-systems
POST /v1/missions/:id/sections/:code/generate       (job LLM asynchrone → polling/SSE)
POST /v1/missions/:id/sections/:code/validate       {validated_text}
POST /v1/missions/:id/report/generate               (job DOCX) ; GET /v1/missions/:id/report/files
```

## 8.6 Intégrations

```
POST /v1/webhooks/console            entrant, signé HMAC + anti-rejeu V2.2 (en-têtes timestamp et nonce ; fenêtre 5 min ; nonces conservés 24 h dans integration_events) (audit.commande, client.updated)
     → webhooks sortants gérés par worker (integration_events, retry exponentiel, max 10)
```

---

# 9. MOTEUR DE SYNCHRONISATION HORS LIGNE (SPÉCIFICATION CRITIQUE)

C'est la brique qui conditionne « zéro donnée perdue ». À implémenter et tester en priorité absolue.

## 9.1 Modèle local (Dexie/IndexedDB)

Tables miroirs (V2.9 — liste alignée sur le périmètre L5 réel) : `missions`, `mission_questions` (snapshots COMPLETS §7 du fichier 04 : texte, consigne+ancres, type, options, barème, criticité), `org_units` (l'arbre entier de la mission, dont les propositions terrain §25.3 créées hors ligne), `interviews`, `answers`, `attachments`, `work_assignments` (lecture — le périmètre de l'auditeur §18.2), plus `outbox` (file d'opérations) et `meta` (curseurs de sync par mission, device_id). Les alertes du cockpit §34.2 sont CALCULÉES localement en V1 (pas de table miroir) ; la table `alerts` serveur rejoint le pull avec le centre d'alertes différable.

## 9.2 Écriture locale

1. Toute action utilisateur écrit d'abord dans IndexedDB (transaction Dexie), avec `id` **UUID v7 généré sur l'appareil** et `client_updated_at` (horloge locale + offset serveur estimé à la dernière sync).
2. Chaque écriture pousse une opération dans `outbox` : `{op_id UUID, entity, entity_id, action: upsert|delete, payload, queued_at}`.
3. L'UI lit toujours IndexedDB (jamais l'API directement en mode mission) → réactivité identique en ligne/hors ligne.

## 9.3 Push (montée vers le siège)

- Déclencheurs : retour du réseau (`online` + ping API), timer 30 s, action « synchroniser maintenant ».
- Envoi par lots de 100 opérations max, dans l'ordre de la file. Le serveur traite **idempotent** : `op_id` déjà vu → ignoré ; upsert par `entity_id` (UUID client = clé).
- Réponse serveur par opération (**contrat V2.2**) : `applied` | `duplicate` | `superseded` | `forbidden` | `error`. `applied`/`duplicate` sortent de l'outbox. `superseded` (une version serveur plus récente du MÊME utilisateur existe — cas des 2 appareils, §9.4) : l'op sort de l'outbox, la valeur perdante est archivée dans `answer_revisions` (origine `sync_arbitrage`) et l'appareil se réaligne au prochain pull ; notification discrète « n réponse(s) arbitrée(s) », cliquable. `forbidden` (écriture sur une entité dont l'émetteur n'est pas propriétaire, §9.9) : l'op sort de l'outbox vers un état « rejetée » visible, jamais rejouée silencieusement. `error` : backoff exponentiel (max 1 min) + compteur ; au 10e échec → statut « à examiner » visible dans l'UI (jamais de suppression silencieuse). **(V2.9) Re-réponse hors ligne** : le client n'émet JAMAIS d'op de révision — une re-réponse arrive en `upsert` ordinaire et c'est le SERVEUR qui matérialise la ligne `answer_revisions` (origine `terrain`) quand `value` change ; une seule implémentation possible pour L5b et L6a.

## 9.4 Conflits

- Modèle de données quasi sans conflit par construction : chaque réponse appartient à UN entretien mené par UN consultant sur SON appareil. Le cas résiduel (même entretien édité sur deux appareils) est résolu en **last-write-wins par LIGNE** sur `client_updated_at` (décision V2.2 : le modèle porte un horodatage par ligne, pas par champ — granularité ligne assumée, suffisante pour un modèle où une réponse est une ligne atomique ; V2.9 : `client_updated_at` existe sur les TROIS entités synchronisées — `answers`, `interviews`, `attachments` — fichier 04), ET toute valeur écrasée est archivée dans `answer_revisions` (rien n'est perdu, arbitrage humain possible).
- Les entités « siège » (questions, missions, gabarits) ne sont JAMAIS modifiées depuis le terrain (sauf questions ad hoc, qui sont des créations, donc sans conflit).

## 9.5 Pull (descente vers le terrain)

- Curseur par mission (`updated_at` serveur max reçu). `GET /sync/pull?since=` renvoie le delta.
- Les modifications siège du questionnaire n'atteignent le terrain QUE via « resynchroniser le questionnaire » (volontaire, §M2.4) — un consultant en plein entretien ne voit jamais son questionnaire bouger sous ses doigts.

## 9.6 Pièces jointes

- Upload séparé du push JSON, après les données. **Protocole de reprise (V2.2)** : découpage en chunks de 5 Mo — `POST /v1/sync/attachments/:id/chunks/:index` (idempotent par couple id+index) · `GET /v1/sync/attachments/:id/status` → liste des chunks reçus (la reprise n'envoie QUE les manquants) · `POST /v1/sync/attachments/:id/complete {sha256}` → le serveur assemble et vérifie le checksum (échec → 409 + liste des chunks à réémettre). Une réponse peut être synchronisée avant sa photo ; l'attachement porte son propre statut.

## 9.7 Sécurité locale

- IndexedDB chiffré au niveau applicatif (AES-GCM). **Architecture de clés (V2.2)** : une **DEK** AES-256 aléatoire par appareil chiffre les données ; la DEK est enveloppée par une **KEK** dérivée du mot de passe (Argon2id + sel local par appareil) et stockée enveloppée. Changement de mot de passe EN LIGNE = simple ré-enveloppement de la DEK (les données ne sont jamais re-chiffrées). **Garde-fou** : le serveur refuse la réinitialisation admin d'un mot de passe tant que le dernier état de sync connu signale un outbox non vide, sauf confirmation explicite « perte locale possible » (journalisée + alerte). (V2.9 — la donnée du garde-fou est DÉFINIE : chaque push remonte `outbox_remaining`, conservé dans `sync_log` ; « outbox non vide » = dernier `sync_log.outbox_remaining` > 0 ou aucune sync connue de l'appareil.) La KEK n'est tenue qu'en mémoire de session — un portable volé ne livre pas les données d'un client grand compte en clair.
- **Verrouillage de la PWA (V2.10 — règle en deux temps, pensée pour le terrain)** : 15 min d'inactivité HORS session de collecte ; **pendant une session `en_cours` sur l'appareil, le délai est porté à 60 min** — l'inactivité se mesure sur TOUTE interaction (tactile, clavier, scroll), et le **Screen Wake Lock** (Safari ≥ 16.4, Chrome) maintient l'écran éveillé tant que la session est active : un interlocuteur qui parle 20 minutes, une observation d'atelier ou une démonstration d'ERP ne déclenchent JAMAIS une ressaisie de mot de passe en pleine collecte. **Bouton de verrouillage manuel d'un geste** sur toutes les vues terrain (l'auditeur qui pose sa tablette verrouille lui-même — c'est LUI le premier périmètre de sécurité). Ressaisie du mot de passe au déverrouillage ; les données restent locales. **Décision gravée : AUCUN mécanisme de déverrouillage affaibli en V1** (pas de PIN court, pas de schéma — la KEK dérive du mot de passe et de rien d'autre) ; étude Phase 2 : déverrouillage biométrique WebAuthn (extension PRF) enveloppant la DEK — un confort, jamais une clé plus faible.
- « Décharger la mission » : purge locale complète après sync intégrale vérifiée (fin de mission).
- **Export de secours chiffré (V2.2 — parade au vol/casse/perte hors ligne)** : action « Exporter une sauvegarde » — fichier unique chiffré (AES-GCM) contenant les données de mission locales + l'outbox, déposable sur le stockage de l'appareil ou une clé USB ; importable sur un autre appareil du même compte (restauration intégrale, testée en recette). Consigne d'exploitation gravée (invariant 8 du 00_INDEX) : sync au moins 1×/jour en mission (au besoin par partage de connexion téléphone) + export de secours quotidien ; alerte automatique « aucune sync depuis 24 h » (cloche §20.4).

## 9.8 Tests obligatoires du moteur (voir §13)

Coupures réseau en pleine saisie, kill de l'app pendant un push, double envoi du même lot, horloge locale déréglée (+3 h), 2 appareils sur la même mission, 5 000 réponses + 200 photos en file, reprise d'upload interrompu à 80 %, expiration du refresh token en mission longue (§31.3). **Huit scénarios** — tous scriptés Playwright et marqués `@critique`.

## 9.9 Propriété des écritures (règle serveur — V2.2)

Toute écriture de sync sur `interviews`, `answers`, `attachments` n'est acceptée que si l'émetteur du push est le PROPRIÉTAIRE de la session (`interviews.conducted_by`) — sinon réponse `forbidden` (§9.3), rien n'est appliqué. Les autres membres de la mission consultent en LECTURE (pull). Exception tracée : le lead de mission et l'admin corrigent via l'API siège (`PATCH /v1/answers/:id`, motif obligatoire, révision automatique d'origine `correction_siege`) — jamais via le push de sync. Le cas « même entretien sur deux appareils » (§9.4) ne concerne donc que le MÊME utilisateur. Testé en intégration (RBAC exhaustif) et à la porte P-B.

---

# 24. CORRECTIONS ISSUES DE L'AUDIT 30 AGENTS (27/08/2026) — APPLIQUÉES

_(Le rapport d'audit 30 agents n'est pas joint au pack : ses conclusions sont intégralement reprises ici. Ces corrections font partie intégrante du schéma et du plan.)_

## 24.1 Tables ajoutées au schéma (§7)

**(V2.2) Le DDL de `step_validations` (avec `step_code` énuméré §32.2), `alerts` et `scoping_financials` vit désormais EXCLUSIVEMENT dans le fichier 04 — source unique du schéma.** Rappel des règles associées : P1-1 persistance du workflow §19.1 · P1-2 centre d'alertes §20.4 (jamais supprimées) · P1-3 les données financières sont hors de `scoping_estimates`, routes et requêtes admin EXCLUSIVEMENT, aucune jointure côté endpoints consultants.

- **P1-4** : règle généralisée — TOUTE entité créable hors ligne (`interviews`, `answers`, `attachments`, ET les `questions`/`mission_questions` ad hoc) porte un UUID v7 généré côté client ; le serveur upsert par cet id, idempotent.
- **P1-5** : la note volante (§17.4) est un `attachments` de `kind='note'` avec champ `content TEXT` (colonne ajoutée), rattachement (interview_id/answer_id) complétable après coup.
- **P2-1** : `interviews.person_service_id` = fonction métier de la PERSONNE (raccourci) ; l'unité d'audit est TOUJOURS `org_unit_id`.

## 24.2 API complétée (§8)

CRUD ajoutés, conventions identiques : `/v1/missions/:id/org-units` (+ import CSV) · `/v1/missions/:id/assignments` · `/v1/missions/:id/findings` · `/v1/missions/:id/roadmap-items` · `/v1/missions/:id/steps/:code/validate` (+ override admin) · `/v1/missions/:id/alerts` (+ ack) · `/v1/missions/:id/document-requests` · `/v1/scoping` (+ `/financials`, admin only) · **`PATCH /v1/answers/:id` (V2.2 : correction siège tracée — lead/admin, motif obligatoire, révision automatique `correction_siege` ; c'est LA voie de correction hors terrain, §9.9)** · **`PATCH /v1/interviews/:id/reassign {new_user_id, motif}` (V2.5 §34.4 : réaffectation d'une session PLANIFIÉE non commencée — admin/lead, refusée si status ∈ en_cours/termine, activity_log)**.

## 24.3 Exploitation

- **P1-7** : MinIO intégré au plan 3-2-1 — `mc mirror` quotidien vers la Storage Box + copie hebdo hors Hetzner + inclusion dans le test de restauration nocturne (restauration d'un échantillon de fichiers + vérification de checksums).

## 24.4 Génération documentaire

- **P1-8** : DÉCISION — achat de la licence du module image docxtemplater (le cœur est MIT ; l'insertion des graphiques radar/heatmap dans le DOCX requiert ce module commercial). Repli documenté si besoin : post-traitement via la bibliothèque `docx`. **P2-2** : graphiques générés en SVG puis convertis en PNG 2x via `sharp` (worker). **P2-3** : pseudonymisation LLM = remplacement des `person_name` connus par « [fonction, unité] » via table de correspondance de la mission ; relecture humaine systématique des verbatims avant validation (état `valide`).

## 24.5 Re-priorisation Phase 1 (P0-2) — NOYAU STRICT vs DIFFÉRABLE

**Noyau strict (chiffrage historique — la référence de charge unique est dans le 00_INDEX : 26 j-h ; le CONTENU des lots fait foi dans le fichier 07 V2.2)** : L0 infra+sauvegardes (Postgres ET MinIO) · L1 schéma complet (avec §24.1) · L2 auth+RBAC (dont séparation financière) · L3 missions+arbre org_units+moteur questionnaire+plan d'entretiens · L4 import banque · L5 PWA terrain complète (3 zones, types de réponse, à-revoir, notes, ad hoc, validation d'entretien, verrouillage local, iPad+PC) · L6 sync (8 scénarios §9.8) · L7-min export mission CSV/JSON + vue avancement simple.
**Différable de 2-4 semaines sans risque (~11 j-h, livrable pendant la collecte)** : scoring+radar (L8) · heatmap · centre d'alertes complet (les contrôles de fin d'entretien/visite du noyau couvrent l'anti-oubli en attendant) · badge avance/retard · console espaces 3-7 · estimation/simulateur complet (une estimation le client pilote peut se faire sur tableur avec les abaques en attendant).
**Règle de décision** : est nécessaire en septembre uniquement ce qui conditionne la COLLECTE terrain fiable ; tout le reste peut arriver pendant que la collecte tourne, avant la phase d'analyse.

---

# 31. COMPLÉMENT PWA — 3 RÈGLES RÉSIDUELLES (27/08/2026)

_(Passe technique dédiée PWA. Complète §9, §22.1 et le lot L5.)_

1. **Mise à jour applicative en mission** : le service worker télécharge les nouvelles versions en arrière-plan mais ne les active JAMAIS pendant un entretien en cours ; bandeau discret « Nouvelle version disponible — appliquer » actionné par l'auditeur entre deux entretiens ; compatibilité ascendante du schéma local Dexie (migrations locales versionnées, testées) pour qu'une mise à jour n'invalide jamais des données non synchronisées.
2. **Persistance du stockage explicite** : appel `navigator.storage.persist()` au premier chargement d'une mission ; si la persistance est refusée par le navigateur, la mission N'EST PAS embarquée et l'écran guide l'utilisateur (installation sur l'écran d'accueil / libération d'espace). Vérification du quota (`storage.estimate()`) déjà prévue, conservée.
3. **Expiration de session hors ligne** : la SAISIE ne dépend jamais du serveur — si le refresh token (30 j) expire pendant une longue période hors ligne, le déverrouillage local (clé dérivée du mot de passe) continue de fonctionner, la collecte se poursuit sans interruption ; seule la synchronisation attend une reconnexion authentifiée. Message clair à l'auditeur (« reconnexion requise pour synchroniser — vos données sont en sécurité sur l'appareil »). Testé dans les scénarios E2E (8e scénario ajouté au §9.8).

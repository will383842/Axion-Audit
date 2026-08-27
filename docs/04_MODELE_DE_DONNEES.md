# MODELE DE DONNEES

> **Pack d'implémentation Axion Audit — fichier 04/12** · Pack V2.12 (27/08/2026) — DDL unique consolidé après revue adversariale indépendante
> **Contenu :** Schéma PostgreSQL 16 INTÉGRAL — source UNIQUE du lot L1. Toutes les tables et colonnes des sections 1-15, des avenants 16-29 et des corrections V2.2 (§32) sont ici.
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. **Tout DDL apparaissant ailleurs (fichiers 01, 03, 05, CDC maître) est historique et remplacé par le présent fichier.** Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25, §29 et dans ce DDL.

---

# 7. MODÈLE DE DONNÉES COMPLET (PostgreSQL 16) — VERSION V2.2 CONSOLIDÉE

Conventions : `id` = UUID (v7 pour l'ordonnancement temporel), `created_at`/`updated_at` TIMESTAMPTZ partout, suppression logique (`deleted_at`) sur les tables métier, FK indexées, contraintes CHECK sur les enums. **(V2.9)** Colonnes sans type explicite : `TEXT` par défaut. **FK avant/circulaires** (`interviews.linked_review_answer_id → answers`, `interviews.document_request_id → document_requests`) : créées par `ALTER TABLE` en FIN de migration — une transcription table par table dans l'ordre du fichier ne compile pas sans cela. Règle P1-4 : TOUTE entité créable hors ligne (`interviews`, `answers`, `attachments`, `org_units` proposées, `questions`/`mission_questions` ad hoc) porte un **UUID v7 généré côté client** ; le serveur upsert par cet id, idempotent.

```sql
-- ═══════════════ RÉFÉRENTIELS ═══════════════
users(id, name, email UNIQUE, password_hash,
      role CHECK IN ('admin','consultant','analyste','lecteur'),
      usage_profile CHECK IN ('guide_strict','expert') DEFAULT 'guide_strict',   -- §19.1 (réglé par l'admin)
      habilitated_at TIMESTAMPTZ NULL,           -- V2.5 §34.4 : posé par l'admin après bac à sable + cotation croisée ;
                                                 -- l'affectation mission_users est REFUSÉE côté serveur si NULL
                                                 -- V2.8 : le SEED L1 pose habilitated_at sur le compte admin fondateur
                                                 -- (sinon auto-verrouillage : impossible de s'affecter sa propre première mission)
      is_active BOOL, last_login_at, created_at, updated_at)

refresh_tokens(id, user_id FK, token_hash, expires_at, revoked_at, device_label)

sectors(id, code UNIQUE, label_fr, label_en, is_active)
services(id, code UNIQUE, label_fr)              -- les 11 fonctions métier de la taxonomie
interlocutor_profiles(id, code UNIQUE, label_fr,
      group_code CHECK IN ('direction','encadrement','terrain'))   -- V2.2 §32.1 : base du calcul de divergence direction/terrain
size_tiers(id, code UNIQUE, label, headcount_min, headcount_max)   -- micro, pme, eti, grand_compte
naf_sector_map(naf_code PK, sector_id FK)        -- R4 : pré-remplissage secteur (administrée, console espace Contenu)

-- ═══════════════ CLIENTS & MISSIONS ═══════════════
companies(id, external_ref,                      -- id client console axion-ia.com (NULL si local)
          name, siren TEXT NULL,                 -- V2.2 : NULL autorisé (filiales étrangères) ;
                                                 -- index UNIQUE partiel WHERE siren IS NOT NULL (clé de dédup R3, alerte doublon)
          naf_code TEXT NULL,                    -- R4
          sector_id FK, headcount, sites_count, countries JSONB,
          notes, created_at, updated_at, deleted_at)

missions(id, company_id FK, parent_mission_id FK NULL,   -- consolidation groupe → missions filles (§32.3)
         title, geo_scope CHECK IN ('france','multi_pays'), country_code NULL,
                                                 -- V2.9 : geo_scope = périmètre COMMERCIAL ; une mission fille de déclinaison
                                                 -- conserve 'multi_pays' et porte son country_code (jamais 'france' hors France)
         size_tier_id FK, active_sectors JSONB, active_blocks JSONB,
         audit_level CHECK IN ('diagnostic_cadrage','operationnel','strategique_groupe'),   -- §20.1
         commercial_offer CHECK IN ('audit_flash','audit_cible','mission_pme','mission_eti','grand_programme') NULL,
         timezone TEXT DEFAULT 'Europe/Paris',   -- §22.2
         nda_ref TEXT NULL, nda_signed_at DATE NULL,     -- V2.2 : référence NDA exigée §20.2/§27.4
         status CHECK IN ('preparation','en_cours','en_analyse','livree','cloturee'),
         llm_provider CHECK IN ('anthropic','ue_hosted') DEFAULT 'anthropic',
         start_planned, end_planned, delivered_at, created_by FK users,
         created_at, updated_at, deleted_at)

mission_users(mission_id FK, user_id FK,
              role_on_mission CHECK IN ('lead','consultant','analyste','lecteur'),
              PRIMARY KEY(mission_id, user_id))

-- ═══════════════ ORGANISATION (§16.2, §25.3, §26.3, R6) ═══════════════
org_units(id,                                    -- UUID v7 côté client possible (proposition terrain §25.3)
          mission_id FK, parent_id FK org_units NULL,
          kind CHECK IN ('groupe','filiale','etablissement','direction','service','equipe','poste'),  -- §26.3
          name, country_code NULL, timezone TEXT NULL,   -- §22.2 (héritage arbre : NULL = fuseau de la mission)
          headcount INT NULL,
          service_ref_id FK services NULL,       -- mapping taxonomie 11 fonctions
          sector_id FK sectors NULL,             -- R6 : secteur surchargé par unité (holdings multi-activités)
          in_scope BOOL DEFAULT true,            -- règle V2.2 §25.1 : sortie de périmètre = données conservées, exclues scoring/couverture
          status CHECK IN ('active','proposee','fusionnee') DEFAULT 'active',   -- §25.3
          proposed_by FK users NULL, merged_into_id FK org_units NULL,
          position, created_at, updated_at)

-- ═══════════════ QUESTIONNAIRE ═══════════════
blocks(id, code UNIQUE, label_fr, position, is_default BOOL, description)   -- seed : 9 blocs (§2.1)

questions(id, code TEXT NULL,               -- V2.9 : identifiant STABLE de banque (clé de l'import/ré-import §36.4) ;
                                             -- UNIQUE(code, version) partiel WHERE code IS NOT NULL ; NULL pour les ad hoc non versées
          block_id FK, version INT, status CHECK IN ('draft','active','archived'),
                                             -- V2.9 : une NOUVELLE VERSION = une NOUVELLE LIGNE (même code, version+1,
                                             -- l'ancienne passe 'archived') — JAMAIS de mutation en place : les
                                             -- mission_questions figées pointent une ligne immuable
          text_fr, guidance_fr,                  -- consigne consultant + ANCRES DE COTATION (§32.4 : « 1 = …, 3 = …, 5 = … » obligatoires sur les échelles)
          answer_type CHECK IN ('yes_no','scale_1_5','single_choice','multi_choice',
                                'free_text','number','percent','duration','money','date','table'),
          options JSONB,                         -- structure NORMÉE V2.2 : [{code TEXT, label TEXT, score NUMERIC NULL}]
          allow_range BOOL DEFAULT false,        -- V2.2 §27.4 : mode « fourchette » autorisé (number/percent/duration/money)
          weight NUMERIC DEFAULT 1,              -- 0 = hors scoring
          scoring JSONB NULL,                    -- V2.2 §32.1 : barème valeur→points + déclencheur drapeau rouge (format normé)
          criticality CHECK IN ('bloquant','important','informatif') DEFAULT 'important',
          expected_source CHECK IN ('entretien','observation','demonstration','document','releve') NULL,  -- §27.6
          sectors JSONB,                         -- [] = universelle
          target_services JSONB,                 -- paquets par service, [] = transverse (§16.3)
          levels JSONB,                          -- niveaux d'audit applicables (§20.1)
          headcount_min INT, headcount_max INT,
          profiles JSONB,                        -- interlocuteurs visés
          geo CHECK IN ('france','multi_pays','tous') DEFAULT 'tous',
          display_if JSONB NULL,                 -- logique conditionnelle V2 {question_id, values[]}
          origin CHECK IN ('banque','ad_hoc'), origin_mission_id FK NULL,
          created_by FK, created_at, updated_at)

question_translations(question_id FK, lang, text, guidance, PRIMARY KEY(question_id, lang))  -- V2

mission_questions(id, mission_id FK, question_id FK, question_version INT,
                  text_snapshot, options_snapshot JSONB, weight_snapshot,
                  scoring_snapshot JSONB,        -- V2.2 : le barème est figé avec la question
                  guidance_snapshot TEXT, answer_type_snapshot, criticality_snapshot, allow_range_snapshot BOOL,
                                                 -- V2.9 : figeage COMPLET — la mission est autonome de la banque
                                                 -- (consigne + ANCRES §33.3 rendues hors ligne, type de saisie,
                                                 -- criticité/poids à l'export §36.3) ; le pull terrain lit CES snapshots,
                                                 -- jamais la banque vivante
                  position, added_ad_hoc BOOL DEFAULT false)

-- ═══════════════ COLLECTE — SESSIONS (§27.1, §25.2, §25.6, §28.1) ═══════════════
-- Décision V2.2 (§32.6) : résolution de la collision §25.6/§27.1 — le TYPE de session (kind)
-- est distinct du MODE d'entretien (mode). 'complementaire' est un mode d'entretien, pas un type.
interviews(id,                                   -- UUID v7 CÔTÉ CLIENT
           mission_id FK, conducted_by FK users, -- PROPRIÉTAIRE : seul habilité à écrire via sync (§9.9) ;
                                                 -- réaffectable par admin/lead UNIQUEMENT si status ≠ en_cours/termine (§34.4) ; immuable après réalisation
           kind CHECK IN ('entretien','observation','demonstration','analyse_documentaire',
                          'releve_donnees','atelier') DEFAULT 'entretien',
           mode CHECK IN ('sur_site','distanciel','complementaire') NULL,   -- défaut APPLICATIF (V2.8) : 'sur_site' si kind='entretien', NULL sinon (un DEFAULT SQL conditionnel n'existe pas)
           linked_review_answer_id FK answers NULL,   -- §25.6 : l'entretien complémentaire lève un à-revoir
           person_name NULL, person_role NULL, person_service_id FK services NULL, person_email NULL,
                                                 -- P2-1 : person_service_id = fonction de la PERSONNE ; l'unité d'audit est TOUJOURS org_unit_id
                                                 -- §27.1 : champs personne optionnels si kind ≠ entretien
           participants JSONB NULL,              -- §28.1 atelier : [{nom, fonction}]
           org_unit_id FK org_units,
           document_request_id FK document_requests NULL,   -- §27.1 analyse_documentaire
           consent_given BOOL, consent_audio BOOL, consented_at,
           information_notice_version TEXT NULL, notice_shown_at TIMESTAMPTZ NULL,   -- V2.2 RGPD §10.4
           scheduled_at TIMESTAMPTZ NULL, scheduled_duration_min INT NULL,           -- §25.2 agenda
           schedule_status CHECK IN ('a_planifier','planifie','confirme','realise','reporte','annule') DEFAULT 'a_planifier',
           status CHECK IN ('non_demarre','en_cours','termine') DEFAULT 'non_demarre', started_at, ended_at,
                                                 -- V2.9 : 'non_demarre' = session planifiée/créée non commencée (§25.2) —
                                                 -- rend exécutable la règle de réaffectation §34.4 (status ≠ en_cours/termine)
           general_notes TEXT,
           client_created_at, client_updated_at,   -- V2.9 : requis par le LWW par ligne §9.4 et le contrat d'op 11 §4 (entity 'interview')
           synced_at, created_at, updated_at)

answers(id,                                      -- UUID v7 CÔTÉ CLIENT (clé d'idempotence)
        interview_id FK, mission_question_id FK,
        -- V2.2 (§32.6) : UNIQUE(interview_id, mission_question_id) — UNE réponse par question et par session ;
        -- toute re-réponse = révision (answer_revisions). Le hors-parcours est un flag de la même réponse.
        value JSONB,                             -- {type, v} ; money : {type:'money', v, currency (déf. 'EUR')} (§22.2) ;
                                                 -- fourchette : {type:'range', low, high} (+ currency si money) (§27.4)
        source CHECK IN ('entretien','observation','demonstration','document','releve') DEFAULT 'entretien',  -- §27.1 provenance
        withheld BOOL DEFAULT false,
        withheld_reason CHECK IN ('confidentiel','non_disponible','hors_perimetre','autre') NULL,  -- §27.4
        hors_parcours BOOL DEFAULT false,        -- §25.4
        note TEXT, flag_review BOOL DEFAULT false, review_reason NULL,
        not_applicable BOOL DEFAULT false, na_reason NULL,
        question_text_snapshot,                  -- redondance volontaire (décision V1)
        revision INT DEFAULT 1,
        client_created_at, client_updated_at, synced_at, created_at, updated_at)

answer_revisions(id, answer_id FK, previous_value JSONB, changed_by FK, changed_at,
                 change_origin CHECK IN ('terrain','sync_arbitrage','correction_siege') DEFAULT 'terrain')  -- V2.2 : traçabilité §9.3/§9.9

attachments(id,                                  -- UUID v7 côté client
            interview_id FK NULL, answer_id FK NULL, mission_id FK,
            kind CHECK IN ('photo','document','audio','note'),   -- V2.2 : 'note' intégré au CHECK (P1-5)
            content TEXT NULL,                   -- P1-5 : corps de la note volante (rattachement complétable après coup)
            filename NULL, mime NULL, size_bytes NULL, storage_key NULL,   -- NULL pour kind='note'
            transcription TEXT NULL,             -- audio V2
            purge_after DATE NULL,               -- RGPD (audio)
            client_created_at, client_updated_at,   -- V2.9 : le rattachement d'une note volante est complétable après coup (P1-5)
                                                    -- = ligne modifiable → LWW §9.4 et op 'attachment_meta' (11 §4)
            synced_at, created_at)

-- ═══════════════ INVENTAIRES & AI ACT (§27.3, bloc 9) ═══════════════
tools_inventory(id, mission_id FK, org_unit_id FK NULL, name,
                category CHECK IN ('erp','crm','bureautique','metier','ia','fichier_excel','papier','autre'),
                vendor NULL, usage_description, users_count INT NULL,
                criticality CHECK IN ('critique','importante','faible'),
                data_quality_note NULL, source_session_id FK interviews NULL, created_at)

ai_systems(id, mission_id FK, org_unit_id FK NULL,       -- §16.2
           name, vendor, usage_description, data_categories JSONB,
           service_id FK NULL, business_owner,
           actor_role CHECK IN ('deployeur','fournisseur','les_deux'),
           risk_level CHECK IN ('inacceptable','haut_risque','risque_limite_art50','minimal'),
           obligations JSONB, compliance_status CHECK IN ('conforme','partiel','non_conforme','a_qualifier'),
           source CHECK IN ('declare','detecte_entretien'), notes, created_at, updated_at)

-- ═══════════════ ANALYSE, SCORING & CONSTATS (§32.1, §16.4, §16.5) ═══════════════
block_scores(mission_id FK, block_id FK, score NUMERIC, computed_at, details JSONB,
             completeness NUMERIC NULL,          -- V2.2 §27.4 : % de questions scorables répondues
             is_indicative BOOL DEFAULT false,   -- V2.2 : sous le seuil de complétude (défaut 60 %, estimation_params
                                                 -- clé seuil_completude_bloc — V2.9 : aligné sur §32.1 et le seed 11 §5)
             PRIMARY KEY(mission_id, block_id))

unit_scores(mission_id FK, org_unit_id FK, block_id FK, score NUMERIC,
            answers_count INT,                   -- seuil de fiabilité d'affichage : défaut 3 (estimation_params,
                                                 -- clé seuil_fiabilite_answers — V2.9 : aligné sur §32.1 et le seed 11 §5)
            completeness NUMERIC NULL, computed_at,
            PRIMARY KEY(mission_id, org_unit_id, block_id))

findings(id, mission_id FK, org_unit_id FK NULL, block_id FK NULL,
         severity CHECK IN ('drapeau_rouge','majeur','mineur','point_fort'),
         title, statement TEXT,
         sources JSONB,                          -- V2.2 §27.2 : {answer_ids[], session_ids[], attachment_ids[]} — ≥ 1 source obligatoire
         recommendation TEXT, owner_suggested,
         remediation_status CHECK IN ('a_traiter','planifie','en_cours','clos','abandonne') DEFAULT 'a_traiter',
         wave CHECK IN ('quick_win','chantier','transformation') NULL,
         status CHECK IN ('brouillon','valide') DEFAULT 'brouillon',   -- §25.5 point d'étape n'utilise que des brouillons choisis
         created_by FK, created_at, updated_at)

-- ═══════════════ CAS D'USAGE & FEUILLE DE ROUTE (§20.3, §28) ═══════════════
use_cases(id, mission_id FK, org_unit_id FK NULL,        -- §16.2
          title, description, service_id FK NULL,
          status CHECK IN ('candidate','short_list','ecarte','retenu') DEFAULT 'candidate',  -- §20.2 étape 04
          conditions TEXT NULL,                  -- conditions de réussite (§20.3)
          estimated_gain, estimated_cost, complexity CHECK IN ('faible','moyenne','elevee'),
          delay_months INT, risk_level CHECK IN ('faible','moyen','eleve'),
          wave CHECK IN ('quick_win','chantier','transformation') NULL,
          baseline_value NUMERIC NULL, baseline_unit TEXT NULL,
          baseline_source_session_id FK interviews NULL, target_value NUMERIC NULL,   -- §28.1-1
          data_required TEXT NULL, data_available CHECK IN ('oui','partiel','non','a_verifier') NULL,
          approach CHECK IN ('acheter','integrer','developper') NULL, success_metric TEXT NULL,  -- §28.1-2
          assumptions TEXT NULL, gain_low NUMERIC NULL, gain_high NUMERIC NULL, payback_months INT NULL,  -- §28.2-5 (colonnes créées dès L1, exploitées Phase 2)
          taxonomy_ref NULL,                     -- réf. taxonomie 50 cas d'usage Axion-IA
          created_at, updated_at)

roadmap_items(id, mission_id FK, use_case_id FK NULL,
              palier INT, month_start INT, month_end INT,
              description, expected_gain, kpi, assimilation_weeks INT,   -- §20.3
              baseline_value NUMERIC NULL, baseline_unit TEXT NULL, target_value NUMERIC NULL,  -- §28.1-1
              depends_on JSONB NULL,             -- §28.2-6 (ids d'actions, contrôle de cohérence Phase 2)
              scenario CHECK IN ('standard','prudent','ambitieux') DEFAULT 'standard',  -- §28.2-8
              created_at, updated_at)

-- ═══════════════ RAPPORT ═══════════════
report_sections(id, mission_id FK, block_id FK NULL, section_code, position,
                raw_data JSONB, generated_text TEXT NULL, generated_at,
                llm_model, llm_tokens INT, llm_cost_eur NUMERIC,
                validated_text TEXT NULL, validated_by FK NULL, validated_at,
                status CHECK IN ('brut','genere','valide'))

report_templates(id, name,
                 audit_level CHECK IN ('diagnostic_cadrage','operationnel','strategique_groupe') NULL,
                                                 -- V2.2 (§32.6) : clé = NIVEAU D'AUDIT (§26.2 prévaut sur M1.5/size_tier)
                 kind CHECK IN ('rapport','point_etape') DEFAULT 'rapport',   -- §25.5
                 storage_key, version, is_active, created_at)

report_files(id, mission_id FK, template_id FK, kind CHECK IN ('docx','pdf','pptx'),
             storage_key, generated_by FK, generated_at)

-- ═══════════════ CADRAGE, CHIFFRAGE & PILOTAGE (§18, §24.1, §25.1) ═══════════════
scoping_estimates(id, company_id FK, mission_id FK NULL,
    scope_tree JSONB, planned_interviews JSONB,
    workload_days NUMERIC, team_size INT, calendar_days INT, scenario_label,
    status CHECK IN ('brouillon','envoye_console','signe','abandonne'),
    created_by FK, created_at, updated_at)
    -- P1-3 : AUCUNE colonne financière ici — voir scoping_financials

scoping_financials(scoping_estimate_id PK FK, daily_rates JSONB, travel_costs NUMERIC,
    total_amount NUMERIC, currency DEFAULT 'EUR', updated_by FK, updated_at)
    -- Accès : routes et requêtes admin EXCLUSIVEMENT ; aucune jointure côté endpoints consultants (E21)

estimation_params(key PRIMARY KEY, value NUMERIC, unit, description, updated_by FK, updated_at)
    -- Clés normées (seed L1) : duree_<type_session>_<profil> · preparation_<palier> · analyse_par_bloc ·
    -- redaction_<palier> · deplacement_par_site · taux_horaire_charge_<categorie> (§32.4 ROI) ·
    -- seuil_completude_bloc (0.60) · seuil_fiabilite_answers (3) · seuil_divergence_ecart_type (1.5)

work_assignments(id, mission_id FK, user_id FK, org_unit_id FK,
                 planned_interviews INT, planned_days NUMERIC,
                 date_from, date_to, UNIQUE(mission_id, user_id, org_unit_id))

mission_rebaselines(id, mission_id FK, delta_interviews INT, delta_days NUMERIC,
                    decision CHECK IN ('absorbe','avenant','descope'), note,
                    decided_by FK, decided_at)   -- §25.1 (Phase 2 ; processus manuel mission 1 : voir 07 §15)

document_requests(id, mission_id FK, org_unit_id FK NULL, label, description,
                  status CHECK IN ('demande','recu','partiel','non_disponible'),
                  attachment_id FK NULL, requested_at, received_at)

step_validations(id, mission_id FK,
    step_code CHECK IN ('cadrage','preparation','collecte','analyse','rapport','livraison',
                        'entretien','unite'),    -- V2.2 §32.2 : énumération fermée (P1-1)
    scope CHECK IN ('mission','interview','org_unit'), scope_id NULL,
    validated_by FK users, validated_at, was_override BOOL DEFAULT false, override_reason NULL)
    -- Cohérence : step_code ∈ {entretien}→scope=interview · {unite}→scope=org_unit · autres→scope=mission

alerts(id, mission_id FK, org_unit_id FK NULL, user_id FK NULL,   -- P1-2 §20.4
    type, severity, message, entity_type NULL, entity_id NULL,
    status CHECK IN ('active','acquittee','resolue'), ack_by FK NULL, ack_reason NULL, ack_at,
    created_at)   -- générées par jobs worker + triggers ; jamais supprimées

-- ═══════════════ PHASE 2/3 (DDL de référence — créées par les migrations de leurs lots) ═══════════════
surveys(id, mission_id FK, org_unit_scope JSONB, questions JSONB, opens_at, closes_at)          -- §28.2-4
survey_responses(id, survey_id FK, org_unit_id FK, answers JSONB, submitted_at)                 -- anonymat structurel, k≥5
solutions_catalog(id, name, vendor, category, use_case_tags JSONB, indicative_cost,
                  eu_hosting BOOL, notes, missions_used JSONB, status, updated_at)              -- §28.2-7

-- ═══════════════ TRANSVERSE ═══════════════
processed_ops(op_id PRIMARY KEY,                -- V2.3 : déduplication du push (§9.2 « op_id déjà vu → ignoré »)
              batch_id, result, processed_at)  -- rétention 30 j (job de purge) ; 2e ceinture = upsert par UUID d'entité

sync_log(id, user_id FK, device_id, direction CHECK IN ('push','pull'),
         items_count INT, conflicts_count INT,
         outbox_remaining INT NULL,              -- V2.9 : taille d'outbox restante remontée par le client à chaque push —
                                                 -- LA donnée du garde-fou reset mot de passe §9.7
         started_at, ended_at, status, error TEXT NULL)

integration_events(id, direction CHECK IN ('in','out'), system CHECK IN ('console','crm_pro'),
                   event_type, payload JSONB, nonce TEXT NULL, event_timestamp TIMESTAMPTZ NULL,  -- V2.2 anti-rejeu §8.6
                   status CHECK IN ('pending','ok','failed'),
                   attempts INT, last_attempt_at, created_at)

activity_log(id, user_id FK, action, entity_type, entity_id, meta JSONB, ip, created_at)
    -- V2.2 RGPD : rétention 12 mois puis purge ; IP anonymisée à 90 j (jobs planifiés §10.4)

llm_calls(id, mission_id FK, section_id FK NULL, provider, model, prompt_version,
          tokens_in, tokens_out, cost_eur, duration_ms, status, created_at)

app_settings(key PRIMARY KEY, value JSONB)       -- seuils, purges, URLs console, secrets chiffrés (AES via APP_ENCRYPTION_KEY)
```

## 7.1 Index critiques (V2.2)

`answers(interview_id)` · `answers(mission_question_id)` · index UNIQUE `answers(interview_id, mission_question_id)` · `interviews(mission_id)` · `interviews(org_unit_id)` · `interviews(conducted_by)` · `interviews(schedule_status)` · `org_units(mission_id)` · `org_units(parent_id)` · `missions(company_id)` · `missions(status)` · `missions(parent_mission_id)` · `questions(status, block_id)` · index UNIQUE partiel `questions(code, version) WHERE code IS NOT NULL` (V2.9) · GIN sur `questions.sectors`, `questions.profiles`, `questions.target_services` · index UNIQUE partiel `companies(siren) WHERE siren IS NOT NULL` · `findings(mission_id)` · `use_cases(mission_id)` · `roadmap_items(mission_id)` · `attachments(mission_id)` · `step_validations(mission_id, step_code)` · `alerts(mission_id, status)` · `work_assignments(mission_id)` · `document_requests(mission_id)` · `integration_events(status)` · `integration_events(nonce)` · `processed_ops(processed_at)` · `activity_log(entity_type, entity_id)` · `sync_log(user_id, started_at)`.

## 7.2 Relations clés (décisions prises)

Entreprise 1→n missions · mission ↔ utilisateurs via `mission_users` · mission 1→n unités (`org_units`, arbre) · mission 1→n sessions de collecte (`interviews`) · session 1→n réponses · bloc 1→n questions · mission mère 1→n missions filles (consolidation groupe, §32.3) · snapshot du questionnaire (texte + options + barème) dans `mission_questions` · snapshot du texte de question dans la réponse · propriétaire d'une session = `conducted_by` (règle d'écriture §9.9).

## 7.3 Format normé du champ `questions.scoring` (JSONB — spécification complète : fichier 03 §32.1)

Rappel de structure (le fichier 03 §32.1 est la référence métier) :

- `yes_no` : `{"map": {"oui": 5, "non": 0}}` (inversable par question).
- `scale_1_5` : `{"map": "identity"}`.
- `single_choice` / `multi_choice` : `{"source": "options"}` (+ `"aggregate": "max"|"mean"` pour multi) — les scores vivent dans `options[].score`.
- `number` / `percent` / `duration` / `money` : `{"bands": [{"max": 20, "score": 1}, {"max": 50, "score": 3}, {"score": 5}]}` — ou `weight = 0` (hors scoring).
- `free_text` / `date` / `table` : `weight = 0` obligatoire.
- Drapeau rouge : `{"red_flag": {"values": ["non"]}}` ou `{"red_flag": {"below": 2}}` — ne s'évalue que si `criticality = 'bloquant'`.
- Contrôle d'import (lot L4, bloquant) : toute question `weight > 0` sans `scoring` valide est REJETÉE à l'import.

## 7.4 Corrections d'audit intégrées (traçabilité)

Les tables et règles issues de **§24.1** (`step_validations`, `alerts`, `scoping_financials`, P1-4 UUID clients, P1-5 note volante, P2-1 person_service_id) sont intégrées ci-dessus. Les extensions **§25** (agenda, unités proposées, hors-parcours, entretien complémentaire), **§26** (kind `poste`, gabarits par niveau), **§27** (5 types de session, provenance, non-communiqué, `tools_inventory`, fourchette), **§28** (baselines, faisabilité, atelier, tables Phase 2) et **§29** (R2-R6) sont intégrées ci-dessus. Les décisions de résolution V2.2 (kind/mode, unicité des réponses, clé des gabarits, `group_code` des profils) sont documentées au fichier 03 §32.6 et dans le CHANGELOG (fichier 10).

## 7.5 Priorisation du noyau strict

La re-priorisation P0-2 (noyau strict vs différable) est maintenue : **la référence unique de charge et de contenu des lots est le 00_INDEX + le fichier 07 V2.2.** Tout chiffrage figurant dans les sections historiques est remplacé par cette référence.

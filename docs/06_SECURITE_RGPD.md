# SECURITE RGPD
> **Pack d'implémentation Axion Audit — fichier 06/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Sécurité applicative, RGPD, conformité, exigences achats grands comptes
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 10. SÉCURITÉ, RGPD ET CONFORMITÉ

## 10.1 Authentification & sessions
JWT access 15 min + refresh 30 j rotatif avec détection de réutilisation (vol de token → révocation de toute la famille). Hachage Argon2id. Politique de mot de passe : 12+ caractères. MFA TOTP en V2 (obligatoire pour les admins). Comptes désactivables instantanément.

## 10.2 Durcissement applicatif (OWASP)
Validation Zod sur 100 % des entrées · requêtes paramétrées (ORM) · en-têtes de sécurité (Caddy : HSTS, CSP stricte, X-Content-Type-Options) · rate limiting **(V2.9 — aligné sur le contrat 11 §3, qui fait foi)** : `/v1/auth/*` 10 req/min/IP, global 300 req/min/token · **pas de CORS (V2.9 — aligné 11 §2)** : field, hq et API servis sous le MÊME domaine par Caddy · secrets hors code (env + `app_settings` chiffrés AES) · dépendances : npm audit en CI ; **Dependabot/Renovate GELÉS en Phase 1 (11 §1), réactivés en Phase 2 avec merge manuel (V2.9 — aligné)** · uploads : contrôle MIME réel + taille max dès la V1 ; **antivirus ClamAV : DIFFÉRÉ en Phase 2 (lot L10, avec la fiche sécurité) — décision V2.9 : en V1 les uploads sont réservés aux consultants internes authentifiés et les photos compressées côté client (R2) ; risque assumé et documenté, aucun lot noyau ne portait cette exigence.**

## 10.3 Infrastructure
VPS Hetzner durci : SSH clés uniquement + port non standard + fail2ban · UFW (80/443 + SSH) · Docker rootless ou user namespaces · réseau Docker interne (Postgres/Redis/MinIO jamais exposés publiquement) · mises à jour de sécurité automatiques (unattended-upgrades) · accès Postgres : uniquement via le réseau Docker + tunnel SSH pour l'admin.

## 10.4 RGPD (traitement de données de personnes physiques : les interviewés)
- **Base légale (précision V2.2)** : vis-à-vis des personnes interrogées (salariés du client), la base est l'**intérêt légitime** (audit commandé par leur employeur), avec information préalable systématique — l'exécution contractuelle ne joue qu'entre Axion-IA et le client, pas envers les interviewés. La mention d'information est **versionnée** et sa version est enregistrée sur chaque session (`interviews.information_notice_version`, `notice_shown_at`). Consentement spécifique horodaté pour l'audio. **Feuille de présence papier normée dès la mission 1** (gabarit Word manuel — l'émargement outillé reste V2/§6.8).
- **Registre de traitement** Axion-IA à compléter (nouvelle activité de traitement : « conduite d'audits IA — données d'entretiens »).
- **Minimisation** : email d'interviewé optionnel ; pas de données sensibles collectées par le questionnaire (consigne de rédaction de la banque).
- **Droits** : recherche par nom d'interviewé (export/suppression ciblée) ; anonymisation d'un entretien (remplacement identité par « Interviewé n ») sans perdre les réponses.
- **Durées de conservation** (paramétrables, `app_settings`) : audios 90 j après livraison · données de mission 3 ans après clôture puis anonymisation · **journal d'audit `activity_log` : 12 mois (IP anonymisée à 90 j) — V2.2** ; purges = jobs planifiés + journalisés.
- **Sous-traitance LLM** : DPA Anthropic ; données envoyées au LLM = réponses et scores, JAMAIS les identités. **Pseudonymisation en DEUX passes (V2.2)** : (1) remplacement des `person_name` connus via la table de correspondance de mission ; (2) passe de détection de noms de personnes (NER) sur les textes libres et verbatims AVANT tout appel — les tiers cités en note (« Jean-Marc de la compta ») ne partent jamais en clair. Consigne de saisie affichée côté terrain : pas de noms de tiers dans les notes. Option modèle UE par mission.
- **AIPD COMPLÈTE (V2.2 — pas « légère »)** à rédiger avant la première mission grand compte : collecte systématique de données de salariés (opinions, craintes, usages individuellement attribuables) à l'échelle d'un groupe international. le client pilote la demandera.
- Hébergement : Hetzner Allemagne (UE). Aucun transfert hors UE sauf appel LLM (couvert par DPA + clauses).

## 10.5 Exigences achats grands comptes (anticipation le client pilote)
Chiffrement en transit (TLS 1.3) et au repos (disques chiffrés + IndexedDB chiffré) · journal d'audit (§6.6) · réversibilité (export complet mission en JSON/CSV sur demande — **V2.9 : l'export remis au CLIENT est une VARIANTE de l'export §36.3 EXPURGÉE des notes internes du consultant et des flags de travail (à-revoir, hors-parcours, motifs internes) ; seuls les éléments factuels et constats validés sont restituables**) · plan de continuité (§11.4) · fiche sécurité prête à envoyer (à rédiger en lot L10).

---

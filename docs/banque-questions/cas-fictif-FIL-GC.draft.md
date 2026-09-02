# CAS FICTIF **FIL-GC** — dossier de cotation croisée

**Date de rédaction : 2026-09-02** · État : **BROUILLON, non arbitré**

> **Groupe entièrement fictif.** Aucun lien avec une organisation réelle. Aucune personne n'y est
> nommée : le dossier ne parle qu'en **fonctions**. Aucune donnée personnelle n'y figure et ne doit
> y être ajoutée.
>
> **Ce dossier ne contient AUCUNE cotation.**
>
> **Rattachement aux fixtures** : la fixture technique `FIL-GC` (07 §13) compte 150 unités sur
> 4 niveaux, 60 sessions et ~8 000 réponses générées par script — elle mesure une échelle, pas une
> matière. Le présent dossier fournit la matière, à l'échelle d'un seul périmètre auditable.
>
> **FIL-GC est le miroir de FIL-TPE, et c'est voulu.** FIL-TPE ne sait rien et fait beaucoup.
> FIL-GC écrit tout et prouve peu. La quasi-totalité des ancres de niveau 5 de la banque exigent
> **un cas réel, daté** ; ce dossier est construit pour éprouver précisément cette exigence.

---

## 1. Fiche d'identité

| | |
| --- | --- |
| Désignation | **FIL-GC** |
| Activité | Groupe de services techniques — maintenance et exploitation d'installations pour des donneurs d'ordre publics et privés |
| Effectif | **≈ 4 200 salariés** |
| Implantation | 3 pays de l'Union européenne |
| Arbre organisationnel | **4 niveaux, 150 unités** : Groupe (1) → Divisions (3) → Régions (12) → Agences (134) |
| Périmètre audité | Groupe + Division « Bâtiment » + 2 régions + 4 agences visitées |
| Niveau d'audit | `strategique_groupe` |
| Séances tenues | du 24/08/2026 au 02/09/2026, 9 séances |
| Date de référence pour toute échéance | **02/09/2026** |

> ⚠️ Comme pour FIL-TPE, **les bornes se calculent contre le 02/09/2026**. Plusieurs dates de ce
> dossier sont posées à quelques semaines de la borne, dans les deux sens.

---

## 2. Séance 1 — direction générale et direction des risques (24/08/2026)

**Gouvernance affichée.** Le groupe a mis en place un **comité IA** par décision du comité exécutif
du **11/03/2025**. Sa lettre de mission écrite prévoit une réunion trimestrielle. Composition :
direction des systèmes d'information, direction juridique, direction des ressources humaines,
direction des risques, un directeur de division tournant.

Convocations produites pour **4 réunions** : 12/06/2025, 25/09/2025, 15/01/2026, 04/06/2026.
Comptes rendus produits pour **2 d'entre elles** : 25/09/2025 et 04/06/2026. Pour les deux autres,
la direction des risques indique que « le compte rendu n'a pas été formalisé ». Une cinquième
réunion prévue le 26/03/2026 a été annulée.

**Décisions tracées sorties du comité**, telles qu'elles figurent aux deux comptes rendus produits :

- 25/09/2025 — arrêt du déploiement d'un outil de reconnaissance d'émotions en centre d'appels,
  au motif d'un « risque réglementaire ». Décision appliquée : l'outil n'a pas été déployé.
- 04/06/2026 — validation d'un budget de 380 k€ pour un « programme de conformité IA », dont
  120 k€ consommés au 02/09/2026 selon la direction financière.

**Politique IA.** Une politique IA de 11 pages, **approuvée le 15/09/2025** par le comité exécutif,
signature portée sur le document. Elle a fait l'objet d'une **revue le 20/08/2025** — antérieure à
l'approbation : la direction des risques explique qu'il s'agissait de la revue du projet de texte.
Depuis l'approbation, **aucune revue**. Le document annonce une revue annuelle.

**Articulation avec les autres textes.** La politique IA renvoie explicitement à la charte
informatique et à la politique de sécurité. Ouvertes côte à côte pendant la séance : la charte
informatique, révisée le **03/02/2024**, interdit « tout usage d'un service en ligne non référencé
pour traiter des données de l'entreprise ». La politique IA, elle, autorise « les assistants
génératifs référencés au catalogue groupe ». Les deux textes ne se contredisent pas frontalement,
mais la charte n'a pas été mise à jour depuis la politique IA.

**Appétence au risque.** Un document « appétence au risque » du groupe, daté du **30/11/2025**,
comporte une demi-page sur l'IA énonçant trois interdits : notation de personnes, usage sur données
de santé, décision automatisée sans reprise humaine. Interrogée sur un cas où l'un de ces interdits
a été opposé à une demande réelle, la direction des risques cite l'arrêt de l'outil de reconnaissance
d'émotions du 25/09/2025.

**Certification.** Le groupe a engagé une démarche de certification **ISO/IEC 42001**, mandat signé
avec un organisme le **02/02/2026**. Aucun audit de certification n'a encore eu lieu. Un audit
interne « à blanc » a été mené par la direction de l'audit interne du groupe en **mai 2026**, rapport
de 24 pages remis à l'auditeur, comportant **17 écarts** dont 6 majeurs.

---

## 3. Séance 2 — direction des systèmes d'information groupe (25/08/2026)

**Registre des systèmes d'IA.** Un registre existe, tenu dans l'outil de gestion des actifs.
**23 systèmes** y figurent. Dernière mise à jour portée au **11/07/2026**. Chaque ligne porte un
propriétaire fonctionnel nommé. Le registre a servi, selon la direction, à préparer le budget de
conformité validé le 04/06/2026 — le compte rendu du comité y fait effectivement référence.

Sur les 23 systèmes :

- **19** portent une mention de rôle (fournisseur ou déployeur) ;
- **11** portent un classement de risque écrit, tous établis en **avril 2026** par la direction
  juridique ;
- 4 sont marqués « en cours de qualification » depuis **janvier 2026**.

**Les systèmes qui comptent, tels que décrits en séance :**

1. **Assistant documentaire interne** — modèle du marché, **affiné sur 40 000 documents techniques
   du groupe**, déployé depuis **octobre 2025** sur l'intranet **sous le nom et l'identité visuelle
   du groupe**. Usage strictement interne : aucun accès depuis l'extérieur, aucune commercialisation.
   Classé « risque minimal » au registre.
2. **Outil de planification des interventions** — optimise les tournées des techniciens et propose
   l'affectation des interventions. Déployé sur 9 régions sur 12. Le planificateur humain valide.
3. **Outil de présélection de candidatures** — utilisé par la direction des ressources humaines
   groupe depuis **février 2026**. Classé « haut risque, annexe III » au registre, avec la mention
   « obligations exigibles au 02/12/2027 ».
4. **Assistant conversationnel du site public** — répond aux demandes de devis. Fourni par un
   prestataire, exploité sous la marque du groupe. **Une mention « Assistant automatisé » est
   affichée en tête de la fenêtre de conversation**, constatée à l'écran le 25/08/2026, en corps 10,
   gris clair sur fond blanc.

**IA non référencée.** La direction des systèmes d'information affirme que les assistants génératifs
grand public sont « bloqués par le filtrage réseau ». Testé pendant la séance depuis un poste du
siège : deux services sur les trois essayés étaient effectivement bloqués, le troisième accessible.
Aucun recensement des usages sur les postes nomades et les téléphones professionnels n'a jamais été
conduit.

**Essais avant mise en service.** Pour l'outil de planification, un **cahier de recette daté du
14/09/2025** existe, avec 12 critères d'acceptation chiffrés et un procès-verbal de recette signé.
Pour l'assistant documentaire, aucun critère écrit : « on a fait tester par les équipes pendant un
mois ». Pour l'outil de présélection, une recette de l'éditeur a été fournie, non rejouée par le
groupe.

**Mise à l'épreuve délibérée.** Un prestataire de sécurité a mené en **mars 2026** un test
d'usage détourné sur l'assistant conversationnel public. La direction des systèmes d'information
confirme l'existence du rapport et de 4 recommandations, dont 3 mises en œuvre. **Le rapport n'a pas
été communiqué à l'auditeur**, au motif d'une clause de confidentialité avec le prestataire.

**Journalisation.** Les journaux applicatifs sont conservés **13 mois**. Une remontée a été demandée
en séance sur une affectation d'intervention produite le 02/06/2026 : la direction des systèmes
d'information a retrouvé l'horodatage, l'utilisateur et les paramètres d'entrée en **22 minutes**.
La même demande sur l'assistant documentaire n'a pas abouti : les échanges ne sont pas conservés.

**Accès.** Une revue des droits d'accès aux environnements d'IA a été menée le **28/05/2026**.
Extrait produit : 3 comptes retirés à cette occasion, dont 2 appartenant à des personnes ayant quitté
le groupe. Une seconde revue est planifiée pour novembre 2026.

**Chiffrement.** Chiffrement au repos et en transit confirmé sur les trois systèmes du socle,
vérifié à l'écran sur l'outil de planification. Pour l'assistant documentaire, le flux vers
l'hébergeur du modèle affiné est chiffré ; le **stockage des documents source sur un partage réseau
interne ne l'est pas**, ce que la direction des systèmes d'information reconnaît en séance.

**Secrets.** Un coffre-fort à secrets est en place depuis 2023 pour la production. Une recherche
menée devant l'auditeur dans le dépôt de code du groupe sur le mot `api_key` a remonté **4
occurrences dans des carnets de notes d'expérimentation**, dont une clé d'un service d'IA externe,
toujours valide, créée en **août 2024** et jamais renouvelée.

---

## 4. Séance 3 — délégué à la protection des données (26/08/2026)

Un délégué à la protection des données est désigné et déclaré auprès de l'autorité depuis
**mai 2018**, fonction à temps plein.

**Analyses d'impact.** Le délégué a été consulté sur **2 des 6 projets d'IA** engagés depuis 2025 :

- **Outil de présélection de candidatures** — AIPD réalisée, **datée du 09/01/2026**, avant la mise
  en service de février 2026. Elle conclut à un risque élevé résiduel acceptable sous réserve de
  quatre mesures, dont deux ont été mises en œuvre selon le délégué. Le document a été remis.
- **Outil de planification des interventions** — AIPD **commencée en octobre 2025 et non finalisée**.
  Le document existe à l'état de projet, 11 pages, sans date d'approbation ni signature. Le délégué
  explique que le projet « a été déployé plus vite que prévu » et que l'analyse « est restée en
  suspens ».
- Les **4 autres projets**, dont l'assistant documentaire, n'ont fait l'objet d'aucune saisine.
  Le délégué en a eu connaissance « par le comité IA », après déploiement.

**Registre RGPD.** À jour, revu le **30/06/2026**. Les trois systèmes principaux y figurent.
L'assistant documentaire y figure sous l'intitulé « gestion documentaire », sans mention de
traitement automatisé.

**Droits des personnes.** Circuit écrit, responsable nommé. Sur les 12 derniers mois, **31 demandes**
reçues, délai de réponse moyen **19 jours**, une demande traitée en 38 jours (dépassement reconnu et
tracé). Un dossier a été déroulé de bout en bout devant l'auditeur, avec date d'arrivée et date de
réponse.

**Durées de conservation et purge.** Durées définies au registre. Dernière purge exécutée le
**15/02/2026** sur la base candidats, journal d'exécution produit, nom de la fonction ayant lancé la
purge porté au journal.

**Décision automatisée.** Interrogé sur l'article 22, le délégué répond que « aucune décision n'est
entièrement automatisée ». Sur l'outil de présélection : les candidatures classées sous un seuil
paramétré sont **écartées automatiquement** et reçoivent un courriel de refus type. La direction des
ressources humaines confirmera le lendemain que ce seuil existe et qu'il est fixé à 35. Interrogé de
nouveau, le délégué indique que « ce point est justement une des mesures de l'AIPD qui n'a pas encore
été mise en œuvre ».

**Violations de données.** Une notification réelle à l'autorité de contrôle a été faite le
**07/11/2025** (perte d'un ordinateur portable non chiffré). Circuit écrit, délai tenu, dossier
produit. Sans lien avec l'IA.

---

## 5. Séance 4 — direction des ressources humaines groupe (27/08/2026)

**Littératie et formation.** Un module de sensibilisation à l'IA de 45 minutes, en ligne, ouvert à
tous les salariés depuis le **02/03/2026**. Taux de réalisation au 02/09/2026 : **1 340 personnes
sur 4 200**, soit 32 %. Le module est **obligatoire pour les 210 personnes identifiées comme
utilisatrices d'un outil d'IA** : parmi elles, **178 l'ont suivi**.

Le comité exécutif n'a pas suivi ce module. Une session dédiée de 2 heures pour le comité exécutif
et les directeurs de division s'est tenue le **19/06/2026**, animée par un cabinet extérieur, feuille
de présence produite : 14 présents sur 19 convoqués.

**Compétences.** Un référentiel de compétences IA a été écrit en **avril 2026**, couvrant 6 rôles.
L'écart avec l'existant n'a pas encore été mesuré : « c'est l'étape d'après ».

**Règles d'usage.** Une note de service « Usage des assistants génératifs », diffusée le
**11/04/2026** par courriel à l'ensemble des salariés, 3 pages. Elle interdit le versement de
données de clients et de salariés dans un outil non référencé, et impose la relecture humaine de
toute production reprise dans un livrable.

**Contrôle du respect.** Aucun contrôle organisé. La direction des ressources humaines indique que
« le filtrage réseau fait le travail ». Aucun écart n'a jamais été relevé ni traité.

**Information des représentants du personnel.** Le comité social et économique central a été informé
de l'outil de présélection de candidatures en séance du **17/12/2025**, extrait de procès-verbal
produit. L'outil de planification des interventions, qui touche 1 100 techniciens, **n'a pas été
présenté** au comité social et économique : la direction des ressources humaines considère qu'il
s'agit d'un « outil d'organisation, pas d'un outil de surveillance ».

**Impact sur l'emploi.** Une note interne de 4 pages, **datée du 20/05/2026**, examine l'effet des
outils d'IA sur trois métiers du groupe. Elle conclut à « une évolution des tâches sans suppression
de postes à horizon 3 ans ». Les représentants du personnel n'ont pas été associés à sa rédaction.

**Supervision humaine.** Sur l'outil de planification : les planificateurs régionaux peuvent modifier
toute proposition. Interrogée sur un mandat écrit les y autorisant explicitement, la direction des
ressources humaines renvoie à la fiche de poste, qui mentionne « l'arbitrage des plannings » sans
citer l'outil.

---

## 6. Séance 5 — visite d'agence (01/09/2026 et 02/09/2026, 4 agences)

**Ce que le terrain dit de l'outil de planification.**

- Dans 3 agences sur 4, les planificateurs déclarent modifier les propositions « tous les jours ».
  Dans une agence, le planificateur a montré à l'écran **7 modifications sur la journée du 01/09**.
- Dans la 4ᵉ agence, le planificateur déclare : « on ne touche plus, ça se retourne contre nous si
  la tournée dérape et qu'on a modifié ». Aucune modification sur les 5 derniers jours ouvrés,
  constaté à l'écran.
- Aucun des 4 planificateurs ne sait dire sur quels critères l'outil ordonne les interventions.
- Aucun des 4 n'a suivi le module de sensibilisation. Trois ne savaient pas qu'il existait.

**Ce que le terrain dit des règles d'usage.**

- Sur 6 techniciens interrogés au hasard, **4 disent utiliser un assistant génératif sur leur
  téléphone professionnel** pour rédiger des comptes rendus d'intervention. Deux d'entre eux citent
  la note du 11/04/2026 ; deux ne la connaissent pas.
- Un chef d'agence indique avoir « fait remonter à la région » que la note était « impossible à
  appliquer sans outil de remplacement ». Aucune trace de cette remontée n'a pu être retrouvée.

**Mode dégradé.** L'outil de planification a été indisponible 6 heures le **12/05/2026** sur une
région. Un mode dégradé écrit existe — une procédure de 2 pages — et il a été appliqué ce jour-là,
avec un retour d'expérience écrit de 1 page produit à l'auditeur. Ce retour d'expérience n'a pas été
diffusé aux autres régions.

**Signalements.** L'agence visitée le 02/09 dispose de l'outil de tickets groupe. Filtre appliqué
devant l'auditeur sur la catégorie « IA » : **3 tickets** sur 12 mois, dont 2 clos et 1 ouvert depuis
le 14/07/2026 sans mouvement. Les 2 clos portent une date de clôture mais **aucune vérification
d'efficacité**.

**Retour externe.** Un donneur d'ordre public a écrit au groupe le **03/03/2026** pour demander
« comment sont établies les priorités d'intervention » depuis l'introduction du nouvel outil.
La lettre a été produite. La réponse du groupe, datée du 27/03/2026, a également été produite : elle
décrit le fonctionnement général de l'outil. Aucune modification de l'outil ne s'en est suivie.

---

## 7. Pièces remises — récapitulatif daté

| Pièce | Date portée | Remarque |
| --- | --- | --- |
| Décision de création du comité IA | 11/03/2025 | Lettre de mission écrite |
| Convocations du comité IA | 12/06/2025 · 25/09/2025 · 15/01/2026 · 04/06/2026 | 4 convocations |
| Comptes rendus du comité IA | 25/09/2025 · 04/06/2026 | **2 sur 4** |
| Politique IA (11 p.) | Approuvée le **15/09/2025** | Revue annoncée annuelle, jamais tenue depuis |
| Revue du projet de politique | 20/08/2025 | **Antérieure à l'approbation** |
| Charte informatique | 03/02/2024 | Non revue depuis la politique IA |
| Document « appétence au risque » | 30/11/2025 | Demi-page sur l'IA, trois interdits |
| Mandat de certification ISO/IEC 42001 | 02/02/2026 | Aucun audit de certification tenu |
| Rapport d'audit interne à blanc (24 p.) | mai 2026 | 17 écarts, dont 6 majeurs |
| Registre des systèmes d'IA (23 lignes) | Mise à jour 11/07/2026 | 19 rôles · 11 classements · 4 en attente |
| Cahier de recette outil de planification | 14/09/2025 | 12 critères chiffrés, PV signé |
| AIPD outil de présélection | 09/01/2026 | Antérieure à la mise en service |
| Projet d'AIPD outil de planification | octobre 2025 | **Non finalisé, non signé** |
| Registre RGPD | Revu le 30/06/2026 | Assistant documentaire décrit sans mention d'automatisation |
| Journal de purge base candidats | 15/02/2026 | Fonction exécutante portée au journal |
| Dossier de notification de violation | 07/11/2025 | Délai tenu |
| Note de service « assistants génératifs » | 11/04/2026 | Diffusée par courriel à tous |
| Feuille de présence session comité exécutif | 19/06/2026 | 14 présents sur 19 |
| Référentiel de compétences IA | avril 2026 | Écart avec l'existant non mesuré |
| Extrait de PV du comité social et économique central | 17/12/2025 | Porte sur le seul outil de présélection |
| Note d'impact sur les métiers (4 p.) | 20/05/2026 | Sans association des représentants du personnel |
| Extrait de revue des droits d'accès | 28/05/2026 | 3 comptes retirés |
| Procédure de mode dégradé (2 p.) + retour d'expérience (1 p.) | 12/05/2026 | Non diffusés hors de la région concernée |
| Courrier du donneur d'ordre + réponse | 03/03/2026 · 27/03/2026 | Sans effet sur l'outil |

## 8. Ce qui n'a pas pu être obtenu

- **Le rapport de mise à l'épreuve délibérée** de mars 2026 — refus opposé au titre de la
  confidentialité contractuelle. L'existence du rapport et le nombre de recommandations sont
  toutefois confirmés par deux fonctions distinctes.
- **Les comptes rendus** des réunions du comité IA du 12/06/2025 et du 15/01/2026 — non formalisés.
- **Aucun examen écrit des pratiques interdites** de l'article 5. La direction juridique indique que
  « le classement de risque en tient lieu ». Les deux interdictions ajoutées et applicables au
  02/12/2026 ne sont mentionnées nulle part.
- **Aucun document de répartition des responsabilités** avec l'éditeur du modèle affiné, au-delà des
  conditions générales de service.
- **Aucun plan de retrait** écrit pour aucun des 23 systèmes.
- **Aucune mesure ni estimation** de la consommation liée aux usages d'IA.
- **Aucun test de restauration** des données de l'assistant documentaire n'a jamais été mené.
- **Aucune donnée de couverture** : sur les 150 unités du groupe, 4 agences ont été visitées et
  2 régions sur 12 ont été interrogées. Le dossier ne dit rien des 10 autres régions.

## 9. Ce que le dossier dit du rôle au sens du règlement européen

Faits bruts, sans qualification — c'est au coteur de la faire :

- L'**assistant documentaire** repose sur un modèle du marché **affiné sur les documents du groupe**
  et est diffusé **sous le nom et l'identité visuelle du groupe**. Il n'est accessible qu'en interne,
  aux salariés, et n'est ni vendu ni mis à disposition de tiers.
- L'**assistant conversationnel du site public** est fourni par un prestataire et exploité **sous la
  marque du groupe**, accessible à toute personne visitant le site.
- L'**outil de présélection de candidatures** est utilisé tel que fourni, sans modification.
- Le groupe **n'est établi** que dans l'Union européenne. L'éditeur du modèle affiné est établi hors
  Union.

---

*Fin du dossier FIL-GC. Aucune cotation n'y figure, délibérément.*

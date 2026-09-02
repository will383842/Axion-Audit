# BANQUE DE QUESTIONS — mode d'emploi pour la rédaction

> **Pour Williams.** Ce fichier explique comment remplir `modele-a-remplir.csv` sans avoir à lire
> le pack. Toutes les règles ci-dessous sont **transcrites** de `03 M1.1`, `03 §32.1`, `03 §32.4` et
> `03 §36.4` — rien n'est inventé, et le validateur `packages/shared/src/banque-questions.ts` refuse
> à l'import tout ce qui s'en écarte.
>
> **Échéance : 15/09 — 100 questions relues et testées en cotation croisée sur 2 cas fictifs**
> (fichier 07 §14, ligne « Contenu de la banque — **le vrai chemin critique** »).
> Cible finale : ~200 questions.

---

## 1. LA SEULE RÈGLE QUI FAIT ÉCHOUER LA PLUPART DES FICHIERS

**Toute question notée de 1 à 5 doit porter ses ANCRES dans la colonne `guidance_fr`.**

Une ancre dit ce que vaut un niveau. Le validateur en exige **trois au minimum : 1, 3 et 5**,
séparées par le caractère `·` :

```
1 = aucun processus documenté · 3 = documenté mais non appliqué · 5 = documenté, appliqué et mesuré
```

**Pourquoi c'est un critère d'admission et pas du confort** : sans ancres, deux auditeurs notent
différemment la même situation, et le score de la mission ne veut plus rien dire. C'est la seule
règle du fichier dont la violation est **silencieuse** — la question passerait, et le défaut
n'apparaîtrait qu'au moment de comparer deux audits.

Les ancres s'affichent **sous le curseur** de l'auditeur pendant la saisie (03 §33) : elles ne sont
pas de la documentation, elles sont l'outil de travail.

---

## 2. LES COLONNES, DANS L'ORDRE DU FICHIER

| Colonne           | Ce qu'on y met                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| `code`            | Identifiant unique et stable. Convention proposée : `Q-B<bloc>-<n°>`.           |
| `bloc_code`       | `bloc_1` … `bloc_9` (voir §3).                                                  |
| `texte_fr`        | **La question telle qu'elle est posée**, en français, à l'oral.                 |
| `guidance_fr`     | Consigne à l'auditeur — **et les ancres** si la question est une échelle 1-5.   |
| `answer_type`     | Un des onze types (§4).                                                         |
| `options`         | Uniquement pour `single_choice` / `multi_choice` (§4).                          |
| `allow_range`     | `vrai` si l'interlocuteur peut répondre « entre X et Y », sinon `faux`.          |
| `poids`           | Importance de la question dans le score. `0` = non cotée.                        |
| `scoring`         | Le barème (§5). **Vide** pour les types non cotés.                              |
| `criticality`     | `bloquant` · `important` · `informatif`.                                        |
| `expected_source` | `entretien` · `observation` · `demonstration` · `document` · `releve`.          |
| `secteurs`        | Vide = toutes. Sinon codes séparés par `\|`.                                     |
| `services_cibles` | Vide = tous.                                                                    |
| `niveaux`         | Vide = tous. Sinon `diagnostic_cadrage` · `operationnel` · `strategique_groupe`.|
| `effectif_min` / `effectif_max` | Vides = sans condition de taille.                                |
| `profils`         | À qui on la pose (§3). Séparateur `\|`.                                          |
| `geo`             | `tous` par défaut.                                                              |

**Séparateur du fichier : le point-virgule `;`.** Les virgules à l'intérieur du barème JSON ne
gênent donc pas. **Ne pas ouvrir ce fichier dans un tableur sans vérifier qu'il conserve `;` et
l'encodage UTF-8** — c'est la cause d'erreur la plus fréquente sur ce format.

---

## 3. LES VALEURS AUTORISÉES

**Les 9 blocs** (01 §2.1) :

| Code      | Bloc                             | Code      | Bloc                              |
| --------- | -------------------------------- | --------- | --------------------------------- |
| `bloc_1`  | Cadrage stratégique              | `bloc_6`  | Cas d'usage                       |
| `bloc_2`  | Cartographie des processus       | `bloc_7`  | Priorisation                      |
| `bloc_3`  | Audit de la donnée               | `bloc_8`  | Feuille de route & gouvernance    |
| `bloc_4`  | Audit technique & sécurité       | `bloc_9`  | Conformité AI Act & registre IA   |
| `bloc_5`  | Audit humain & compétences       |           |                                   |

**Les profils d'interlocuteur** : `dirigeant` · `dsi` · `daf` · `drh` · `resp_metier` · `salarie` ·
`technicien_operateur` · `autre`.

---

## 4. LES ONZE TYPES DE RÉPONSE

| Type            | Pour quoi                        | `options` | Barème                        |
| --------------- | -------------------------------- | --------- | ----------------------------- |
| `yes_no`        | oui / non                        | vide      | `{"map":{"oui":5,"non":0}}`   |
| `scale_1_5`     | note de 1 à 5                    | vide      | `{"map":"identity"}` **+ ancres obligatoires** |
| `single_choice` | un choix parmi plusieurs         | **requis**| `{"source":"options"}`        |
| `multi_choice`  | plusieurs choix                  | **requis**| `{"source":"options","aggregate":"mean"}` |
| `number`        | un nombre                        | vide      | `bands` (§5)                  |
| `percent`       | un pourcentage                   | vide      | `bands` (§5)                  |
| `duration`      | une durée                        | vide      | `bands` (§5)                  |
| `money`         | un montant                       | vide      | vide — non coté               |
| `free_text`     | réponse ouverte, verbatim        | vide      | vide — non coté               |
| `date`          | une date                         | vide      | vide — non coté               |
| `table`         | un tableau                       | vide      | vide — non coté               |

Format de `options` :
```json
[{"code":"manuel","label":"Répartition manuelle","score":1},{"code":"pilote","label":"Pilotage mesuré","score":5}]
```

---

## 5. LE BARÈME (`scoring`)

**Barème inversé** — quand répondre « oui » est un mauvais signal, on inverse simplement :
`{"map":{"oui":0,"non":5}}`. C'est fréquent en sécurité, et c'est prévu.

**Seuils numériques** (`number`, `percent`, `duration`) — les bornes se lisent dans l'ordre, la
dernière sans `max` attrape le reste :
```json
{"bands":[{"max":10,"score":1},{"max":40,"score":3},{"score":5}]}
```

**Drapeau rouge** — une réponse qui doit remonter **quelle que soit la moyenne** :
`"red_flag":{"values":["non"]}` pour un choix, `"red_flag":{"below":2}` pour une échelle.
Un drapeau rouge n'est jamais masqué par un bon score global (03 §32.1).

> ⚠️ **Un drapeau rouge n'a d'effet que sur une question `bloquant`.** Posé sur une question
> `important` ou `informatif`, il est accepté à l'import mais **ne sera JAMAIS évalué** — le
> validateur le signale en avertissement, pas en erreur. Donc : si une réponse doit vraiment
> alerter, la question est `bloquant` ; sinon, ne mettez pas de drapeau.
> *(Cette règle a été trouvée en passant le présent modèle au validateur : le premier exemple
> rédigé portait exactement ce défaut.)*

---

## 5bis. DOCTRINE DE COTATION (arbitrage Williams du 2026-09-02 — `DECISIONS.md`)

> Ces cinq règles comblent un vide de 03 §32.4, révélé par la cotation croisée à blanc du
> 02/09/2026 (`DEPOUILLEMENT_2026-09-02.draft.md`). Elles font foi pour TOUTE cotation.
> C'est l'exception assumée au principe « rien n'est inventé » du présent fichier : ces règles-ci
> sont **arbitrées** (entrées `DECISIONS.md` du 2026-09-02), pas transcrites ; l'amendement du
> pack (03 §32.4) reste à faire par le chantier gouvernance.

1. **Le silence se cote 1, pas NC.** Une pratique attendue dont l'entreprise ne peut rien montrer
   vaut la note plancher : ne rien pouvoir montrer EST le constat. `NC` est réservé à l'information
   **demandée et matériellement non obtenue** — refus, interlocuteur absent, pièce hors délai.
2. **Le système le plus défavorable fait la note.** Quand le parc est hétérogène, on cote le système
   le moins bien tenu parmi ceux relevés : un audit ne moyenne pas les vigilances. Les systèmes bien
   tenus vont au rapport. Exception : une guidance qui désigne explicitement « le dernier mis en
   service » prime.
3. **Les notes 2 et 4 se gagnent par une preuve.** La note 2 (resp. 4) exige qu'au moins UN élément
   de l'ancre 3 (resp. 5) soit établi — sinon on reste à l'ancre inférieure. Au dépouillement, la
   question « quel élément ? » doit avoir une réponse.
4. **NA n'existe que là où la banque le prévoit.** Une question ne se déclare « sans objet » que si
   sa guidance nomme le prérequis structurel qui la neutralise (à ce jour : Q-B1-006 et Q-B4-013 ;
   Q-B5-011 précise au contraire que l'absence de représentants du personnel ne la rend PAS sans
   objet). Toute question muette sur ce point se cote obligatoirement. La passe systématique sur les
   100 guidances se fait avec les corrections de la cotation croisée humaine.
5. **L'unité la plus défavorable fait la note.** Même logique que la règle 2 pour un terrain
   multi-sites : l'unité où la pratique a cessé est le risque réel. Les unités conformes vont au
   rapport comme preuve que la bonne pratique existe et peut s'étendre ; la couverture par unité
   reste l'affaire de la mission (03 §27.1).

---

## 6. CE QUI EST INTERDIT, ET POURQUOI

- **Aucun nom de client, nulle part** — ni dans un code, ni dans un libellé, ni dans un exemple
  (invariant 2). Une question qui nomme un client est une question qui ne resservira jamais.
- **Aucune donnée personnelle** dans les libellés.
- **Pas de question à échelle sans ancres** — refusée à l'import, et c'est voulu.
- **Pas de poids > 0 sans barème** — le validateur le refuse : une question qui compte dans le score
  doit dire comment elle compte.

---

## 7. COMMENT S'Y PRENDRE, CONCRÈTEMENT

1. **Ouvrez `modele-a-remplir.csv`** — il contient neuf exemples réels couvrant les types les plus
   fréquents, un par bloc ou presque. Gardez-les comme référence, ajoutez vos lignes en dessous.
2. **Commencez par les blocs que vous maîtrisez le mieux.** L'ordre des blocs n'a aucune importance
   pour l'outil.
3. **Écrivez la question à l'oral d'abord**, comme vous la poseriez en entretien. Reformulez ensuite
   si nécessaire — pas l'inverse.
4. **Pour chaque échelle, écrivez les trois ancres avant de passer à la suite.** C'est le moment où
   la question devient utile, et c'est celui qu'on est tenté de remettre à plus tard.
5. **Le jalon du 15/09 demande 100 questions relues et testées**, pas rédigées. Prévoyez le temps de
   la **cotation croisée sur 2 cas fictifs** (03 §32.4) : deux personnes cotent le même cas, et l'on
   compare. Les désaccords révèlent les ancres ambiguës — c'est l'objet de l'exercice.

---

## 8. QUAND LE FICHIER EST PRÊT

L'import est **atomique** : soit tout entre, soit rien, avec un rapport d'erreurs ligne par ligne
(03 §35.2). Vous pouvez donc le lancer autant de fois que nécessaire sans rien casser.

```
node apps/api/scripts/import-banque-questions.mjs <chemin du fichier>
```

**Le rapport nomme la ligne et la règle violée.** Un fichier refusé n'a rien écrit en base.

---

*Transcrit de 03 M1.1, §32.1, §32.4, §36.4 et du validateur `packages/shared/src/banque-questions.ts`.
Aucune règle n'a été inventée — à l'unique exception du §5bis, arbitré par Williams le 2026-09-02
et tracé dans `DECISIONS.md` ; en cas de divergence sur le reste, le validateur fait foi et ce
fichier a tort.*

# @axion/worker — Jobs asynchrones

BullMQ 5 sur Redis 7. Génération DOCX, appels LLM, exports, purges RGPD, webhooks console.

## Principe intangible

**Jamais dans le cycle requête** (02 §11.1). Une génération LLM ou DOCX qui bloquerait une réponse
HTTP ferait tomber une sync terrain par effet de bord.

## État au lot L0

Le processus démarre, se connecte à Redis, déclare ses files et s'arrête proprement. **Aucun job
n'est traité** : les traitements arrivent avec leurs lots. Recevoir un job aujourd'hui est donc un
symptôme (file mal nommée, reliquat d'un environnement partagé) — le processeur d'attente échoue
explicitement plutôt que d'acquitter un job en silence.

## Files

| File                | Lot | Contenu                                                 |
| ------------------- | --- | ------------------------------------------------------- |
| `axion:rapports`    | L10 | Génération DOCX, jobs idempotents et rejouables         |
| `axion:llm`         | L11 | Appels par bloc, journal des coûts, plafond par mission |
| `axion:exports`     | L7  | Export de mission (format §36.3)                        |
| `axion:purges`      | —   | Rétentions RGPD (06 §10.4), planifiées et journalisées  |
| `axion:webhooks`    | L13 | Console axion-ia.com (HMAC + anti-rejeu)                |
| `axion:sauvegardes` | —   | Sauvegardes MinIO pilotées depuis l'application         |

**Une file par nature de travail, jamais une file fourre-tout** : une purge RGPD qui attendrait
derrière une génération DOCX de dix minutes serait un défaut de conformité, pas de performance.

## Sécurité

La clé `ANTHROPIC_API_KEY` n'existe **que** dans ce conteneur (moindre accès, 02 §30.4-7). Les
identités ne partent jamais au LLM : pseudonymisation en deux passes — table de correspondance
**puis** détection de noms (NER) sur les textes libres (06 §10.4). Même redaction de journaux que
l'API : c'est ici que la fuite serait la plus fournie, puisque le worker manipule des réponses
d'entretien.

## Arrêt propre

On ferme d'abord les travailleurs (ils terminent le job en cours), puis les files. L'inverse
couperait un job en vol — or « crash du worker en pleine génération » doit rester un scénario de
PANNE testable par A45, pas un comportement ordinaire.

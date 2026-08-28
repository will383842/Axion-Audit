# =============================================================================
# IMAGE API — Node 22 LTS, épinglé par le contrat 11 §1.
# JAMAIS Node 24 : la machine de développement en porte une, la CI et les images
# n'en portent pas (voir DECISIONS.md 2026-08-27 « Versions Node/pnpm »).
#
# Trois cibles :
#   · dev     — code monté, rechargement à chaud (docker-compose.yml)
#   · build   — compilation TypeScript, jetée ensuite
#   · runtime — image finale, minimale, utilisateur non privilégié
# Traçabilité : E17 (stack imposée), E33 (durcissement).
# =============================================================================
ARG NODE_VERSION=22.21.0
ARG PNPM_VERSION=9.15.9

# -----------------------------------------------------------------------------
# Socle commun : pnpm via corepack, à la version EXACTE du contrat.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS socle
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# `tini` donne un PID 1 correct : sans lui, SIGTERM n'atteint pas Node et l'arrêt
# propre de server.ts ne s'exécute jamais (une sync en vol serait coupée net).
RUN apk add --no-cache tini
WORKDIR /app

# -----------------------------------------------------------------------------
# Dépendances : copiées SEULES d'abord, pour que le cache de couche survive à
# toute modification de code source.
# -----------------------------------------------------------------------------
FROM socle AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# `scripts/prepare-husky.mjs` est référencé par le script `prepare` de la racine,
# que pnpm exécute après CHAQUE installation — donc ici. Sans ce fichier,
# l'installation meurt sur « Cannot find module ». Le script, lui, constate
# l'absence de dépôt git dans l'image et s'abstient d'installer des hooks : c'est
# la seule ligne de `scripts/` dont une image a besoin, et elle n'ajoute rien au
# contexte de cache utile.
COPY scripts/prepare-husky.mjs ./scripts/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/field/package.json ./apps/field/
COPY apps/hq/package.json ./apps/hq/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
# `--frozen-lockfile` : un lockfile divergent fait ÉCHOUER la construction plutôt
# que de résoudre silencieusement une autre version. C'est la traduction du
# « versions épinglées » du 11 §1 au niveau de l'image.
# `--prod=false` : cet étage a besoin des dépendances de DÉVELOPPEMENT — c'est
# lui qui compile. Sans ce drapeau, pnpm les saute dès que `NODE_ENV=production`
# est présent dans l'environnement de construction, et la compilation meurt sur
# `sh: tsc: not found`. La CI ne posait pas cette variable, Coolify si : le
# défaut est resté invisible jusqu'au premier déploiement réel (jjfbgjsvp27r…).
# On ne dépend donc PAS de la valeur de NODE_ENV : on dit ce dont on a besoin.
# L'étage `runtime` ne reprend que le résultat compilé, jamais ces dépendances.
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Cible dev — le code est monté par Compose, pas copié.
# -----------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@axion/api", "dev"]

# -----------------------------------------------------------------------------
# Cible build — compilation.
# -----------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/api ./apps/api
# `...` construit d'abord les DÉPENDANCES du paquet (packages/shared, packages/ui)
# puis le paquet lui-même : l'ordre de construction est déduit du graphe, pas
# recopié à la main dans chaque Dockerfile.
RUN pnpm --filter @axion/api... build
# Après compilation, on ne garde que les dépendances de production : les outils de
# build (TypeScript, ESLint, Vitest) n'ont rien à faire dans une image exposée.
RUN pnpm --filter @axion/api --prod deploy /paquet

# -----------------------------------------------------------------------------
# Cible runtime — image finale.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
# Invariant 5 : le serveur vit en UTC. Le fuseau de mission est un affichage.
ENV TZ=UTC
WORKDIR /app

# 06 §10.3 : jamais root dans un conteneur exposé. L'image node fournit déjà
# l'utilisateur `node` (uid 1000) ; on s'en sert plutôt que d'en créer un.
COPY --from=build --chown=node:node /paquet/node_modules ./node_modules
COPY --from=build --chown=node:node /paquet/dist ./dist
COPY --from=build --chown=node:node /paquet/package.json ./package.json

# LES MIGRATIONS VOYAGENT AVEC L'IMAGE QUI PORTE LE SCHÉMA.
#
# Sans ces deux copies, le `package.json` de l'image DÉCLARE `db:migrate` →
# `node scripts/migrations.mjs` ET NE CONTIENT PAS LE FICHIER. Le déploiement
# échouait donc sur `Cannot find module '/app/scripts/migrations.mjs'` — et
# `infra/scripts/deploy.sh` fait EXACTEMENT cet appel à son étape 2/5
# (`axion_compose run --rm --no-deps api pnpm db:migrate`). Cette étape n'aurait
# jamais pu fonctionner, ni en staging ni en production ; le défaut dormait
# depuis le lot L0 et n'a été révélé qu'au premier déploiement réel.
#
# Un `package.json` qui annonce une commande que l'image ne peut pas exécuter est
# un mensonge d'image. On copie donc ce qu'il promet :
#   · `scripts/` — migrations.mjs, seed.mjs et leurs dépendances locales ;
#   · `drizzle/` — le SQL versionné lui-même, sans quoi migrations.mjs n'a rien
#     à appliquer ;
#   · `schema-manifest.json` — la référence du diff schéma-vs-04, pour pouvoir
#     contrôler un schéma déployé sans rapatrier le dépôt.
COPY --from=build --chown=node:node /app/apps/api/scripts ./scripts
COPY --from=build --chown=node:node /app/apps/api/drizzle ./drizzle
COPY --from=build --chown=node:node /app/apps/api/schema-manifest.json ./schema-manifest.json

USER node
EXPOSE 3000

# Sonde de VIVACITÉ (pas de préparation) : Docker redémarre le conteneur sur échec,
# et une base momentanément absente ne doit pas déclencher un redémarrage en boucle.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

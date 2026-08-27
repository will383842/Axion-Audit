# =============================================================================
# IMAGE WORKER — Node 22 LTS, épinglé par le contrat 11 §1.
# JAMAIS Node 24 : la machine de développement en porte une, la CI et les images
# n'en portent pas (voir DECISIONS.md 2026-08-27 « Versions Node/pnpm »).
#
# Trois cibles :
#   · dev     — code monté, rechargement à chaud (docker-compose.yml)
#   · build   — compilation TypeScript, jetée ensuite
#   · runtime — image finale, minimale, utilisateur non privilégié
# Traçabilité : E17 (stack imposée), E33 (durcissement), E35 (jobs asynchrones).
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
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/field/package.json ./apps/field/
COPY apps/hq/package.json ./apps/hq/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
# `--frozen-lockfile` : un lockfile divergent fait ÉCHOUER la construction plutôt
# que de résoudre silencieusement une autre version. C'est la traduction du
# « versions épinglées » du 11 §1 au niveau de l'image.
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Cible dev — le code est monté par Compose, pas copié.
# -----------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@axion/worker", "dev"]

# -----------------------------------------------------------------------------
# Cible build — compilation.
# -----------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/worker ./apps/worker
# `...` construit d'abord les DÉPENDANCES du paquet (packages/shared, packages/ui)
# puis le paquet lui-même : l'ordre de construction est déduit du graphe, pas
# recopié à la main dans chaque Dockerfile.
RUN pnpm --filter @axion/worker... build
# Après compilation, on ne garde que les dépendances de production : les outils de
# build (TypeScript, ESLint, Vitest) n'ont rien à faire dans une image exposée.
RUN pnpm --filter @axion/worker --prod deploy /paquet

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

USER node


# Pas de sonde HTTP : le worker n'expose aucun port (02 §4.1 — il consomme des
# files, il ne sert pas de trafic). Sa vivacité est celle de son processus, et
# BullMQ signale ses pannes par le journal (voir les gestionnaires `failed` et
# `error` de worker.ts). Une sonde factice donnerait une fausse assurance.

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/worker.js"]

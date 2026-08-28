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

# Sonde de santé — MÊME sonde qu'en production, seul le chemin change : ici le WORKDIR
# est la racine du monorepo monté, là-bas le paquet déployé. Ce que la sonde prouve (et
# ce qu'elle ne prouve pas) est écrit en tête de `apps/worker/src/sonde-sante.ts`.
# `start-period` est plus long qu'en production : en développement, `dist/` n'existe
# qu'après la première passe de `tsc --watch`.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=6 \
  CMD ["node", "apps/worker/dist/sonde-sante.js"]

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


# Pas de sonde HTTP : le worker n'expose aucun port (02 §4.1 — il consomme des files,
# il ne sert pas de trafic). Sa santé se lit donc DANS REDIS, pas dans une table de
# processus : `sonde-sante.ts` vérifie le battement de cœur de CETTE instance et son
# attachement à chacune des files. Le raisonnement complet — y compris la liste de ce
# que la sonde NE couvre PAS — est en tête de `apps/worker/src/sonde-sante.ts`.
#
# Ce qui était écrit ici avant (« sa vivacité est celle de son processus ») a coûté
# treize heures de `healthy` sur un worker mort : la sonde comptait les processus node,
# et `tsc --watch` en est un. Un voisin du sujet n'est jamais une preuve sur le sujet.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=6 \
  CMD ["node", "dist/sonde-sante.js"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/worker.js"]

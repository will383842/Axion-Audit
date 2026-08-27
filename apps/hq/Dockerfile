# =============================================================================
# IMAGE CONSOLE SIÈGE — construction Vite, service par Caddy sous /hq.
#
# L'image finale ne contient PAS de serveur web : Caddy sert les fichiers statiques
# depuis un volume partagé, sous le MÊME domaine que l'API (11 §2 : « Pas de CORS »).
# Empiler nginx ici ajouterait un composant à sécuriser et à mettre à jour pour
# rien — exactement le raisonnement qui a écarté Coolify au 02 §30.1.
#
# Traçabilité : E17 (stack imposée), E22 (console de pilotage).
# =============================================================================
ARG NODE_VERSION=22.21.0
ARG PNPM_VERSION=9.15.9

FROM node:${NODE_VERSION}-alpine AS socle
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM socle AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/field/package.json ./apps/field/
COPY apps/hq/package.json ./apps/hq/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Cible dev — serveur Vite avec rechargement à chaud, code monté par Compose.
# -----------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 5174
CMD ["pnpm", "--filter", "@axion/hq", "dev"]

# -----------------------------------------------------------------------------
# Cible build.
# -----------------------------------------------------------------------------
FROM deps AS build
# La version est injectée par la CI (SHA court). Elle sert à l'écran « À propos »
# et au diagnostic de version. La console, elle, est TOUJOURS en ligne : pas de
# service worker, pas de problème de version embarquée sur un appareil distant.
ARG VITE_APP_VERSION=dev
ARG VITE_APP_ENV=production
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_APP_ENV=${VITE_APP_ENV}
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/hq ./apps/hq
# `...` construit d'abord les DÉPENDANCES du paquet (packages/shared, packages/ui)
# puis le paquet lui-même : l'ordre de construction est déduit du graphe, pas
# recopié à la main dans chaque Dockerfile.
RUN pnpm --filter @axion/hq... build

# -----------------------------------------------------------------------------
# Cible runtime — un simple porteur de fichiers statiques.
# Le conteneur ne tourne pas en permanence : Compose l'exécute une fois pour
# déposer le build dans le volume que Caddy sert.
# -----------------------------------------------------------------------------
FROM alpine:3.21 AS runtime
WORKDIR /statique
COPY --from=build /app/apps/hq/dist /statique
# `cp -a` préserve les horodatages, dont Caddy se sert pour ses en-têtes de cache.
CMD ["sh", "-c", "cp -a /statique/. /sortie/ && echo 'Console siège déposée dans /sortie'"]

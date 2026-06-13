FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ui/package.json apps/ui/package.json

RUN npm ci

FROM deps AS build

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src

RUN npm --workspace apps/api run build

FROM node:24-alpine AS production-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ui/package.json apps/ui/package.json

RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime

RUN apk add --no-cache docker-cli docker-cli-buildx docker-cli-compose git iproute2 tar unzip util-linux

WORKDIR /app/apps/api

ENV NODE_ENV=production \
    MANAGER_API_HOST=0.0.0.0 \
    MANAGER_API_PORT=3001 \
    MANAGER_PROJECT_ROOT=/workspace

COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=production-deps /app/package.json /app/package-lock.json /app/
COPY --from=production-deps /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint.sh

RUN chmod +x /usr/local/bin/api-entrypoint.sh

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "dist/main.js"]

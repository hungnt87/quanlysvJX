FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ui/package.json apps/ui/package.json

RUN npm ci

FROM deps AS build

COPY tsconfig.base.json ./
COPY apps/ui/index.html apps/ui/vite.config.ts apps/ui/tsconfig.json apps/ui/vitest.config.ts apps/ui/
COPY apps/ui/public apps/ui/public
COPY apps/ui/src apps/ui/src

RUN npm --workspace apps/ui run build

FROM nginx:1.27-alpine AS runtime

COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/ui/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

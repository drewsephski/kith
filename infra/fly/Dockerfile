FROM node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu tini util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app
COPY --chmod=755 . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @rakazo/db generate \
    && RAKAZO_ALLOW_DEV_SECRETS=1 pnpm --filter @rakazo/web build \
    && install -d -m 750 -o node -g node /data /app/apps/web/node_modules/.vite-temp

ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    DATA_DIR=/data \
    SANDBOX_PROVIDER=none \
    API_HOST=127.0.0.1 \
    API_PORT=3100 \
    API_URL=http://127.0.0.1:3100 \
    API_PROXY_TARGET=http://127.0.0.1:3100 \
    WEB_PORT=5173
EXPOSE 5173
# Root is used only to repair the mounted disk's ownership before dropping privileges.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/infra/fly/entrypoint.sh"]

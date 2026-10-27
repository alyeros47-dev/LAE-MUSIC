# syntax=docker/dockerfile:1
# Temporary review service only. No production data or external database access.
FROM node:22-bookworm-slim AS node
FROM postgres:16-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --omit=dev --strict-ssl=true; else npm ci --omit=dev --strict-ssl=true; fi
COPY *.js ./
# The shared studio catalog reads the original selection metadata at runtime.
COPY music-prompt-studio.html ./
COPY lib ./lib
COPY web ./web
COPY config ./config
COPY data ./data
COPY migrations ./migrations
COPY deploy/review-entrypoint.sh ./deploy/review-entrypoint.sh
COPY deploy/review-provider-budget.cjs ./deploy/review-provider-budget.cjs
# The notice is specific to this isolated image; production source HTML is unchanged.
RUN node -e 'const fs=require("fs"),p="web/index.html",s=fs.readFileSync(p,"utf8");if(!s.includes("<main id=\"page\""))throw Error("Review notice anchor missing");fs.writeFileSync(p,s.replace("<main id=\"page\"","<p class=\"notice\" role=\"note\" id=\"review-notice\"><strong>TEMPORARY TEST SITE.</strong> Test accounts and data can reset when this service restarts. Shared-provider test allowance: two lyrics requests and one music/voice request per temporary instance. The public song catalog is a test copy; live artist logins are not copied. Uploads and payments require separate configuration. Do not enter real payment details.</p><main id=\"page\""));' \
    && chmod -R a+rX /app && chmod 755 deploy/review-entrypoint.sh
ENV LAE_REVIEW_ENVIRONMENT=pr6-ephemeral-review-v1 NODE_ENV=staging PORT=10000 STUDIO_RELEASE_WORKER_ENABLED=false ARTIST_NOTIFICATION_WORKER_ENABLED=false
USER postgres
EXPOSE 10000
ENTRYPOINT ["/app/deploy/review-entrypoint.sh"]

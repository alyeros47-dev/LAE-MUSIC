# Temporary read-only interface inspection. No PostgreSQL, production server or API keys.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY scripts/gospel-inspection-server.cjs ./scripts/gospel-inspection-server.cjs
COPY lib ./lib
COPY config ./config
COPY music-prompt-studio.html ./
COPY web ./web
COPY docs/GOSPEL-STUDIO-INSPECTION-LIST.md ./docs/GOSPEL-STUDIO-INSPECTION-LIST.md
USER node
ENV PORT=10000
EXPOSE 10000
CMD ["node","scripts/gospel-inspection-server.cjs"]

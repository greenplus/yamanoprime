FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npx --yes pnpm@11.19.0 install --prod --frozen-lockfile
COPY server ./server
ENV NODE_ENV=production PYTHON_BIN=python3
USER node
EXPOSE 3003
CMD ["node", "server/index.mjs"]

# EduProtocol - production container
FROM node:20-bookworm-slim

# better-sqlite3 ships prebuilt binaries for common platforms; build tools are
# a safety net in case a native rebuild is needed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the app
COPY server.js sync-shim.js ./
COPY public ./public

# The SQLite database lives here. Mount a volume to keep it across deploys.
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.js"]

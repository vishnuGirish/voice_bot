FROM node:20-slim AS base
WORKDIR /app

# Prisma needs OpenSSL on Debian slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Apply any pending migrations, then start the custom server (Next.js + WebSocket voice proxy)
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]

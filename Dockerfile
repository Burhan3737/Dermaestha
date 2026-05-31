# ---- build client ----
FROM node:22-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
RUN npm ci
COPY client ./client
RUN npm run build:client

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY shared ./shared
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/src/index.js"]

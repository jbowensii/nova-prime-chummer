# Build the app, then serve it with the small Node server that also stores runners as XML.
# Volumes: /data/characters (saved runners), /data/custom (house-rule overlays).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server/server.mjs ./server/server.mjs
ENV PORT=80 STATIC_DIR=/app/dist CHAR_DIR=/data/characters CUSTOM_DIR=/data/custom
VOLUME ["/data/characters", "/data/custom"]
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/api/health > /dev/null || exit 1
CMD ["node", "server/server.mjs"]

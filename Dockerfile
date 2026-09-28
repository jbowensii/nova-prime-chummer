# Build the app, then serve it with the small Node server that also stores runners as XML and runs the
# PDF importer (Python). Volumes: /data/characters (saved runners), /data/custom (house-rule overlays and
# imported books' data), /data/library (uploaded PDFs, their Markdown, reports and AI settings; never served).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build \
 && node -p "require('./package.json').version" > VERSION

FROM node:22-alpine
# OCR=1 adds Tesseract for scanned books
ARG OCR=0
WORKDIR /app
COPY importer/requirements.txt ./importer/requirements.txt
RUN apk add --no-cache python3 py3-pip \
 && if [ "$OCR" = "1" ]; then apk add --no-cache tesseract-ocr; fi \
 && pip install --no-cache-dir --break-system-packages -r /app/importer/requirements.txt
COPY --from=build /app/dist ./dist
# the app version backups record (package.json isn't in this image)
COPY --from=build /app/VERSION ./VERSION
COPY server/server.mjs server/books.mjs server/auth.mjs server/users.mjs ./server/
COPY importer ./importer
RUN rm -rf ./importer/tests && find ./importer -name __pycache__ -prune -exec rm -rf {} +
# the importer reads sources.xml from the built app's data, and the core files (skills, amp effects …) from
# CUSTOM_DIR/imported/core, which the core rulebook's import builds: the image ships no core data
ENV PORT=80 STATIC_DIR=/app/dist CHAR_DIR=/data/characters CUSTOM_DIR=/data/custom LIBRARY_DIR=/data/library \
    PYTHON=python3 CA2_DATA_DIR=/app/dist/data PYTHONDONTWRITEBYTECODE=1
VOLUME ["/data/characters", "/data/custom", "/data/library"]
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/api/health > /dev/null || exit 1
CMD ["node", "server/server.mjs"]

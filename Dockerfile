# Build the static app, then serve it with nginx. Game data ships in the image;
# house rules go in the /usr/share/nginx/html/custom volume (see docs/data-format.md).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
VOLUME /usr/share/nginx/html/custom
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/data/levels.xml > /dev/null || exit 1

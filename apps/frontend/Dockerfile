FROM node:20.19-bullseye-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm config set fund false \
    && npm config set audit false \
    && npm ci --legacy-peer-deps --prefer-online \
    || (echo "npm install failed. Dumping npm logs..." \
    && find /root/.npm/_logs -type f -name "*.log" -maxdepth 2 -print -exec cat {} \; \
    && exit 1)

COPY . .
RUN npm run build -- --mode production

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

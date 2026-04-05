FROM node:20-bullseye-slim as builder

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build -- --mode production

FROM nginx:alpine
RUN apk add --no-cache openssl \
    && mkdir -p /etc/nginx/certs \
    && openssl req -x509 -nodes -days 365 \
      -subj "/CN=coffee.example.com" \
      -newkey rsa:2048 \
      -keyout /etc/nginx/certs/localhost.key \
      -out /etc/nginx/certs/localhost.crt
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]

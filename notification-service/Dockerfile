FROM node:20-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production &amp;&amp; npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 3002
CMD ["node", "dist/main"]


FROM node:20-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/main"]

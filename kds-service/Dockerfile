FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN npm run build

CMD ["sh", "-c", "npx prisma generate && npm run start:prod"]

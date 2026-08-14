FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data /app/certs

EXPOSE 3002

CMD ["node", "server.js"]

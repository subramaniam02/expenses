FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 0.0.0.0 overrides vite.config host: 'localhost' so the container is reachable
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

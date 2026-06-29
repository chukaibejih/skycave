FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
# No lockfile committed yet; use install (switch to `npm ci` once package-lock.json exists).
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]

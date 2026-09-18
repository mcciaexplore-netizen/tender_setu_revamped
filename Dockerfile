FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install

COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --omit=dev --workspace=@tendermatch/backend --workspace=@tendermatch/shared-types

COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/migrations ./apps/backend/migrations
COPY --from=build /app/apps/frontend/dist ./apps/backend/public

EXPOSE 3000
CMD ["node", "apps/backend/dist/index.js"]

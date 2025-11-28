# Stage 1: build the React application
FROM node:20 AS builder
WORKDIR /app

COPY client/package.json client/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY client/ .

# Allow overriding API endpoints at build time; defaults align with the ingress paths.
ARG REACT_APP_GALAXIES_API_URL=/api/galaxies
ARG REACT_APP_PLANETS_API_URL=/api/planets

ENV REACT_APP_GALAXIES_API_URL=${REACT_APP_GALAXIES_API_URL} \
    REACT_APP_PLANETS_API_URL=${REACT_APP_PLANETS_API_URL} 

RUN yarn build

# Stage 2: lightweight runtime that serves the build
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=80

COPY --from=builder /app/build ./build
COPY server/package.json ./package.json
COPY server/index.js ./server/index.js
RUN npm install --omit=dev

EXPOSE 80
CMD ["node", "server/index.js"]

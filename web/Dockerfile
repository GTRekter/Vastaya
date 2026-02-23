# Stage 1: build the React application
FROM node:20 AS builder
WORKDIR /app

COPY client/package.json client/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY client/ .

# Allow overriding API endpoints at build time; defaults align with the ingress paths.
ARG REACT_APP_UNIVERSE_API_BASE_URL=/api/universe
ARG REACT_APP_FLEET_API_BASE_URL=/api/fleet
ARG REACT_APP_CONTROL_TOWER_URL=/chat

ENV REACT_APP_UNIVERSE_API_BASE_URL=${REACT_APP_UNIVERSE_API_BASE_URL} \
    REACT_APP_FLEET_API_BASE_URL=${REACT_APP_FLEET_API_BASE_URL} \
    REACT_APP_CONTROL_TOWER_URL=${REACT_APP_CONTROL_TOWER_URL}

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

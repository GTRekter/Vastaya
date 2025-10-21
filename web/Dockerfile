# Stage 1: build the React application
FROM node:20 AS builder
WORKDIR /app

COPY client/package.json client/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY client/ .

# Allow overriding API endpoints at build time; default to the in-cluster proxy.
ARG REACT_APP_USERS_API_URL=/api/users
ARG REACT_APP_GALAXIES_API_URL=/api/galaxies
ARG REACT_APP_PLANETS_API_URL=/api/planets
ARG REACT_APP_COMMENTS_API_URL=/api/comments

ENV REACT_APP_USERS_API_URL=${REACT_APP_USERS_API_URL} \
    REACT_APP_GALAXIES_API_URL=${REACT_APP_GALAXIES_API_URL} \
    REACT_APP_PLANETS_API_URL=${REACT_APP_PLANETS_API_URL} \
    REACT_APP_COMMENTS_API_URL=${REACT_APP_COMMENTS_API_URL}

RUN yarn build

# Stage 2: lightweight runtime that serves the build and proxies API calls
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=80

COPY --from=builder /app/build ./build
COPY server/package.json ./package.json
COPY server/index.js ./server/index.js
COPY server/routes ./server/routes

RUN npm install --omit=dev

EXPOSE 80
CMD ["node", "server/index.js"]

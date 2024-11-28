# Stage 1: Build the React app in a container
FROM node:20 AS builder
WORKDIR /app
COPY /src/package.json /src/yarn.lock ./
RUN yarn install
COPY /src/ .
RUN yarn build

# Stage 2: Serve the React app using a lightweight web server
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:20
WORKDIR /usr/src/app
COPY /src/package*.json ./
RUN npm install
COPY /src .
EXPOSE 8080
CMD [ "node", "index.js" ]
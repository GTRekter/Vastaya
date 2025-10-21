FROM node:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV PORT=8082
EXPOSE 8082
CMD [ "node", "index.js" ]

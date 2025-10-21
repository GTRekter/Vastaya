FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV HTTP_PORT=8080
ENV GRPC_PORT=50051

EXPOSE 8080 50051

CMD [ "npm", "start" ]

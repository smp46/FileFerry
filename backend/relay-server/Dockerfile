FROM node:lts-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm i

RUN mkdir -p /usr/src/app/db && chown -R node:node /usr/src/app/db

COPY . .

EXPOSE 41337

USER node

CMD ["npm", "run", "relay"]


FROM node:lts-alpine

WORKDIR /usr/src/app

copy package*.json ./

RUN npm i

COPY . .

EXPOSE 41337

USER node

CMD ["npm", "run", "relay"]


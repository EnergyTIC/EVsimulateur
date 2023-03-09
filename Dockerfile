FROM node:14-slim

WORKDIR /var/www

COPY package*.json ./
RUN npm ci --only=prod
COPY . .

EXPOSE 9002
ENV NODE_ENV production

CMD ["npm", "start"]

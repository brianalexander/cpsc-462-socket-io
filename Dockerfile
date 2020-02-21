FROM node:12-alpine
LABEL Author "Brian Alexander"

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY ./server/package*.json /usr/src/app/
RUN npm install


# Bundle app source
COPY ./server /usr/src/app

CMD [ "npm", "start" ]

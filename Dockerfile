FROM node:18.17

COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=node /usr/local/bin/node /usr/local/bin/node_modules

# Set working directory
WORKDIR /var/www/html

COPY package.json package.json
COPY package-lock.json package-lock.json
 
RUN npm install

COPY . /var/www/html/
RUN chown -R $user:$user /var/www/
RUN chmod -R 755 /var/www/

USER $user

CMD [ "npm", "run", "start" ]

# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

COPY package.json ./
COPY index.html styles.css data.js views.js app.js assistant.css assistant.js collab.css collab.js shop.html shop.css shop.js ./
COPY server ./server
COPY exports ./exports

EXPOSE 8787
CMD ["node", "--env-file-if-exists=.env", "server/server.mjs"]

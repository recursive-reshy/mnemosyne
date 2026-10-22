FROM node:24-slim

WORKDIR /app
COPY server.mjs fixtures.mjs ./

ENV PORT=4000
EXPOSE 4000
USER node

CMD ["node", "server.mjs"]

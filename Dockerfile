FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node providers ./providers
COPY --chown=node:node ranking ./ranking
COPY --chown=node:node frontend ./frontend
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "backend/server.js"]

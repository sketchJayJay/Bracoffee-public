FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=80
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 80
CMD ["node", "server.js"]

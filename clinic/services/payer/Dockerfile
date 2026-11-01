FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# The payer has no runtime dependencies. package.json is only needed to mark the code as ES modules.
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "src/server.ts"]

FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first (better cache)
COPY package.json yarn.lock* ./
RUN corepack enable && yarn install --frozen-lockfile || yarn install

COPY . .

EXPOSE 3000
# CRA / craco dev server
CMD ["yarn", "start"]

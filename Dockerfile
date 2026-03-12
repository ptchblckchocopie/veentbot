FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src/ src/
COPY scripts/ scripts/
COPY data/ data/
COPY public/ public/
COPY tsconfig.json ./

# Build TypeScript
RUN npx tsc || true

# Expose port
EXPOSE 3000

# Start the server
CMD ["npx", "tsx", "scripts/serve.ts"]

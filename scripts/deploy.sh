#!/bin/bash
set -e

echo "========================================="
echo "  VeentBot — Production Deploy"
echo "========================================="
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
  echo "Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "Docker installed. You may need to log out and back in, then re-run this script."
  exit 1
fi

# Check Docker Compose
if ! docker compose version &> /dev/null; then
  echo "ERROR: Docker Compose not found. Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

echo "Step 1: Building and starting all services..."
echo "  (This will pull Ollama models on first run — may take a few minutes)"
echo ""
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "Step 2: Waiting for services to be healthy..."
sleep 10

# Wait for bot to be healthy
for i in $(seq 1 30); do
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null 2>&1; then
    echo "  Bot is healthy!"
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 5
done

# Check if it came up
if ! curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null 2>&1; then
  echo ""
  echo "Bot isn't responding yet. Ollama models may still be downloading."
  echo "Check progress with: docker compose -f docker-compose.prod.yml logs -f ollama-init"
  echo "Once models are ready, the bot will start automatically."
  exit 0
fi

echo ""
echo "Step 3: Running database migrations..."
docker compose -f docker-compose.prod.yml exec bot npx tsx scripts/migrate.ts

echo ""
echo "Step 4: Seeding FAQ data..."
docker compose -f docker-compose.prod.yml exec bot npx tsx scripts/seed-faqs.ts

echo ""
echo "Step 5: Ingesting knowledge docs..."
docker compose -f docker-compose.prod.yml exec bot npx tsx scripts/ingest-docs.ts

echo ""
echo "========================================="
echo "  VeentBot is live!"
echo "========================================="
echo ""
echo "  Chat:    http://$(hostname -I | awk '{print $1}'):${PORT:-3000}"
echo "  Admin:   http://$(hostname -I | awk '{print $1}'):${PORT:-3000}/admin"
echo "  Health:  http://$(hostname -I | awk '{print $1}'):${PORT:-3000}/api/health"
echo ""
echo "  Manage:"
echo "    Logs:     docker compose -f docker-compose.prod.yml logs -f bot"
echo "    Stop:     docker compose -f docker-compose.prod.yml down"
echo "    Restart:  docker compose -f docker-compose.prod.yml restart bot"
echo ""

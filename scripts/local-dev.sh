#!/bin/bash
set -e

echo "🚀 Starting Solar Monitoring Stack (Local Dev)"

# Créer les dossiers nécessaires
mkdir -p monitoring/grafana/provisioning/{datasources,dashboards}
mkdir -p monitoring/grafana/dashboards

# Arrêter les conteneurs existants
docker-compose down 2>/dev/null || true

# Nettoyer les images
docker-compose rm -f 2>/dev/null || true

# Lancer la stack
echo "📦 Building and starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Vérifier les services
echo "✅ Checking services..."
docker-compose ps

echo ""
echo "🎯 Access points:"
echo "  📊 Grafana: http://localhost:3000 (admin/admin)"
echo "  📈 Prometheus: http://localhost:9090"
echo "  🔍 Solar Simulator Metrics: http://localhost:9100/metrics"
echo ""
echo "✨ Stack is ready!"
echo "To stop: docker-compose down"

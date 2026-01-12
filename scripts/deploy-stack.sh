#!/bin/bash
set -e

echo "🚀 Deploying Full Stack with ArgoCD..."

CLUSTER_NAME="solar-monitoring"

# 1. Create namespaces
echo "📦 Creating namespaces..."
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# 2. Install ArgoCD
echo "🎯 Installing ArgoCD..."
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD
echo "⏳ Waiting for ArgoCD to be ready..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=300s

# 3. Deploy Prometheus with Helm
echo "📊 Installing Prometheus..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelector.matchLabels.release=prometheus \
  || helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelector.matchLabels.release=prometheus

# 4. Deploy Grafana with Helm
echo "🎨 Installing Grafana..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword=admin \
  || helm upgrade grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword=admin

# 5. Deploy Solar Simulator
echo "☀️ Deploying Solar Simulator..."
kubectl apply -f k8s/apps/solar-simulator/

# 6. Deploy ArgoCD Application
echo "🔄 Setting up ArgoCD Application..."
kubectl apply -f k8s/argocd/application.yaml

echo "✅ Deployment complete!"
echo ""
echo "🎯 Access points:"
echo "  🔐 ArgoCD: kubectl port-forward -n argocd svc/argocd-server 8080:443"
echo "  📊 Grafana: kubectl port-forward -n monitoring svc/grafana 3000:80"
echo "  📈 Prometheus: kubectl port-forward -n monitoring svc/prometheus-server 9090:80"
echo ""
echo "Get ArgoCD password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"

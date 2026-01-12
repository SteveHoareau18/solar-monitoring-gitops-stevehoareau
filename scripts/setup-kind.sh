#!/bin/bash
set -e

CLUSTER_NAME="solar-monitoring"
REGISTRY_PORT=5001
REGISTRY_NAME="kind-registry"

echo "🚀 Setting up Kind Cluster with Local Registry..."

# 1. Create local registry
echo "📦 Creating local Docker registry..."
if ! docker inspect "${REGISTRY_NAME}" &>/dev/null; then
  docker run -d \
    --restart=always \
    -p "127.0.0.1:${REGISTRY_PORT}:5000" \
    --name "${REGISTRY_NAME}" \
    registry:2
fi

# 2. Create Kind cluster with registry config
echo "🎯 Creating Kind cluster..."
cat > /tmp/kind-config.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ${CLUSTER_NAME}
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:${REGISTRY_PORT}"]
      endpoint = ["http://${REGISTRY_NAME}:${REGISTRY_PORT}"]
EOF

kind create cluster --config /tmp/kind-config.yaml || true

# 3. Connect registry to cluster
echo "🔗 Connecting registry to cluster..."
docker network connect "kind" "${REGISTRY_NAME}" 2>/dev/null || true

# 4. Document local registry
kubectl create configmap local-registry-hosting \
  --from-literal=localRegistryHosting.v1="host.\"localhost:${REGISTRY_PORT}\"" \
  -n kube-public \
  -o yaml | kubectl apply -f - || true

echo "✅ Kind cluster '${CLUSTER_NAME}' created!"
echo ""
echo "📝 Next steps:"
echo "  1. Build image: docker build -t solar-simulator:v1.0.0 ./src/solar-simulator"
echo "  2. Tag image: docker tag solar-simulator:v1.0.0 localhost:${REGISTRY_PORT}/solar-simulator:v1.0.0"
echo "  3. Push: docker push localhost:${REGISTRY_PORT}/solar-simulator:v1.0.0"
echo "  4. Deploy: kubectl apply -f k8s/apps/"

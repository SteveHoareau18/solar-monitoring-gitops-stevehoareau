# 1. Setup Kind cluster
```bash
./scripts/setup-kind.sh
```

# 2. Build et push l'image
```bash
docker build -t solar-simulator:v1.0.0 ./src/solar-simulator
docker tag solar-simulator:v1.0.0 localhost:5001/solar-simulator:v1.0.0
docker push localhost:5001/solar-simulator:v1.0.0
```

# 3. Déployer la stack
```bash
./scripts/deploy-stack.sh
```
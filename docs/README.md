Solar Simulator - API

Description
Application Node.js simulant la production de 3 fermes solaires françaises (Provence, Occitanie, Nouvelle-Aquitaine).
Expose les métriques Prometheus toutes les 30 secondes et permet de monitorer la production, température, irradiance, état des onduleurs et revenus journaliers.

Endpoints

1) GET /metrics
- Retourne les métriques au format Prometheus (text/plain; version=0.0.4)
- Exemple :
  curl http://localhost:9100/metrics

Métriques exposées :
- solar_power_watts{farm="provence",panel_id="P001"} <float> : puissance instantanée
- solar_irradiance_wm2{farm="provence"} <float> : irradiance solaire
- solar_panel_temperature_celsius{farm="provence",panel_id="P001"} <float> : température panneau
- solar_inverter_status{farm="provence",inverter_id="INV01"} 0|1 : état de l'onduleur
- solar_daily_revenue_euros{farm="provence"} <counter> : revenus journaliers

2) GET /health
- Retourne un JSON simple :
  { "status": "ok", "farms": ["provence","occitanie","aquitaine"] }

Config & Run

Développement :
  npm install
  npm run start:dev

Production :
  npm ci --only=production
  node app.js

Docker

Build :
  docker build -t solar-sim:1.0 .

Run :
  docker run -p 9100:9100 --rm solar-sim:1.0

Kubernetes Deployment

Namespace :
  kubectl create namespace solar-prod

Appliquer les manifests :
  kubectl apply -k . -n solar-prod

Vérifier le pod :
  kubectl get pods -n solar-prod
  kubectl logs -f deployment/solar-simulator -n solar-prod

Tester l’endpoint metrics :
  kubectl port-forward svc/solar-simulator 9100:9100 -n solar-prod
  curl http://localhost:9100/metrics

Notes
- Les métriques exposées sont compatibles avec Prometheus et peuvent être scrappées via un ServiceMonitor.
- Les anomalies aléatoires (panne, surchauffe, dégradation) sont injectées pour tester les alertes.
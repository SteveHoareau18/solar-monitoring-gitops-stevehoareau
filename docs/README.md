Solar Simulator - API

Endpoints
1) GET /metrics
   - Returns Prometheus metrics (text/plain; version=0.0.4)
   - Example:
     curl http://localhost:9100/metrics

   Métriques exposées:
   - solar_power_watts{farm="provence",panel_id="P001"} <float>
   - solar_irradiance_wm2{farm="provence"} <float>
   - solar_panel_temperature_celsius{farm="provence",panel_id="P001"} <float>
   - solar_inverter_status{farm="provence",inverter_id="INV01"} 0|1
   - solar_daily_revenue_euros{farm="provence"} <counter>

2) GET /health
   - Retourne un JSON simple: {status:"ok", farms:["provence","occitanie","aquitaine"]}

Config & run
- Dev:
    npm install
    npm run start:dev
- Prod:
    npm ci --only=production
    node app.js

Docker
- Build:
    docker build -t solar-sim:1.0 .
- Run:
    docker run -p 9100:9100 --rm solar-sim:1.0

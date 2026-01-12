// app.js
const express = require('express');
const client = require('prom-client');

const app = express();
const register = client.register;

// --- Config fermes & panneaux (valeurs tirées de l'énoncé) ---
const FARMS = {
    provence: { name: 'provence', panels: 5000, location: 'Marseille' },
    occitanie: { name: 'occitanie', panels: 3500, location: 'Montpellier' },
    aquitaine: { name: 'aquitaine', panels: 4200, location: 'Bordeaux' }
};

const PANEL_PEAK_W = 400;           // 400 Wc
const ETA_SYSTEM = 0.85;
const TARIF_RACHAT = 0.18;         // €/kWh
const GENERATION_INTERVAL_MS = 30_000; // 30s

// For practical metric volume: we'll expose 5 sample panels per farm (P001..P005)
const SAMPLE_PANEL_COUNT = 5;
const PANEL_IDS = Array.from(
    { length: SAMPLE_PANEL_COUNT },
    (_, i) => `P${String(i + 1).padStart(3, '0')}`
);
const INVERTER_IDS = ['INV01', 'INV02', 'INV03'];

// --- Prometheus metrics ---

// Per-panel power
const gauge_power = new client.Gauge({
    name: 'solar_power_watts',
    help: 'Production électrique instantanée par panneau (watts)',
    labelNames: ['farm', 'panel_id']
});

// Farm-level irradiance
const gauge_irradiance = new client.Gauge({
    name: 'solar_irradiance_wm2',
    help: 'Irradiance solaire mesurée (W/m2)',
    labelNames: ['farm']
});

// Panel temperature
const gauge_panel_temp = new client.Gauge({
    name: 'solar_panel_temperature_celsius',
    help: 'Température du panneau (°C)',
    labelNames: ['farm', 'panel_id']
});

// Inverter status
const gauge_inverter_status = new client.Gauge({
    name: 'solar_inverter_status',
    help: "État de l'onduleur (1=OK,0=KO)",
    labelNames: ['farm', 'inverter_id']
});

// Daily revenue (counter => suffix _total)
const counter_daily_revenue = new client.Counter({
    name: 'solar_daily_revenue_euros_total',
    help: 'Revenus journaliers estimés cumulés (euros)',
    labelNames: ['farm']
});

// Total anomalies
const counter_anomalies = new client.Counter({
    name: 'solar_anomalies_total',
    help: 'Nombre total d\'anomalies détectées',
    labelNames: ['farm', 'type']
});

// Farm efficiency
const gauge_efficiency = new client.Gauge({
    name: 'solar_efficiency_percent',
    help: 'Efficacité instantanée de la ferme (%)',
    labelNames: ['farm']
});

// Farm total power
const gauge_farm_total_power = new client.Gauge({
    name: 'solar_farm_total_power_watts',
    help: 'Production totale de la ferme (watts)',
    labelNames: ['farm']
});

// Availability (0–1)
const gauge_availability = new client.Gauge({
    name: 'solar_availability_ratio',
    help: 'Ratio de disponibilité estimé (0–1)',
    labelNames: ['farm']
});

// Internal state to keep anomalies and running totals
const state = {
    farms: {},
    rng() {
        return Math.random();
    } // can be stubbed in tests
};

// Init state
for (const key of Object.keys(FARMS)) {
    state.farms[key] = {
        activeAnomalies: [], // each anomaly: {type, remainingCycles, meta}
        uptimeSeconds: 0,
        lastResetDay: new Date().getUTCDate(),
        dailyRevenueEuros: 0,
        startedAt: Date.now()
    };

    // initialize inverter status as OK
    for (const inv of INVERTER_IDS) {
        gauge_inverter_status.set({ farm: key, inverter_id: inv }, 1);
    }
}

// --- Helper: irradiance model (simplified) ---
// Irradiance_max depends on clear day; choose 1000 W/m2 as typical peak
function irradianceAtHour(h, irradianceMax = 1000) {
    if (h < 6 || h >= 18) return 0;
    // sin(pi * (h - 6) / 12) gives 0..1 shape from 6 to 18
    const v = Math.sin((Math.PI * (h - 6)) / 12);
    return Math.max(0, irradianceMax * v);
}

// Temperature model: base ambient + panel heating proportional to irradiance
function panelTemperature(ambientC, irradiance) {
    // simplistic: panel warms with irradiance; at irradiance 1000 -> +30°C above ambient
    const delta = (irradiance / 1000) * 30;
    return ambientC + delta;
}

// Temp factor from spec: Factor_température = 1 + (T_panneau - 25) × (-0.0035)
function temperatureFactor(Tpanel) {
    return 1 + (Tpanel - 25) * -0.0035;
}

// Production theoretical instantanée (watts)
function productionTheoreticalWatts(numberPanels, irradiance, Tpanel) {
    // P(t) = N_panels × Puissance_crête × (Irradiance / 1000) × η_système × Facteur_température
    const P =
        numberPanels *
        PANEL_PEAK_W *
        (irradiance / 1000) *
        ETA_SYSTEM *
        temperatureFactor(Tpanel);
    return Math.max(0, P);
}

// Inject anomalies randomly (10% chance per farm per cycle)
function maybeInjectAnomalies(farmKey) {
    const r = state.rng();
    if (r < 0.1) {
        const types = [
            'inverter_failure',
            'overheat',
            'sensor_loss',
            'degradation',
            'shade'
        ];
        const choice = types[Math.floor(state.rng() * types.length)];
        const durationCycles = 1 + Math.floor(state.rng() * 10); // 30s cycles -> 1..10 cycles
        const anomaly = {
            type: choice,
            remainingCycles: durationCycles,
            injectedAt: Date.now()
        };
        state.farms[farmKey].activeAnomalies.push(anomaly);

        // log in Prometheus
        counter_anomalies.inc({ farm: farmKey, type: choice });
        console.log(
            `[ANOMALY] ${farmKey}: ${choice} for ${durationCycles} cycle(s)`
        );

        return anomaly;
    }
    return null;
}

// Apply anomalies to computed metrics for a farm for this cycle
function applyAnomaliesToFarm(farmKey, metrics) {
    // metrics: {irradiance, Tpanel, productionTotal}
    const farmState = state.farms[farmKey];
    const remaining = [];
    for (const a of farmState.activeAnomalies) {
        switch (a.type) {
            case 'inverter_failure':
                metrics.productionTotal = 0;
                metrics.inverterDown = true;
                break;
            case 'overheat':
                metrics.Tpanel += 30;
                break;
            case 'sensor_loss':
                metrics.sensorLoss = true;
                break;
            case 'degradation':
                metrics.productionTotal *= 1 - (0.15 + 0.1 * state.rng());
                break;
            case 'shade':
                metrics.productionTotal *= 0.4 + 0.2 * state.rng(); // 40%..60%
                break;
        }
        a.remainingCycles -= 1;
        if (a.remainingCycles > 0) remaining.push(a);
    }
    farmState.activeAnomalies = remaining;
}

// Format hours/ambient: use UTC hours for determinism across env
function ambientTemperatureForFarm(farmKey, hour) {
    // Simple ambient model: min 10C at night, max 30C afternoon; shift by farm lat (minor)
    const base = 10 + 20 * Math.sin((Math.PI * (hour - 6)) / 12); // approx
    const offset = farmKey === 'provence' ? 2 : farmKey === 'occitanie' ? 1 : 0;
    return Math.round((base + offset) * 10) / 10;
}

// single generation cycle for all farms
function generateMetricsCycle() {
    const now = new Date();
    const hour = now.getUTCHours();

    for (const [key, meta] of Object.entries(FARMS)) {
        const farmState = state.farms[key];

        // base irradiance
        const irr = irradianceAtHour(
            hour,
            1000 * (0.9 + 0.2 * (state.rng() - 0.5))
        ); // small randomness
        const Tambient = ambientTemperatureForFarm(key, hour);
        let Tpanel = panelTemperature(Tambient, irr);

        // theoretical total production (watts)
        let productionTotal = productionTheoreticalWatts(meta.panels, irr, Tpanel);

        // maybe inject anomalies
        maybeInjectAnomalies(key);

        // apply anomalies in state
        const metrics = {
            irradiance: irr,
            Tpanel,
            productionTotal,
            inverterDown: false,
            sensorLoss: false
        };
        applyAnomaliesToFarm(key, metrics);

        // Expose irradiance (per farm)
        gauge_irradiance.set({ farm: key }, metrics.irradiance);

        // If sensorLoss flag -> simulate missing data
        const missing = metrics.sensorLoss;

        // For sample panels, set per-panel temp and per-panel power (average)
        const perPanelW = (metrics.productionTotal / meta.panels) || 0;
        for (const pid of PANEL_IDS) {
            if (!missing) {
                gauge_panel_temp.set(
                    { farm: key, panel_id: pid },
                    Math.round(metrics.Tpanel * 10) / 10
                );
                gauge_power.set(
                    { farm: key, panel_id: pid },
                    Math.round(perPanelW * 10) / 10
                );
            } else {
                // 0 to simulate missing / KO sensor
                gauge_panel_temp.set({ farm: key, panel_id: pid }, 0);
                gauge_power.set({ farm: key, panel_id: pid }, 0);
            }
        }

        // Inverter statuses
        if (metrics.inverterDown) {
            INVERTER_IDS.forEach((inv, i) => {
                gauge_inverter_status.set(
                    { farm: key, inverter_id: inv },
                    i === 0 ? 0 : 1
                );
            });
        } else {
            INVERTER_IDS.forEach(inv => {
                gauge_inverter_status.set({ farm: key, inverter_id: inv }, 1);
            });
        }

        // Revenue calculation
        const energyKWh =
            (metrics.productionTotal * (GENERATION_INTERVAL_MS / 1000 / 3600)) /
            1000;
        const revenue = energyKWh * TARIF_RACHAT;
        if (revenue > 0) {
            counter_daily_revenue.inc({ farm: key }, revenue);
            farmState.dailyRevenueEuros += revenue;
        }

        // uptime accounting: if at least one inverter OK -> uptime increased
        const anyInverterOk = !metrics.inverterDown;
        if (anyInverterOk) {
            farmState.uptimeSeconds += GENERATION_INTERVAL_MS / 1000;
        }

        // availability estimation since start
        const totalTimeSeconds = (Date.now() - farmState.startedAt) / 1000;
        const availability =
            totalTimeSeconds > 0
                ? farmState.uptimeSeconds / totalTimeSeconds
                : 1;
        gauge_availability.set(
            { farm: key },
            Math.round(availability * 1000) / 1000
        );

        // Efficiency vs theoretical max
        const theoreticalMax = meta.panels * PANEL_PEAK_W;
        const efficiency =
            theoreticalMax > 0
                ? (metrics.productionTotal / theoreticalMax) * 100
                : 0;
        gauge_efficiency.set(
            { farm: key },
            Math.round(efficiency * 100) / 100
        );

        // Farm total power
        gauge_farm_total_power.set(
            { farm: key },
            Math.round(metrics.productionTotal)
        );

        // rotate daily counter if day changed (UTC)
        const today = now.getUTCDate();
        if (farmState.lastResetDay !== today) {
            farmState.lastResetDay = today;
            farmState.dailyRevenueEuros = 0;
            // Counter non remis à zéro : on utilisera increase() par jour côté PromQL
        }
    }
}

// Start generation loop
console.log('Solar simulator starting. Generating metrics every 30s.');
generateMetricsCycle(); // initial
const intervalHandle = setInterval(generateMetricsCycle, GENERATION_INTERVAL_MS);

// --- HTTP endpoints ---

// Liveness: l’app répond et connaît ses fermes
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        farms: Object.keys(FARMS),
        timestamp: new Date().toISOString()
    });
});

// Readiness: métriques initialisées
app.get('/ready', (req, res) => {
    const ready = Object.keys(state.farms).length === Object.keys(FARMS).length;
    if (ready) {
        res.status(200).json({ status: 'ready' });
    } else {
        res.status(503).json({ status: 'not ready' });
    }
});

// Prometheus /metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err.message);
    }
});

// graceful stop
process.on('SIGINT', () => {
    clearInterval(intervalHandle);
    process.exit(0);
});

const PORT = process.env.PORT || 9100;
app.listen(PORT, () => {
    console.log(`Metrics available at http://0.0.0.0:${PORT}/metrics`);
});

// Export for tests
module.exports = {
    app,
    state,
    FARMS,
    generateMetricsCycle
};

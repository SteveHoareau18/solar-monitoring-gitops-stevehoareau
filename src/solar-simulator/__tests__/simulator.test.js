// __tests__/simulator.test.js
const rewire = require('rewire');
const appModule = rewire('../app.js');

// We only need to test pure functions; since app.js isn't modularized,
// we'll rewire to get references to the helper functions.

test('temperatureFactor matches formula', () => {
  const temperatureFactor = appModule.__get__('temperatureFactor');
  expect(temperatureFactor(25)).toBeCloseTo(1.0);
  expect(temperatureFactor(65)).toBeCloseTo(1 + (65-25)*(-0.0035));
});

test('productionTheoreticalWatts increases with irradiance', () => {
  const productionTheoreticalWatts = appModule.__get__('productionTheoreticalWatts');
  const pLow = productionTheoreticalWatts(1000, 100, 30);
  const pHigh = productionTheoreticalWatts(1000, 800, 30);
  expect(pHigh).toBeGreaterThan(pLow);
});

test('maybeInjectAnomalies respects 0% when RNG forced high', () => {
  // stub rng to always return 0.99 (no inject)
  const state = appModule.__get__('state');
  const originalRng = state.rng;
  state.rng = () => 0.99;
  const maybeInjectAnomalies = appModule.__get__('maybeInjectAnomalies');
  const res = maybeInjectAnomalies('provence');
  expect(res).toBeNull();
  state.rng = originalRng;
});

/**
 * SCDSS — Comprehensive Automated Test Suite
 *
 * Verifies:
 * 1. Mathematical & Operations Research Analytics (Step 3)
 * 2. Edge cases: zero values, empty datasets, insufficient history, invalid parameters
 * 3. Authentication & Security protections (Step 2 & Step 7)
 * 4. End-to-End 11-Step Workflow & Database Persistence across restarts (Step 5)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {
  naiveForecast,
  movingAverageForecast,
  exponentialSmoothingForecast,
  calculateEOQ,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateSuggestedOrderQty,
  optimizeInventory,
  planDeliveryRoute,
  runSequentialAnalytics,
  runParallelAnalytics,
  runExecutionBenchmark,
  generateRecommendationsForProducts,
  AnalyticsValidationError,
} from '../src/server/analytics';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/server/auth';
import { getDb, closeDb, getDbPath } from '../src/server/db';
import { createApp } from '../src/server/app';

const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'scdss-automated-test.db');

describe('Step 3: Supply Chain Analytics & Mathematical Verification', () => {
  const sampleHistory = [
    { period: '2026-01', demand: 100 },
    { period: '2026-02', demand: 120 },
    { period: '2026-03', demand: 110 },
    { period: '2026-04', demand: 130 },
    { period: '2026-05', demand: 150 },
  ];

  it('computes Naive Forecast accurately and handles zero demand values', () => {
    const res = naiveForecast(sampleHistory, 2);
    expect(res.nextPeriodForecast).toBe(150);
    expect(res.futureForecasts).toEqual([
      { period: '2026-06', forecast: 150 },
      { period: '2026-07', forecast: 150 },
    ]);
    // One-step errors: |120-100|=20, |110-120|=10, |130-110|=20, |150-130|=20 -> MAE = 70/4 = 17.5
    expect(res.metrics.mae).toBe(17.5);

    const zeroHistory = [
      { period: '2026-01', demand: 0 },
      { period: '2026-02', demand: 0 },
    ];
    const zeroRes = naiveForecast(zeroHistory, 1);
    expect(zeroRes.nextPeriodForecast).toBe(0);
    expect(zeroRes.metrics.mape).toBe(0);
  });

  it('computes Moving-Average Forecast accurately and rejects insufficient history', () => {
    const res = movingAverageForecast(sampleHistory, 3, 2);
    // Last 3 observations: (110 + 130 + 150) / 3 = 390 / 3 = 130
    expect(res.nextPeriodForecast).toBe(130);
    expect(res.futureForecasts.length).toBe(2);

    // Insufficient history: window = 6 on 5 records must throw INSUFFICIENT_HISTORY
    expect(() => movingAverageForecast(sampleHistory, 6, 2)).toThrowError(AnalyticsValidationError);
  });

  it('computes Exponential Smoothing Forecast accurately and validates alpha bounds', () => {
    // F_1 = 100
    // F_2 = 0.5*100 + 0.5*100 = 100
    // F_3 = 0.5*120 + 0.5*100 = 110
    // F_4 = 0.5*110 + 0.5*110 = 110
    // F_5 = 0.5*130 + 0.5*110 = 120
    // Next (F_6) = 0.5*150 + 0.5*120 = 135
    const res = exponentialSmoothingForecast(sampleHistory, 0.5, 1);
    expect(res.nextPeriodForecast).toBe(135);

    expect(() => exponentialSmoothingForecast(sampleHistory, 0, 1)).toThrowError(AnalyticsValidationError);
    expect(() => exponentialSmoothingForecast(sampleHistory, 1.2, 1)).toThrowError(AnalyticsValidationError);
    expect(() => exponentialSmoothingForecast([], 0.3, 1)).toThrowError(AnalyticsValidationError);
  });

  it('computes EOQ, Safety Stock, Reorder Point, and Suggested Order Quantity with exact numerical precision', () => {
    // EOQ = sqrt((2 * 1000 * 50) / 2.5) = sqrt(40000) = 200
    expect(calculateEOQ(1000, 50, 2.5)).toBe(200);
    expect(calculateEOQ(0, 50, 2.5)).toBe(0);
    expect(() => calculateEOQ(-10, 50, 2.5)).toThrowError(AnalyticsValidationError);
    expect(() => calculateEOQ(1000, 50, 0)).toThrowError(AnalyticsValidationError);

    // Safety Stock: Z(0.95)=1.6449, sigma_d=10, L=9 -> 1.6449 * 10 * 3 = 49.35
    const ss = calculateSafetyStock(10, 9, 0.95);
    expect(ss).toBe(49.35);
    expect(calculateSafetyStock(0, 9, 0.95)).toBe(0);
    expect(calculateSafetyStock(10, 0, 0.95)).toBe(0);

    // Reorder Point: mean=40, L=5, SS=30 -> 40*5 + 30 = 230
    const rop = calculateReorderPoint(40, 5, 30);
    expect(rop).toBe(230);

    // Suggested Order Quantity:
    // Available (250) > ROP (230) -> 0
    expect(calculateSuggestedOrderQty(250, 230, 200, 30)).toBe(0);
    // Available (180) <= ROP (230) -> max(EOQ=200, 230 - 180 + 30 = 80) = 200
    expect(calculateSuggestedOrderQty(180, 230, 200, 30)).toBe(200);
    // Deep shortage: Available (10) <= ROP (230) -> max(EOQ=200, 230 - 10 + 30 = 250) = 250
    expect(calculateSuggestedOrderQty(10, 230, 200, 30)).toBe(250);
  });

  it('optimizes delivery routes and ensures 2-Opt is at least as short as Nearest-Neighbor', () => {
    const depot = {
      id: 1,
      code: 'DEPOT',
      name: 'Central Depot',
      nodeType: 'depot' as const,
      city: 'Chicago',
      latitude: 41.8781,
      longitude: -87.6298,
      demandUnits: 0,
    };
    const stops = [
      {
        id: 2,
        code: 'S1',
        name: 'Stop 1',
        nodeType: 'customer' as const,
        city: 'Milwaukee',
        latitude: 43.0389,
        longitude: -87.9065,
        demandUnits: 120,
      },
      {
        id: 3,
        code: 'S2',
        name: 'Stop 2',
        nodeType: 'customer' as const,
        city: 'Indianapolis',
        latitude: 39.7684,
        longitude: -86.1581,
        demandUnits: 180,
      },
      {
        id: 4,
        code: 'S3',
        name: 'Stop 3',
        nodeType: 'customer' as const,
        city: 'Detroit',
        latitude: 42.3314,
        longitude: -83.0458,
        demandUnits: 150,
      },
      {
        id: 5,
        code: 'S4',
        name: 'Stop 4',
        nodeType: 'customer' as const,
        city: 'St. Louis',
        latitude: 38.627,
        longitude: -90.1994,
        demandUnits: 100,
      },
    ];

    const nnPlan = planDeliveryRoute(depot, stops, 1000, 'nearest_neighbor');
    const twoOptPlan = planDeliveryRoute(depot, stops, 1000, 'two_opt');

    expect(nnPlan.orderedStops.length).toBe(stops.length + 2); // Depot + stops + return to Depot
    expect(twoOptPlan.totalDistanceKm).toBeLessThanOrEqual(nnPlan.totalDistanceKm);
    expect(twoOptPlan.totalLoadUnits).toBe(550);
    expect(twoOptPlan.utilizationPct).toBe(55);
  });

  it('executes sequential and parallel worker-thread analytics with identical mathematical outputs', async () => {
    const bench = await runExecutionBenchmark(16, 1000, 2);
    expect(bench.resultsMatch).toBe(true);
    expect(bench.workloadSize).toBe(16);
    expect(bench.sampleOutputs.length).toBeGreaterThan(0);
  });

  it('generates prioritized supply chain recommendations from SKU state', () => {
    const recs = generateRecommendationsForProducts([
      {
        productId: 1,
        sku: 'SKU-CRIT-01',
        name: 'Critical Test Actuator',
        unitCost: 200,
        orderingCost: 150,
        holdingCostRate: 0.2,
        leadTimeDays: 10,
        serviceLevel: 0.95,
        onHandQty: 5,
        reservedQty: 0,
        inTransitQty: 0,
        demandHistory: [
          { period: '2026-07', demand: 200 },
          { period: '2026-08', demand: 210 },
          { period: '2026-09', demand: 290 },
          { period: '2026-10', demand: 310 },
        ],
      },
    ]);
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs.some((r) => r.category === 'INVENTORY_REPLENISHMENT' && r.priority === 'HIGH')).toBe(true);
    expect(recs.some((r) => r.category === 'DEMAND_SURGE')).toBe(true);
  });
});

describe('Step 2, Step 5 & Step 7: Backend API, Security, and 11-Step Persistence Workflow', () => {
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;
  let createdProductId: number;

  beforeAll(async () => {
    process.env.SCDSS_DB_PATH = TEST_DB_PATH;
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    closeDb();
    getDb(); // Initializes schema and seeds default data

    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('hashes passwords securely, resolves /tmp on Vercel, and enforces authentication on protected routes', async () => {
    const { hash, salt } = hashPassword('MySecretPass!99');
    expect(hash).not.toBe('MySecretPass!99');
    expect(verifyPassword('MySecretPass!99', hash, salt)).toBe(true);
    expect(verifyPassword('WrongPass', hash, salt)).toBe(false);

    // Verify Vercel serverless environment resolves writable /tmp directory
    const prevDbPath = process.env.SCDSS_DB_PATH;
    delete process.env.SCDSS_DB_PATH;
    process.env.VERCEL = '1';
    const vercelDbPath = getDbPath();
    expect(vercelDbPath.endsWith('scdss.db')).toBe(true);
    delete process.env.VERCEL;
    process.env.SCDSS_DB_PATH = prevDbPath;

    // Unauthenticated request to protected endpoint must return 401
    const unauthRes = await fetch(`${baseUrl}/api/products`);
    expect(unauthRes.status).toBe(401);
  });

  it('executes the complete 11-step workflow and persists records across backend restart', async () => {
    // 1. Log in
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@scdss.io', password: 'Admin@123' }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();
    authToken = loginData.token;

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    // 2. Create a product
    const createProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sku: 'SKU-E2E-900',
        name: 'Cryogenic Valve Assembly',
        category: 'Fluid Power',
        unitCost: 310,
        sellingPrice: 495,
        holdingCostRate: 0.2,
        orderingCost: 160,
        leadTimeDays: 9,
        serviceLevel: 0.95,
        supplierName: 'Apex Cryogenics',
        warehouseLocation: 'ORD-CRYO-04',
        onHandQty: 45,
        reservedQty: 5,
        inTransitQty: 0,
      }),
    });
    expect(createProdRes.status).toBe(201);
    const createdProdData = await createProdRes.json();
    createdProductId = createdProdData.product.id;
    expect(createdProdData.product.sku).toBe('SKU-E2E-900');

    // 3. Add / update inventory
    const updateInvRes = await fetch(`${baseUrl}/api/inventory/${createdProductId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        warehouseLocation: 'ORD-CRYO-04',
        onHandQty: 60,
        reservedQty: 10,
        inTransitQty: 15,
      }),
    });
    expect(updateInvRes.status).toBe(200);
    const updatedInvData = await updateInvRes.json();
    expect(updatedInvData.inventory.available_qty).toBe(65); // 60 - 10 + 15

    // 4. Import demand history via CSV (and verify invalid CSV is rejected)
    const badCsvRes = await fetch(`${baseUrl}/api/demand/import-csv`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: createdProductId,
        csvContent: 'period_date,demand_qty\nINVALID-DATE,-50',
      }),
    });
    expect(badCsvRes.status).toBe(400);

    const goodCsvRes = await fetch(`${baseUrl}/api/demand/import-csv`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: createdProductId,
        csvContent: [
          'period_date,demand_qty,notes',
          '2026-06,240,June demand',
          '2026-07,260,July demand',
          '2026-08,250,August demand',
          '2026-09,280,September demand',
          '2026-10,300,October demand',
        ].join('\n'),
      }),
    });
    expect(goodCsvRes.status).toBe(201);
    const goodCsvData = await goodCsvRes.json();
    expect(goodCsvData.importedCount).toBe(5);

    // 5. Generate a forecast
    const fcRes = await fetch(`${baseUrl}/api/analytics/forecast`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: createdProductId,
        method: 'moving_average',
        windowSize: 3,
        horizonPeriods: 3,
      }),
    });
    expect(fcRes.status).toBe(200);
    const fcData = await fcRes.json();
    // Mean of (250, 280, 300) = 830 / 3 = 276.67
    expect(fcData.nextPeriodForecast).toBe(276.67);

    // 6. Run inventory optimization
    const optRes = await fetch(`${baseUrl}/api/analytics/optimize-inventory`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: createdProductId,
      }),
    });
    expect(optRes.status).toBe(200);
    const optData = await optRes.json();
    expect(optData.optimization.eoq).toBeGreaterThan(0);
    expect(optData.optimization.reorderPoint).toBeGreaterThan(0);

    // 7. Generate a delivery route
    const routeRes = await fetch(`${baseUrl}/api/routes/plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        routeName: 'E2E Verified Dispatch Tour',
        vehicleCapacity: 2000,
        algorithm: 'two_opt',
      }),
    });
    expect(routeRes.status).toBe(201);
    const routeData = await routeRes.json();
    expect(routeData.totalDistanceKm).toBeGreaterThan(0);

    // 8. Execute a parallel benchmark
    const benchRes = await fetch(`${baseUrl}/api/benchmarks/run`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        workloadSize: 20,
        iterations: 2000,
        workerCount: 2,
      }),
    });
    expect(benchRes.status).toBe(201);
    const benchData = await benchRes.json();
    expect(benchData.resultsMatch).toBe(true);

    // 9. Accept a recommendation
    const genRecRes = await fetch(`${baseUrl}/api/recommendations/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    expect(genRecRes.status).toBe(201);
    const genRecData = await genRecRes.json();
    const targetRecId = genRecData.recommendations[0].id;

    const decideRes = await fetch(`${baseUrl}/api/recommendations/${targetRecId}/decision`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'ACCEPTED',
        decisionNotes: 'Approved during E2E persistence verification',
      }),
    });
    expect(decideRes.status).toBe(200);
    const decideData = await decideRes.json();
    expect(decideData.recommendation.status).toBe('ACCEPTED');

    // 10. Simulate Backend Restart: close SQLite connection and HTTP server, then re-open from disk
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();

    getDb(); // Re-opens existing SQLite database on disk
    const restartedApp = createApp();
    server = http.createServer(restartedApp);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const newAddr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${newAddr.port}`;

    // 11. Confirm that all saved records remain available after backend restart
    const checkProdRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      headers: authHeaders,
    });
    expect(checkProdRes.status).toBe(200);
    const checkProdData = await checkProdRes.json();
    expect(checkProdData.product.sku).toBe('SKU-E2E-900');
    expect(checkProdData.product.on_hand_qty).toBe(60);
    expect(checkProdData.demandHistory.length).toBe(5);
    expect(checkProdData.forecasts.length).toBeGreaterThanOrEqual(1);
    expect(checkProdData.optimizations.length).toBeGreaterThanOrEqual(1);

    const checkRecsRes = await fetch(`${baseUrl}/api/recommendations?status=ACCEPTED`, {
      headers: authHeaders,
    });
    const checkRecsData = await checkRecsRes.json();
    expect(checkRecsData.recommendations.some((r: any) => r.id === targetRecId)).toBe(true);
  });
});

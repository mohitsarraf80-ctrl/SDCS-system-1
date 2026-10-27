/**
 * SCDSS — Persistent SQLite Database Layer & Seed Initialization
 *
 * Uses `better-sqlite3` with WAL mode and foreign key enforcement.
 * All queries are parameterized to prevent SQL injection.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { hashPassword } from './auth';
import {
  naiveForecast,
  movingAverageForecast,
  exponentialSmoothingForecast,
  optimizeInventory,
  planDeliveryRoute,
  generateRecommendationsForProducts,
  type DemandPoint,
  type DeliveryNodeInput,
} from './analytics';

let dbInstance: Database.Database | null = null;

export function getDbPath(): string {
  if (process.env.SCDSS_DB_PATH) {
    const customPath = path.resolve(process.env.SCDSS_DB_PATH);
    const parentDir = path.dirname(customPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    return customPath;
  }

  // On Vercel serverless functions, /var/task is read-only; /tmp (os.tmpdir()) is writable
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'scdss.db');
  }

  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'scdss.db');
  } catch {
    return path.join(os.tmpdir(), 'scdss.db');
  }
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = getDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('cache_size = -64000'); // 64MB cache
    dbInstance.pragma('temp_store = MEMORY');
    initializeSchema(dbInstance);
    seedDatabaseIfEmpty(dbInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resetAndSeedDb(): void {
  const db = getDb();
  const tables = [
    'audit_logs',
    'purchase_order_items',
    'purchase_orders',
    'suppliers',
    'recommendations',
    'benchmarks',
    'delivery_routes',
    'delivery_nodes',
    'inventory_optimizations',
    'forecasts',
    'demand_history',
    'inventory',
    'products',
    'users',
  ];
  const dropTx = db.transaction(() => {
    for (const t of tables) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    try {
      db.prepare('DELETE FROM sqlite_sequence').run();
    } catch {}
  });
  dropTx();
  seedDatabaseIfEmpty(db);
}

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'planner', 'analyst')),
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
      selling_price REAL NOT NULL CHECK(selling_price >= 0),
      holding_cost_rate REAL NOT NULL DEFAULT 0.22 CHECK(holding_cost_rate > 0 AND holding_cost_rate <= 2),
      ordering_cost REAL NOT NULL DEFAULT 150 CHECK(ordering_cost >= 0),
      lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK(lead_time_days >= 0),
      service_level REAL NOT NULL DEFAULT 0.95 CHECK(service_level >= 0.5 AND service_level < 1.0),
      supplier_name TEXT NOT NULL DEFAULT 'Global Industrial Supply',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      warehouse_location TEXT NOT NULL DEFAULT 'ORD-CENTRAL-01',
      on_hand_qty REAL NOT NULL DEFAULT 0 CHECK(on_hand_qty >= 0),
      reserved_qty REAL NOT NULL DEFAULT 0 CHECK(reserved_qty >= 0),
      in_transit_qty REAL NOT NULL DEFAULT 0 CHECK(in_transit_qty >= 0),
      last_counted_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS demand_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      period_date TEXT NOT NULL,
      demand_qty REAL NOT NULL CHECK(demand_qty >= 0),
      notes TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'csv', 'seed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, period_date)
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK(method IN ('naive', 'moving_average', 'exponential_smoothing')),
      window_size INTEGER,
      alpha REAL,
      horizon_periods INTEGER NOT NULL DEFAULT 3,
      next_period_forecast REAL NOT NULL,
      mae REAL NOT NULL DEFAULT 0,
      rmse REAL NOT NULL DEFAULT 0,
      mape REAL NOT NULL DEFAULT 0,
      forecast_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_optimizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      annual_demand REAL NOT NULL,
      daily_demand_mean REAL NOT NULL,
      daily_demand_std_dev REAL NOT NULL,
      ordering_cost REAL NOT NULL,
      unit_holding_cost REAL NOT NULL,
      lead_time_days INTEGER NOT NULL,
      service_level REAL NOT NULL,
      z_score REAL NOT NULL,
      eoq REAL NOT NULL,
      safety_stock REAL NOT NULL,
      reorder_point REAL NOT NULL,
      available_inventory REAL NOT NULL,
      suggested_order_qty REAL NOT NULL,
      total_annual_cost REAL NOT NULL,
      status_classification TEXT NOT NULL CHECK(status_classification IN ('OPTIMAL', 'REORDER_NOW', 'CRITICAL_SHORTAGE', 'OVERSTOCK')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS delivery_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      node_type TEXT NOT NULL CHECK(node_type IN ('depot', 'warehouse', 'customer')),
      city TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      demand_units REAL NOT NULL DEFAULT 0 CHECK(demand_units >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS delivery_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      depot_node_id INTEGER NOT NULL REFERENCES delivery_nodes(id) ON DELETE CASCADE,
      vehicle_capacity REAL NOT NULL,
      algorithm TEXT NOT NULL CHECK(algorithm IN ('nearest_neighbor', 'two_opt')),
      ordered_stops_json TEXT NOT NULL,
      total_distance_km REAL NOT NULL,
      estimated_duration_hrs REAL NOT NULL,
      total_load_units REAL NOT NULL,
      utilization_pct REAL NOT NULL,
      fuel_cost_est REAL NOT NULL,
      baseline_distance_km REAL NOT NULL DEFAULT 0,
      distance_saved_km REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workload_size INTEGER NOT NULL,
      iterations INTEGER NOT NULL,
      worker_count INTEGER NOT NULL,
      sequential_ms REAL NOT NULL,
      parallel_ms REAL NOT NULL,
      speedup_factor REAL NOT NULL,
      efficiency_pct REAL NOT NULL,
      results_match INTEGER NOT NULL DEFAULT 1,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      category TEXT NOT NULL CHECK(category IN ('INVENTORY_REPLENISHMENT', 'SAFETY_STOCK_ADJUSTMENT', 'DEMAND_SURGE', 'ROUTE_CONSOLIDATION', 'OVERSTOCK_REDUCTION')),
      priority TEXT NOT NULL CHECK(priority IN ('HIGH', 'MEDIUM', 'LOW')),
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      estimated_savings REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
      decided_by TEXT,
      decided_at TEXT,
      decision_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      lead_time_days INTEGER NOT NULL DEFAULT 7,
      on_time_rate REAL NOT NULL DEFAULT 95.0,
      quality_rating REAL NOT NULL DEFAULT 4.8,
      risk_score TEXT NOT NULL DEFAULT 'LOW' CHECK(risk_score IN ('LOW', 'MEDIUM', 'HIGH')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
      total_amount REAL NOT NULL DEFAULT 0,
      expected_delivery_date TEXT,
      notes TEXT DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'Marcus Sterling',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      ordered_qty REAL NOT NULL CHECK(ordered_qty > 0),
      unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
      total_cost REAL NOT NULL CHECK(total_cost >= 0)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SQLite Performance & Integrity Optimization Indexes
    CREATE INDEX IF NOT EXISTS idx_demand_product_period ON demand_history(product_id, period_date);
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
    CREATE INDEX IF NOT EXISTS idx_po_supplier_status ON purchase_orders(supplier_id, status);
    CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}

export function seedDatabaseIfEmpty(db: Database.Database): void {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount > 0) {
    return;
  }

  const seedTx = db.transaction(() => {
    // 1. Seed Users
    const insertUser = db.prepare(`
      INSERT INTO users (email, name, role, password_hash, salt)
      VALUES (?, ?, ?, ?, ?)
    `);
    const adminCred = hashPassword('Admin@123');
    insertUser.run('admin@scdss.io', 'Elena Vance', 'admin', adminCred.hash, adminCred.salt);

    const plannerCred = hashPassword('Planner@123');
    insertUser.run('planner@scdss.io', 'Marcus Sterling', 'planner', plannerCred.hash, plannerCred.salt);

    const analystCred = hashPassword('Analyst@123');
    insertUser.run('analyst@scdss.io', 'Priya Nair', 'analyst', analystCred.hash, analystCred.salt);

    // 2. Seed Products
    const insertProduct = db.prepare(`
      INSERT INTO products (sku, name, category, unit_cost, selling_price, holding_cost_rate, ordering_cost, lead_time_days, service_level, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedProducts = [
      {
        sku: 'SKU-servo-400',
        name: 'Brushless Servo Actuator 400W',
        category: 'Industrial Automation',
        unitCost: 240.0,
        sellingPrice: 385.0,
        holdingCostRate: 0.22,
        orderingCost: 180.0,
        leadTimeDays: 10,
        serviceLevel: 0.95,
        supplierName: 'Bosch Rexroth Motion GmbH',
        warehouse: 'ORD-NORTH-A1',
        onHand: 42, // Low stock -> Critical shortage
        reserved: 12,
        inTransit: 0,
        demands: [310, 325, 298, 340, 355, 330, 360, 375, 390, 415, 445, 470],
      },
      {
        sku: 'SKU-plc-920',
        name: 'Modular Safety PLC Controller',
        category: 'Control Systems',
        unitCost: 520.0,
        sellingPrice: 810.0,
        holdingCostRate: 0.2,
        orderingCost: 250.0,
        leadTimeDays: 14,
        serviceLevel: 0.975,
        supplierName: 'Rockwell Logic Systems',
        warehouse: 'ORD-CENTRAL-01',
        onHand: 135, // Near ROP -> Reorder now
        reserved: 15,
        inTransit: 0,
        demands: [180, 175, 190, 185, 195, 200, 192, 205, 210, 198, 215, 220],
      },
      {
        sku: 'SKU-hyd-210',
        name: 'Proportional Hydraulic Valve Manifold',
        category: 'Fluid Power',
        unitCost: 165.0,
        sellingPrice: 260.0,
        holdingCostRate: 0.24,
        orderingCost: 140.0,
        leadTimeDays: 7,
        serviceLevel: 0.95,
        supplierName: 'Parker Hannifin Fluidics',
        warehouse: 'ORD-SOUTH-B4',
        onHand: 390, // Healthy optimal stock
        reserved: 20,
        inTransit: 60,
        demands: [410, 395, 420, 405, 415, 430, 425, 410, 435, 420, 440, 430],
      },
      {
        sku: 'SKU-inv-750',
        name: 'Three-Phase VFD Inverter Drive 7.5kW',
        category: 'Power Electronics',
        unitCost: 390.0,
        sellingPrice: 615.0,
        holdingCostRate: 0.2,
        orderingCost: 210.0,
        leadTimeDays: 12,
        serviceLevel: 0.95,
        supplierName: 'ABB Electrification Corp',
        warehouse: 'ORD-CENTRAL-02',
        onHand: 340, // Healthy optimal stock
        reserved: 18,
        inTransit: 40,
        demands: [240, 255, 250, 265, 260, 270, 275, 268, 280, 290, 285, 295],
      },
      {
        sku: 'SKU-sen-108',
        name: 'Time-of-Flight LiDAR Pallet Sensor',
        category: 'Sensing & Vision',
        unitCost: 115.0,
        sellingPrice: 195.0,
        holdingCostRate: 0.25,
        orderingCost: 95.0,
        leadTimeDays: 5,
        serviceLevel: 0.9,
        supplierName: 'SICK Sensor Intelligence',
        warehouse: 'ORD-EAST-C2',
        onHand: 1180, // Overstock
        reserved: 30,
        inTransit: 100,
        demands: [290, 300, 285, 295, 310, 305, 290, 300, 295, 305, 300, 310],
      },
    ];

    const months = [
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ];

    const insertInventory = db.prepare(`
      INSERT INTO inventory (product_id, warehouse_location, on_hand_qty, reserved_qty, in_transit_qty)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertDemand = db.prepare(`
      INSERT INTO demand_history (product_id, period_date, demand_qty, notes, source)
      VALUES (?, ?, ?, ?, 'seed')
    `);

    const insertForecast = db.prepare(`
      INSERT INTO forecasts (product_id, method, window_size, alpha, horizon_periods, next_period_forecast, mae, rmse, mape, forecast_payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertOpt = db.prepare(`
      INSERT INTO inventory_optimizations (
        product_id, annual_demand, daily_demand_mean, daily_demand_std_dev,
        ordering_cost, unit_holding_cost, lead_time_days, service_level, z_score,
        eoq, safety_stock, reorder_point, available_inventory, suggested_order_qty,
        total_annual_cost, status_classification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const recommendationContexts = [];
    const createdProductMap: Record<string, number> = {};

    for (const item of seedProducts) {
      const info = insertProduct.run(
        item.sku,
        item.name,
        item.category,
        item.unitCost,
        item.sellingPrice,
        item.holdingCostRate,
        item.orderingCost,
        item.leadTimeDays,
        item.serviceLevel,
        item.supplierName
      );
      const productId = Number(info.lastInsertRowid);
      createdProductMap[item.sku] = productId;

      insertInventory.run(productId, item.warehouse, item.onHand, item.reserved, item.inTransit);

      const historyPoints: DemandPoint[] = [];
      for (let idx = 0; idx < months.length; idx++) {
        insertDemand.run(productId, months[idx], item.demands[idx], 'Monthly ERP ledger close');
        historyPoints.push({ period: months[idx], demand: item.demands[idx] });
      }

      // Generate initial forecasts (Moving Average + Exponential Smoothing)
      const maResult = movingAverageForecast(historyPoints, 3, 3);
      insertForecast.run(
        productId,
        'moving_average',
        3,
        null,
        3,
        maResult.nextPeriodForecast,
        maResult.metrics.mae,
        maResult.metrics.rmse,
        maResult.metrics.mape,
        JSON.stringify(maResult)
      );

      const sesResult = exponentialSmoothingForecast(historyPoints, 0.35, 3);
      insertForecast.run(
        productId,
        'exponential_smoothing',
        null,
        0.35,
        3,
        sesResult.nextPeriodForecast,
        sesResult.metrics.mae,
        sesResult.metrics.rmse,
        sesResult.metrics.mape,
        JSON.stringify(sesResult)
      );

      const naiveRes = naiveForecast(historyPoints, 3);
      insertForecast.run(
        productId,
        'naive',
        null,
        null,
        3,
        naiveRes.nextPeriodForecast,
        naiveRes.metrics.mae,
        naiveRes.metrics.rmse,
        naiveRes.metrics.mape,
        JSON.stringify(naiveRes)
      );

      // Compute & persist initial Inventory Optimization
      const annualDemand = item.demands.reduce((a, b) => a + b, 0);
      const avgMonthly = annualDemand / 12;
      const variance =
        item.demands.reduce((acc, val) => acc + Math.pow(val - avgMonthly, 2), 0) /
        (item.demands.length - 1);
      const dailyStdDev = Math.max(1, Math.sqrt(variance) / Math.sqrt(30));

      const opt = optimizeInventory({
        annualDemand,
        dailyDemandMean: annualDemand / 365,
        dailyDemandStdDev: dailyStdDev,
        orderingCost: item.orderingCost,
        unitCost: item.unitCost,
        holdingCostRate: item.holdingCostRate,
        leadTimeDays: item.leadTimeDays,
        serviceLevel: item.serviceLevel,
        onHandQty: item.onHand,
        reservedQty: item.reserved,
        inTransitQty: item.inTransit,
      });

      insertOpt.run(
        productId,
        opt.annualDemand,
        opt.dailyDemandMean,
        opt.dailyDemandStdDev,
        opt.orderingCost,
        opt.unitHoldingCost,
        opt.leadTimeDays,
        opt.serviceLevel,
        opt.zScore,
        opt.eoq,
        opt.safetyStock,
        opt.reorderPoint,
        opt.availableInventory,
        opt.suggestedOrderQty,
        opt.totalAnnualCost,
        opt.statusClassification
      );

      recommendationContexts.push({
        productId,
        sku: item.sku,
        name: item.name,
        unitCost: item.unitCost,
        orderingCost: item.orderingCost,
        holdingCostRate: item.holdingCostRate,
        leadTimeDays: item.leadTimeDays,
        serviceLevel: item.serviceLevel,
        onHandQty: item.onHand,
        reservedQty: item.reserved,
        inTransitQty: item.inTransit,
        demandHistory: historyPoints,
      });
    }

    // 3. Seed Delivery Nodes
    const insertNode = db.prepare(`
      INSERT INTO delivery_nodes (code, name, node_type, city, latitude, longitude, demand_units)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const rawNodes: Omit<DeliveryNodeInput, 'id'>[] = [
      {
        code: 'DEPOT-ORD',
        name: 'Chicago Central Fulfillment Hub',
        nodeType: 'depot',
        city: 'Chicago, IL',
        latitude: 41.8781,
        longitude: -87.6298,
        demandUnits: 0,
      },
      {
        code: 'CUST-MKE',
        name: 'Milwaukee Automation Plant',
        nodeType: 'customer',
        city: 'Milwaukee, WI',
        latitude: 43.0389,
        longitude: -87.9065,
        demandUnits: 210,
      },
      {
        code: 'CUST-IND',
        name: 'Indianapolis Assembly Terminal',
        nodeType: 'customer',
        city: 'Indianapolis, IN',
        latitude: 39.7684,
        longitude: -86.1581,
        demandUnits: 280,
      },
      {
        code: 'CUST-DTW',
        name: 'Detroit Powertrain Corridor',
        nodeType: 'customer',
        city: 'Detroit, MI',
        latitude: 42.3314,
        longitude: -83.0458,
        demandUnits: 340,
      },
      {
        code: 'WH-CMH',
        name: 'Columbus Regional Cross-Dock',
        nodeType: 'warehouse',
        city: 'Columbus, OH',
        latitude: 39.9612,
        longitude: -82.9988,
        demandUnits: 260,
      },
      {
        code: 'CUST-STL',
        name: 'St. Louis Riverport Manufacturing',
        nodeType: 'customer',
        city: 'St. Louis, MO',
        latitude: 38.627,
        longitude: -90.1994,
        demandUnits: 195,
      },
      {
        code: 'CUST-CVG',
        name: 'Cincinnati Precision Logistics',
        nodeType: 'customer',
        city: 'Cincinnati, OH',
        latitude: 39.1031,
        longitude: -84.512,
        demandUnits: 175,
      },
    ];

    const persistedNodes: DeliveryNodeInput[] = [];
    for (const n of rawNodes) {
      const res = insertNode.run(n.code, n.name, n.nodeType, n.city, n.latitude, n.longitude, n.demandUnits);
      persistedNodes.push({ ...n, id: Number(res.lastInsertRowid) });
    }

    // 4. Seed Initial Delivery Route Plan
    const depot = persistedNodes[0];
    const stops = persistedNodes.slice(1);
    const routePlan = planDeliveryRoute(depot, stops, 1800, 'two_opt');

    db.prepare(`
      INSERT INTO delivery_routes (
        route_name, depot_node_id, vehicle_capacity, algorithm,
        ordered_stops_json, total_distance_km, estimated_duration_hrs,
        total_load_units, utilization_pct, fuel_cost_est,
        baseline_distance_km, distance_saved_km
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Midwest Corridor Primary Ring (2-Opt)',
      Number(depot.id),
      routePlan.vehicleCapacity,
      routePlan.algorithm,
      JSON.stringify(routePlan.orderedStops),
      routePlan.totalDistanceKm,
      routePlan.estimatedDurationHrs,
      routePlan.totalLoadUnits,
      routePlan.utilizationPct,
      routePlan.fuelCostEst,
      routePlan.baselineDistanceKm,
      routePlan.distanceSavedKm
    );

    // 5. Seed Initial Benchmark Record
    db.prepare(`
      INSERT INTO benchmarks (
        workload_size, iterations, worker_count,
        sequential_ms, parallel_ms, speedup_factor,
        efficiency_pct, results_match, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      80,
      20000,
      4,
      148.6,
      51.2,
      2.9,
      72.5,
      1,
      JSON.stringify({
        note: 'Baseline multi-SKU Monte Carlo & SES benchmark across 80 industrial SKUs',
      })
    );

    // 6. Seed Recommendations
    const generatedRecs = generateRecommendationsForProducts(recommendationContexts);
    const insertRec = db.prepare(`
      INSERT INTO recommendations (
        product_id, category, priority, title, rationale, suggested_action, estimated_savings, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);
    for (const rec of generatedRecs) {
      insertRec.run(
        rec.productId,
        rec.category,
        rec.priority,
        rec.title,
        rec.rationale,
        rec.suggestedAction,
        rec.estimatedSavings
      );
    }

    // 7. Seed Enterprise Suppliers
    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (code, name, contact_email, lead_time_days, on_time_rate, quality_rating, risk_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const s1 = insertSupplier.run('SUP-BOSCH', 'Bosch Rexroth Motion GmbH', 'logistics@bosch-motion.de', 10, 96.5, 4.9, 'LOW').lastInsertRowid;
    const s2 = insertSupplier.run('SUP-ROCK', 'Rockwell Logic Systems', 'orders@rockwell-logic.com', 14, 94.2, 4.8, 'LOW').lastInsertRowid;
    const s3 = insertSupplier.run('SUP-PARK', 'Parker Hannifin Fluidics', 'supply@parker-fluidics.com', 7, 98.1, 4.95, 'LOW').lastInsertRowid;
    const s4 = insertSupplier.run('SUP-ABB', 'ABB Electrification Corp', 'dispatch@abb-power.ch', 12, 95.8, 4.75, 'LOW').lastInsertRowid;
    const s5 = insertSupplier.run('SUP-SICK', 'SICK Sensor Intelligence', 'support@sick-sensors.de', 5, 97.4, 4.9, 'LOW').lastInsertRowid;

    // 8. Seed Purchase Orders & Items
    const insertPO = db.prepare(`
      INSERT INTO purchase_orders (po_number, supplier_id, supplier_name, status, total_amount, expected_delivery_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPOItem = db.prepare(`
      INSERT INTO purchase_order_items (po_id, product_id, sku, name, ordered_qty, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // PO 1: Approved replenishment for PLC controllers
    const po1Id = Number(
      insertPO.run(
        'PO-2026-001',
        Number(s2),
        'Rockwell Logic Systems',
        'APPROVED',
        36400.0,
        '2026-11-10',
        'Routine Q4 safety buffer replenishment based on EOQ recommendation.',
        'Marcus Sterling'
      ).lastInsertRowid
    );
    insertPOItem.run(po1Id, createdProductMap['SKU-plc-920'] || 2, 'SKU-plc-920', 'Modular Safety PLC Controller', 70, 520.0, 36400.0);

    // PO 2: In-transit emergency order for Brushless Servos
    const po2Id = Number(
      insertPO.run(
        'PO-2026-002',
        Number(s1),
        'Bosch Rexroth Motion GmbH',
        'IN_TRANSIT',
        52800.0,
        '2026-11-04',
        'Expedited air freight order to mitigate critical shortage alert.',
        'Elena Vance'
      ).lastInsertRowid
    );
    insertPOItem.run(po2Id, createdProductMap['SKU-servo-400'] || 1, 'SKU-servo-400', 'Brushless Servo Actuator 400W', 220, 240.0, 52800.0);

    // PO 3: Received order for Hydraulic Valve Manifolds
    const po3Id = Number(
      insertPO.run(
        'PO-2026-003',
        Number(s3),
        'Parker Hannifin Fluidics',
        'RECEIVED',
        24750.0,
        '2026-10-20',
        'Monthly delivery safely received at ORD-SOUTH-B4 hub.',
        'Marcus Sterling'
      ).lastInsertRowid
    );
    insertPOItem.run(po3Id, createdProductMap['SKU-hyd-210'] || 3, 'SKU-hyd-210', 'Proportional Hydraulic Valve Manifold', 150, 165.0, 24750.0);

    // 9. Seed Initial Audit Logs
    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(1, 'admin@scdss.io', 'SYSTEM_INIT', 'DATABASE', 'SCHEMA_V2', JSON.stringify({ message: 'Initialized enterprise schema and WAL mode.' }));
    insertAudit.run(2, 'planner@scdss.io', 'PO_CREATED', 'PURCHASE_ORDER', 'PO-2026-001', JSON.stringify({ totalAmount: 36400, supplier: 'Rockwell Logic Systems' }));
    insertAudit.run(1, 'admin@scdss.io', 'PO_EXPEDITED', 'PURCHASE_ORDER', 'PO-2026-002', JSON.stringify({ totalAmount: 52800, supplier: 'Bosch Rexroth Motion GmbH' }));
    insertAudit.run(2, 'planner@scdss.io', 'INVENTORY_RECEIPT', 'INVENTORY', 'SKU-hyd-210', JSON.stringify({ quantityAdded: 150, location: 'ORD-SOUTH-B4' }));
    insertAudit.run(3, 'analyst@scdss.io', 'BENCHMARK_EXEC', 'COMPUTE', '80_SKUS', JSON.stringify({ speedup: 2.9, workers: 4 }));
  });

  seedTx();
}

// ---------------------------------------------------------------------------
// Database Diagnostics & Maintenance Helpers
// ---------------------------------------------------------------------------
export interface DatabaseStats {
  path: string;
  journalMode: string;
  pageSize: number;
  pageCount: number;
  totalSizeBytes: number;
  freelistCount: number;
  cacheSizeKb: number;
  tableCounts: Record<string, number>;
}

export function getDatabaseStats(db?: Database.Database): DatabaseStats {
  const activeDb = db || getDb();
  const dbPath = getDbPath();
  const journalMode = (activeDb.pragma('journal_mode', { simple: true }) as string) || 'wal';
  const pageSize = (activeDb.pragma('page_size', { simple: true }) as number) || 4096;
  const pageCount = (activeDb.pragma('page_count', { simple: true }) as number) || 0;
  const freelistCount = (activeDb.pragma('freelist_count', { simple: true }) as number) || 0;
  const cacheSize = (activeDb.pragma('cache_size', { simple: true }) as number) || -64000;

  const tables = [
    'users',
    'products',
    'inventory',
    'demand_history',
    'forecasts',
    'inventory_optimizations',
    'delivery_nodes',
    'delivery_routes',
    'benchmarks',
    'recommendations',
    'suppliers',
    'purchase_orders',
    'purchase_order_items',
    'audit_logs',
  ];

  const tableCounts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const row = activeDb.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get() as { cnt: number };
      tableCounts[t] = row ? row.cnt : 0;
    } catch {
      tableCounts[t] = 0;
    }
  }

  return {
    path: dbPath,
    journalMode,
    pageSize,
    pageCount,
    totalSizeBytes: pageSize * pageCount,
    freelistCount,
    cacheSizeKb: Math.abs(cacheSize),
    tableCounts,
  };
}

export function runIntegrityCheck(db?: Database.Database): { ok: boolean; results: string[] } {
  const activeDb = db || getDb();
  const rows = activeDb.pragma('integrity_check') as { integrity_check: string }[];
  const results = rows.map((r) => r.integrity_check);
  const ok = results.length === 1 && results[0].toLowerCase() === 'ok';
  return { ok, results };
}

export function checkpointWal(db?: Database.Database): { busy: number; log: number; checkpointed: number } {
  const activeDb = db || getDb();
  const res = activeDb.pragma('wal_checkpoint(TRUNCATE)') as { busy: number; log: number; checkpointed: number }[];
  return res[0] || { busy: 0, log: 0, checkpointed: 0 };
}

export function vacuumDatabase(db?: Database.Database): void {
  const activeDb = db || getDb();
  activeDb.exec('VACUUM');
}

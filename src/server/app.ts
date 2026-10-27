/**
 * SCDSS — Express Backend Application & REST API Routes
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import {
  getDb,
  resetAndSeedDb,
  getDatabaseStats,
  runIntegrityCheck,
  checkpointWal,
  vacuumDatabase,
} from './db';
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  type AuthenticatedRequest,
} from './auth';
import {
  AnalyticsValidationError,
  naiveForecast,
  movingAverageForecast,
  exponentialSmoothingForecast,
  optimizeInventory,
  planDeliveryRoute,
  runExecutionBenchmark,
  generateRecommendationsForProducts,
  holtLinearTrendForecast,
  calculateSafetyStockSensitivity,
  runMonteCarloStockoutSimulation,
  calculateGreenLogistics,
  simulateScenario,
  type DemandPoint,
  type DeliveryNodeInput,
} from './analytics';

export function createApp() {
  // Ensure database is initialized and seeded on cold start (including Vercel serverless)
  getDb();

  const app = express();

  // Security headers & restricted CORS configuration (supports AI Studio, localhost, and Vercel)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      process.env.APP_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
    ].filter(Boolean) as string[];

    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.vercel.app')
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Response time and telemetry header
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      try {
        res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      } catch {}
    });
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  function logAudit(
    user: any,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, any>
  ) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user?.userId || user?.id || null,
        user?.email || 'system@scdss.io',
        action,
        entityType,
        String(entityId),
        JSON.stringify(details)
      );
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // 1. Health & OpenAPI Documentation Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/health', (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const productCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number }).cnt;
      const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
      let supplierCount = 0;
      let poCount = 0;
      let auditCount = 0;
      try {
        supplierCount = (db.prepare('SELECT COUNT(*) as cnt FROM suppliers').get() as { cnt: number })?.cnt || 0;
        poCount = (db.prepare('SELECT COUNT(*) as cnt FROM purchase_orders').get() as { cnt: number })?.cnt || 0;
        auditCount = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get() as { cnt: number })?.cnt || 0;
      } catch {}

      res.json({
        status: 'ok',
        service: 'SCDSS Backend API',
        database: 'connected (SQLite WAL)',
        counts: {
          products: productCount,
          users: userCount,
          suppliers: supplierCount,
          purchaseOrders: poCount,
          auditLogs: auditCount,
        },
        system: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: 'Database connectivity check failed.' });
    }
  });

  app.get('/api/docs', (_req: Request, res: Response) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'Supply Chain Decision Support System (SCDSS) API',
        version: '1.0.0',
        description:
          'REST API for supply chain inventory management, demand forecasting, EOQ optimization, delivery route planning, parallel benchmarking, and automated decision recommendations.',
      },
      endpoints: [
        { method: 'GET', path: '/api/health', auth: false, description: 'Health and DB connectivity check' },
        { method: 'POST', path: '/api/auth/login', auth: false, description: 'Authenticate user and issue JWT token' },
        { method: 'POST', path: '/api/auth/register', auth: false, description: 'Register new user account' },
        { method: 'GET', path: '/api/auth/me', auth: true, description: 'Retrieve active authenticated user profile' },
        { method: 'GET', path: '/api/dashboard/summary', auth: true, description: 'Aggregate supply chain KPIs and alerts' },
        { method: 'GET', path: '/api/products', auth: true, description: 'List products with inventory and optimization status' },
        { method: 'POST', path: '/api/products', auth: true, description: 'Create new product and initial inventory record' },
        { method: 'PUT', path: '/api/products/:id', auth: true, description: 'Update product parameters' },
        { method: 'DELETE', path: '/api/products/:id', auth: true, description: 'Delete product and cascade records' },
        { method: 'GET', path: '/api/inventory', auth: true, description: 'List warehouse inventory positions' },
        { method: 'PUT', path: '/api/inventory/:productId', auth: true, description: 'Update inventory quantities and recalculate ROP/EOQ' },
        { method: 'GET', path: '/api/demand/:productId', auth: true, description: 'Get historical demand time series for a product' },
        { method: 'POST', path: '/api/demand', auth: true, description: 'Add or update a single period demand record' },
        { method: 'POST', path: '/api/demand/import-csv', auth: true, description: 'Validate and bulk import demand records from CSV' },
        { method: 'DELETE', path: '/api/demand/:id', auth: true, description: 'Delete a demand history record' },
        { method: 'POST', path: '/api/analytics/forecast', auth: true, description: 'Generate Naive, Moving Average, or Exponential Smoothing forecast' },
        { method: 'POST', path: '/api/analytics/optimize-inventory', auth: true, description: 'Calculate EOQ, Safety Stock, ROP, and Suggested Order Quantity' },
        { method: 'GET', path: '/api/routes/nodes', auth: true, description: 'List delivery network nodes' },
        { method: 'POST', path: '/api/routes/nodes', auth: true, description: 'Create delivery network node' },
        { method: 'POST', path: '/api/routes/plan', auth: true, description: 'Optimize multi-stop delivery tour using Nearest Neighbor or 2-Opt' },
        { method: 'POST', path: '/api/benchmarks/run', auth: true, description: 'Execute sequential vs parallel multi-worker analytics benchmark' },
        { method: 'GET', path: '/api/recommendations', auth: true, description: 'List supply chain recommendations' },
        { method: 'POST', path: '/api/recommendations/generate', auth: true, description: 'Synthesize recommendations from current inventory and demand trends' },
        { method: 'PATCH', path: '/api/recommendations/:id/decision', auth: true, description: 'Accept or reject a recommendation and persist audit trail' },
      ],
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication Endpoints
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.', code: 'VALIDATION_ERROR' });
      return;
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, email, name, role, password_hash, salt FROM users WHERE lower(email) = lower(?)')
      .get(email.trim()) as
      | {
          id: number;
          email: string;
          name: string;
          role: 'admin' | 'planner' | 'analyst';
          password_hash: string;
          salt: string;
        }
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
      res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email, password, name, role = 'planner' } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Full name is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    const validRole = ['admin', 'planner', 'analyst'].includes(role) ? role : 'planner';

    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
      .get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.', code: 'DUPLICATE_EMAIL' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const info = db
      .prepare('INSERT INTO users (email, name, role, password_hash, salt) VALUES (?, ?, ?, ?, ?)')
      .run(email.trim().toLowerCase(), name.trim(), validRole, hash, salt);

    const userId = Number(info.lastInsertRowid);
    const token = signToken({
      userId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: validRole,
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: validRole,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // ---------------------------------------------------------------------------
  // 3. Dashboard Overview & KPI Aggregation
  // ---------------------------------------------------------------------------
  app.get('/api/dashboard/summary', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();

    const products = db
      .prepare(
        `
      SELECT
        p.*,
        i.warehouse_location,
        i.on_hand_qty,
        i.reserved_qty,
        i.in_transit_qty,
        (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) AS available_qty
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      ORDER BY p.id ASC
    `
      )
      .all() as any[];

    let totalInventoryValue = 0;
    let totalUnitsOnHand = 0;
    for (const p of products) {
      totalInventoryValue += (p.on_hand_qty || 0) * p.unit_cost;
      totalUnitsOnHand += p.on_hand_qty || 0;
    }

    const latestOptimizations = db
      .prepare(
        `
      SELECT io.*, p.sku, p.name as product_name
      FROM inventory_optimizations io
      INNER JOIN (
        SELECT product_id, MAX(id) as max_id
        FROM inventory_optimizations
        GROUP BY product_id
      ) latest ON io.id = latest.max_id
      INNER JOIN products p ON p.id = io.product_id
      ORDER BY io.product_id ASC
    `
      )
      .all() as any[];

    const reorderAlertsCount = latestOptimizations.filter(
      (o) => o.status_classification === 'CRITICAL_SHORTAGE' || o.status_classification === 'REORDER_NOW'
    ).length;

    const pendingRecommendations = db
      .prepare(
        `
      SELECT r.*, p.sku, p.name as product_name
      FROM recommendations r
      LEFT JOIN products p ON p.id = r.product_id
      WHERE r.status = 'PENDING'
      ORDER BY CASE r.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, r.id DESC
    `
      )
      .all() as any[];

    const potentialSavings = pendingRecommendations.reduce(
      (acc, r) => acc + (Number(r.estimated_savings) || 0),
      0
    );

    const latestRoute = db
      .prepare('SELECT * FROM delivery_routes ORDER BY id DESC LIMIT 1')
      .get() as any;

    const latestBenchmark = db
      .prepare('SELECT * FROM benchmarks ORDER BY id DESC LIMIT 1')
      .get() as any;

    // Aggregate monthly demand across all products for executive chart
    const monthlyAggregateDemand = db
      .prepare(
        `
      SELECT period_date as period, ROUND(SUM(demand_qty), 1) as total_demand, COUNT(DISTINCT product_id) as sku_count
      FROM demand_history
      GROUP BY period_date
      ORDER BY period_date ASC
      LIMIT 18
    `
      )
      .all();

    let supplierCount = 0;
    let activePOCount = 0;
    let totalPOValue = 0;
    let recentAuditLogs: any[] = [];
    try {
      supplierCount = (db.prepare('SELECT COUNT(*) as cnt FROM suppliers WHERE active = 1').get() as any)?.cnt || 0;
      const poStats = db.prepare(`
        SELECT COUNT(*) as active_cnt, COALESCE(SUM(total_amount), 0) as total_val
        FROM purchase_orders
        WHERE status IN ('APPROVED', 'IN_TRANSIT')
      `).get() as any;
      activePOCount = poStats?.active_cnt || 0;
      totalPOValue = Math.round((poStats?.total_val || 0) * 100) / 100;
      recentAuditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5').all();
    } catch {}

    const greenLogistics = latestRoute
      ? calculateGreenLogistics(
          latestRoute.total_distance_km,
          latestRoute.baseline_distance_km || latestRoute.total_distance_km * 1.3,
          latestRoute.total_load_units,
          latestRoute.vehicle_capacity
        )
      : null;

    res.json({
      kpis: {
        totalProducts: products.length,
        totalUnitsOnHand: Math.round(totalUnitsOnHand),
        totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
        reorderAlertsCount,
        pendingRecommendationsCount: pendingRecommendations.length,
        potentialSavings: Math.round(potentialSavings * 100) / 100,
        latestRouteDistanceKm: latestRoute ? latestRoute.total_distance_km : 0,
        latestBenchmarkSpeedup: latestBenchmark ? latestBenchmark.speedup_factor : 1,
        supplierCount,
        activePOCount,
        totalPOValue,
        carbonReductionPct: greenLogistics ? greenLogistics.carbonReductionPct : 18.5,
      },
      optimizations: latestOptimizations,
      pendingRecommendations: pendingRecommendations.slice(0, 6),
      monthlyAggregateDemand,
      latestRoute: latestRoute
        ? {
            ...latestRoute,
            orderedStops: JSON.parse(latestRoute.ordered_stops_json || '[]'),
          }
        : null,
      latestBenchmark,
      greenLogistics,
      recentAuditLogs,
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Products CRUD Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/products', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    let sql = `
      SELECT
        p.*,
        COALESCE(i.warehouse_location, 'ORD-CENTRAL-01') as warehouse_location,
        COALESCE(i.on_hand_qty, 0) as on_hand_qty,
        COALESCE(i.reserved_qty, 0) as reserved_qty,
        COALESCE(i.in_transit_qty, 0) as in_transit_qty,
        (COALESCE(i.on_hand_qty, 0) - COALESCE(i.reserved_qty, 0) + COALESCE(i.in_transit_qty, 0)) as available_qty,
        (SELECT COUNT(*) FROM demand_history dh WHERE dh.product_id = p.id) as demand_records_count,
        (SELECT status_classification FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as optimization_status,
        (SELECT eoq FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as latest_eoq,
        (SELECT reorder_point FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as latest_rop,
        (SELECT safety_stock FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as latest_safety_stock,
        (SELECT suggested_order_qty FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as latest_suggested_order
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (lower(p.sku) LIKE lower(?) OR lower(p.name) LIKE lower(?) OR lower(p.supplier_name) LIKE lower(?))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category && category !== 'ALL') {
      sql += ` AND p.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY p.id ASC`;
    const rows = db.prepare(sql).all(...params);
    res.json({ products: rows });
  });

  app.get('/api/products/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const db = getDb();
    const product = db
      .prepare(
        `
      SELECT p.*, i.warehouse_location, i.on_hand_qty, i.reserved_qty, i.in_transit_qty
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `
      )
      .get(productId);

    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const demandHistory = db
      .prepare('SELECT * FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(productId);

    const forecasts = db
      .prepare('SELECT * FROM forecasts WHERE product_id = ? ORDER BY id DESC LIMIT 5')
      .all(productId);

    const optimizations = db
      .prepare('SELECT * FROM inventory_optimizations WHERE product_id = ? ORDER BY id DESC LIMIT 5')
      .all(productId);

    res.json({ product, demandHistory, forecasts, optimizations });
  });

  app.post('/api/products', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const {
      sku,
      name,
      category,
      unitCost,
      sellingPrice,
      holdingCostRate = 0.22,
      orderingCost = 150,
      leadTimeDays = 7,
      serviceLevel = 0.95,
      supplierName = 'Global Industrial Supply',
      warehouseLocation = 'ORD-CENTRAL-01',
      onHandQty = 0,
      reservedQty = 0,
      inTransitQty = 0,
    } = req.body || {};

    if (!sku || typeof sku !== 'string' || sku.trim().length < 2) {
      res.status(400).json({ error: 'SKU is required (minimum 2 characters).', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Product name is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!category || typeof category !== 'string' || category.trim().length < 2) {
      res.status(400).json({ error: 'Category is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    const uCost = Number(unitCost);
    const sPrice = Number(sellingPrice);
    const hRate = Number(holdingCostRate);
    const oCost = Number(orderingCost);
    const lDays = Number(leadTimeDays);
    const sLevel = Number(serviceLevel);
    const onHand = Number(onHandQty);
    const reserved = Number(reservedQty);
    const inTransit = Number(inTransitQty);

    if (!Number.isFinite(uCost) || uCost <= 0) {
      res.status(400).json({ error: 'Unit cost must be a positive number.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isFinite(sPrice) || sPrice < 0) {
      res.status(400).json({ error: 'Selling price must be a non-negative number.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isFinite(hRate) || hRate <= 0 || hRate > 2) {
      res.status(400).json({ error: 'Holding cost rate must be between 0.01 and 2.0.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isFinite(oCost) || oCost < 0) {
      res.status(400).json({ error: 'Ordering cost must be non-negative.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isInteger(lDays) || lDays < 0) {
      res.status(400).json({ error: 'Lead time days must be a non-negative integer.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isFinite(sLevel) || sLevel < 0.5 || sLevel >= 1) {
      res.status(400).json({ error: 'Service level must be between 0.50 and 0.999.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!Number.isFinite(onHand) || onHand < 0 || !Number.isFinite(reserved) || reserved < 0 || !Number.isFinite(inTransit) || inTransit < 0) {
      res.status(400).json({ error: 'Inventory quantities must be non-negative numbers.', code: 'VALIDATION_ERROR' });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM products WHERE lower(sku) = lower(?)').get(sku.trim());
    if (existing) {
      res.status(409).json({ error: `A product with SKU '${sku.trim()}' already exists.`, code: 'DUPLICATE_SKU' });
      return;
    }

    const createTx = db.transaction(() => {
      const info = db
        .prepare(
          `
        INSERT INTO products (sku, name, category, unit_cost, selling_price, holding_cost_rate, ordering_cost, lead_time_days, service_level, supplier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          sku.trim(),
          name.trim(),
          category.trim(),
          uCost,
          sPrice,
          hRate,
          oCost,
          lDays,
          sLevel,
          String(supplierName).trim() || 'Global Industrial Supply'
        );

      const productId = Number(info.lastInsertRowid);
      db.prepare(
        `
        INSERT INTO inventory (product_id, warehouse_location, on_hand_qty, reserved_qty, in_transit_qty)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(productId, String(warehouseLocation).trim() || 'ORD-CENTRAL-01', onHand, reserved, inTransit);

      return productId;
    });

    const newProductId = createTx();
    const created = db
      .prepare(
        `
      SELECT p.*, i.warehouse_location, i.on_hand_qty, i.reserved_qty, i.in_transit_qty,
             (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) as available_qty
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `
      )
      .get(newProductId);

    logAudit(req.user, 'PRODUCT_CREATE', 'PRODUCT', sku.trim(), { id: newProductId, name: name.trim() });
    res.status(201).json({ product: created });
  });

  app.put('/api/products/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const db = getDb();
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!current) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const {
      sku = current.sku,
      name = current.name,
      category = current.category,
      unitCost = current.unit_cost,
      sellingPrice = current.selling_price,
      holdingCostRate = current.holding_cost_rate,
      orderingCost = current.ordering_cost,
      leadTimeDays = current.lead_time_days,
      serviceLevel = current.service_level,
      supplierName = current.supplier_name,
    } = req.body || {};

    if (!sku || typeof sku !== 'string' || !name || typeof name !== 'string') {
      res.status(400).json({ error: 'Valid SKU and name are required.' });
      return;
    }
    const uCost = Number(unitCost);
    const sPrice = Number(sellingPrice);
    const hRate = Number(holdingCostRate);
    const oCost = Number(orderingCost);
    const lDays = Number(leadTimeDays);
    const sLevel = Number(serviceLevel);

    if (!Number.isFinite(uCost) || uCost <= 0 || !Number.isFinite(sPrice) || sPrice < 0) {
      res.status(400).json({ error: 'Invalid unit cost or selling price.' });
      return;
    }
    if (!Number.isFinite(hRate) || hRate <= 0 || hRate > 2 || !Number.isFinite(oCost) || oCost < 0) {
      res.status(400).json({ error: 'Invalid holding cost rate or ordering cost.' });
      return;
    }
    if (!Number.isInteger(lDays) || lDays < 0 || !Number.isFinite(sLevel) || sLevel < 0.5 || sLevel >= 1) {
      res.status(400).json({ error: 'Invalid lead time days or service level.' });
      return;
    }

    db.prepare(
      `
      UPDATE products
      SET sku = ?, name = ?, category = ?, unit_cost = ?, selling_price = ?,
          holding_cost_rate = ?, ordering_cost = ?, lead_time_days = ?,
          service_level = ?, supplier_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(
      sku.trim(),
      name.trim(),
      String(category).trim(),
      uCost,
      sPrice,
      hRate,
      oCost,
      lDays,
      sLevel,
      String(supplierName).trim(),
      productId
    );

    const updated = db
      .prepare(
        `
      SELECT p.*, i.warehouse_location, i.on_hand_qty, i.reserved_qty, i.in_transit_qty,
             (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) as available_qty
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `
      )
      .get(productId);

    res.json({ product: updated });
  });

  app.delete('/api/products/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const db = getDb();
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    res.json({ deleted: true, id: productId });
  });

  // ---------------------------------------------------------------------------
  // 5. Inventory Management Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/inventory', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT
        i.*,
        p.sku,
        p.name as product_name,
        p.category,
        p.unit_cost,
        p.lead_time_days,
        p.service_level,
        (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) as available_qty,
        ROUND(i.on_hand_qty * p.unit_cost, 2) as inventory_value,
        (SELECT reorder_point FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as reorder_point,
        (SELECT safety_stock FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as safety_stock,
        (SELECT eoq FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as eoq,
        (SELECT status_classification FROM inventory_optimizations io WHERE io.product_id = p.id ORDER BY io.id DESC LIMIT 1) as status_classification
      FROM inventory i
      INNER JOIN products p ON p.id = i.product_id
      ORDER BY p.id ASC
    `
      )
      .all();

    res.json({ inventory: rows });
  });

  app.put('/api/inventory/:productId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const { warehouseLocation, onHandQty, reservedQty, inTransitQty } = req.body || {};
    const onHand = Number(onHandQty);
    const reserved = Number(reservedQty ?? 0);
    const inTransit = Number(inTransitQty ?? 0);

    if (
      !Number.isFinite(onHand) ||
      onHand < 0 ||
      !Number.isFinite(reserved) ||
      reserved < 0 ||
      !Number.isFinite(inTransit) ||
      inTransit < 0
    ) {
      res.status(400).json({
        error: 'Inventory quantities (onHandQty, reservedQty, inTransitQty) must be non-negative numbers.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const existingInv = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(productId) as any;
    const loc =
      typeof warehouseLocation === 'string' && warehouseLocation.trim()
        ? warehouseLocation.trim()
        : existingInv?.warehouse_location || 'ORD-CENTRAL-01';

    if (existingInv) {
      db.prepare(
        `
        UPDATE inventory
        SET warehouse_location = ?, on_hand_qty = ?, reserved_qty = ?, in_transit_qty = ?,
            last_counted_at = datetime('now'), updated_at = datetime('now')
        WHERE product_id = ?
      `
      ).run(loc, onHand, reserved, inTransit, productId);
    } else {
      db.prepare(
        `
        INSERT INTO inventory (product_id, warehouse_location, on_hand_qty, reserved_qty, in_transit_qty)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(productId, loc, onHand, reserved, inTransit);
    }

    // Recompute optimization so ROP/status reflect updated inventory immediately
    const historyRows = db
      .prepare('SELECT demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(productId) as { demand_qty: number }[];

    const avgMonthly =
      historyRows.length > 0
        ? historyRows.reduce((s, r) => s + r.demand_qty, 0) / historyRows.length
        : 250;
    const annualDemand = avgMonthly * 12;
    let dailyStdDev = (annualDemand / 365) * 0.25;
    if (historyRows.length >= 2) {
      const variance =
        historyRows.reduce((acc, r) => acc + Math.pow(r.demand_qty - avgMonthly, 2), 0) /
        (historyRows.length - 1);
      dailyStdDev = Math.max(0.5, Math.sqrt(variance) / Math.sqrt(30));
    }

    const opt = optimizeInventory({
      annualDemand,
      dailyDemandMean: annualDemand / 365,
      dailyDemandStdDev: dailyStdDev,
      orderingCost: product.ordering_cost,
      unitCost: product.unit_cost,
      holdingCostRate: product.holding_cost_rate,
      leadTimeDays: product.lead_time_days,
      serviceLevel: product.service_level,
      onHandQty: onHand,
      reservedQty: reserved,
      inTransitQty: inTransit,
    });

    db.prepare(
      `
      INSERT INTO inventory_optimizations (
        product_id, annual_demand, daily_demand_mean, daily_demand_std_dev,
        ordering_cost, unit_holding_cost, lead_time_days, service_level, z_score,
        eoq, safety_stock, reorder_point, available_inventory, suggested_order_qty,
        total_annual_cost, status_classification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
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

    const updated = db
      .prepare(
        `
      SELECT i.*, p.sku, p.name as product_name,
             (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) as available_qty
      FROM inventory i
      INNER JOIN products p ON p.id = i.product_id
      WHERE i.product_id = ?
    `
      )
      .get(productId);

    res.json({ inventory: updated, optimization: opt });
  });

  // ---------------------------------------------------------------------------
  // 6. Demand History & CSV Upload Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/demand/:productId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(productId);
    res.json({ demandHistory: rows });
  });

  app.post('/api/demand', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { productId, periodDate, demandQty, notes = '' } = req.body || {};
    const pId = Number(productId);
    const qty = Number(demandQty);

    if (!Number.isInteger(pId) || pId <= 0) {
      res.status(400).json({ error: 'Valid productId is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!periodDate || typeof periodDate !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(periodDate.trim())) {
      res.status(400).json({
        error: 'Period date must be formatted as YYYY-MM or YYYY-MM-DD.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      res.status(400).json({
        error: 'Demand quantity must be a finite non-negative number.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const db = getDb();
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(pId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    db.prepare(
      `
      INSERT INTO demand_history (product_id, period_date, demand_qty, notes, source)
      VALUES (?, ?, ?, ?, 'manual')
      ON CONFLICT(product_id, period_date) DO UPDATE SET
        demand_qty = excluded.demand_qty,
        notes = excluded.notes,
        source = 'manual'
    `
    ).run(pId, periodDate.trim(), qty, String(notes).slice(0, 250));

    const rows = db
      .prepare('SELECT * FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(pId);

    res.status(201).json({ demandHistory: rows });
  });

  app.post('/api/demand/import-csv', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { productId, csvContent } = req.body || {};
    const pId = Number(productId);

    if (!Number.isInteger(pId) || pId <= 0) {
      res.status(400).json({ error: 'Valid productId is required.', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!csvContent || typeof csvContent !== 'string' || csvContent.trim().length === 0) {
      res.status(400).json({ error: 'CSV content cannot be empty.', code: 'EMPTY_CSV' });
      return;
    }
    if (csvContent.length > 200_000) {
      res.status(400).json({ error: 'CSV payload exceeds maximum size of 200KB.', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }

    const db = getDb();
    const product = db.prepare('SELECT id, sku FROM products WHERE id = ?').get(pId) as any;
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const rawLines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (rawLines.length === 0) {
      res.status(400).json({ error: 'CSV file contains no readable rows.', code: 'EMPTY_CSV' });
      return;
    }

    const parsedRows: { periodDate: string; demandQty: number; notes: string }[] = [];
    const validationErrors: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Skip header line if detected
      if (i === 0 && /period|date|demand|qty/i.test(line)) {
        continue;
      }
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) {
        validationErrors.push(`Row ${i + 1}: Expected at least 2 columns (period_date, demand_qty).`);
        continue;
      }

      const [periodDate, demandStr, notesStr = 'CSV Import'] = cols;
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(periodDate)) {
        validationErrors.push(
          `Row ${i + 1}: Invalid date '${periodDate}'. Must be YYYY-MM or YYYY-MM-DD.`
        );
        continue;
      }

      const qty = Number(demandStr);
      if (demandStr === '' || !Number.isFinite(qty) || qty < 0) {
        validationErrors.push(
          `Row ${i + 1}: Invalid demand quantity '${demandStr}'. Must be a non-negative number.`
        );
        continue;
      }

      // Sanitize notes against formula injection (=, +, -, @)
      const safeNotes = notesStr.replace(/^[=+\-@]+/, '').slice(0, 200);
      parsedRows.push({ periodDate, demandQty: qty, notes: safeNotes });
    }

    if (validationErrors.length > 0) {
      res.status(400).json({
        error: `CSV validation failed with ${validationErrors.length} error(s).`,
        details: validationErrors,
        code: 'CSV_VALIDATION_ERROR',
      });
      return;
    }

    if (parsedRows.length === 0) {
      res.status(400).json({
        error: 'No valid data rows found in CSV after header.',
        code: 'EMPTY_CSV_DATA',
      });
      return;
    }

    const upsertStmt = db.prepare(`
      INSERT INTO demand_history (product_id, period_date, demand_qty, notes, source)
      VALUES (?, ?, ?, ?, 'csv')
      ON CONFLICT(product_id, period_date) DO UPDATE SET
        demand_qty = excluded.demand_qty,
        notes = excluded.notes,
        source = 'csv'
    `);

    const importTx = db.transaction(() => {
      for (const r of parsedRows) {
        upsertStmt.run(pId, r.periodDate, r.demandQty, r.notes);
      }
    });
    importTx();

    const updatedHistory = db
      .prepare('SELECT * FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(pId);

    res.status(201).json({
      importedCount: parsedRows.length,
      demandHistory: updatedHistory,
    });
  });

  app.delete('/api/demand/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid demand record ID.' });
      return;
    }
    const db = getDb();
    const info = db.prepare('DELETE FROM demand_history WHERE id = ?').run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Demand record not found.' });
      return;
    }
    res.json({ deleted: true, id });
  });

  // ---------------------------------------------------------------------------
  // 7. Analytics: Demand Forecasting & Inventory Optimization Endpoints
  // ---------------------------------------------------------------------------
  app.post('/api/analytics/forecast', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        productId,
        method = 'moving_average',
        windowSize = 3,
        alpha = 0.35,
        horizonPeriods = 3,
        customHistory,
      } = req.body || {};

      const db = getDb();
      let historyPoints: DemandPoint[] = [];

      if (Array.isArray(customHistory)) {
        historyPoints = customHistory;
      } else {
        const pId = Number(productId);
        if (!Number.isInteger(pId) || pId <= 0) {
          res.status(400).json({ error: 'Valid productId is required.', code: 'VALIDATION_ERROR' });
          return;
        }
        const product = db.prepare('SELECT id, sku, name FROM products WHERE id = ?').get(pId);
        if (!product) {
          res.status(404).json({ error: 'Product not found.' });
          return;
        }
        const rows = db
          .prepare('SELECT period_date, demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
          .all(pId) as { period_date: string; demand_qty: number }[];
        historyPoints = rows.map((r) => ({ period: r.period_date, demand: r.demand_qty }));
      }

      const hPeriods = Number(horizonPeriods);
      let result;
      if (method === 'naive') {
        result = naiveForecast(historyPoints, hPeriods);
      } else if (method === 'moving_average') {
        result = movingAverageForecast(historyPoints, Number(windowSize), hPeriods);
      } else if (method === 'exponential_smoothing') {
        result = exponentialSmoothingForecast(historyPoints, Number(alpha), hPeriods);
      } else {
        res.status(400).json({
          error: `Unsupported forecast method '${method}'. Choose naive, moving_average, or exponential_smoothing.`,
          code: 'INVALID_METHOD',
        });
        return;
      }

      if (productId && Number.isInteger(Number(productId)) && Number(productId) > 0) {
        const info = db
          .prepare(
            `
          INSERT INTO forecasts (
            product_id, method, window_size, alpha, horizon_periods,
            next_period_forecast, mae, rmse, mape, forecast_payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            Number(productId),
            result.method,
            result.windowSize ?? null,
            result.alpha ?? null,
            result.horizonPeriods,
            result.nextPeriodForecast,
            result.metrics.mae,
            result.metrics.rmse,
            result.metrics.mape,
            JSON.stringify(result)
          );

        res.json({
          forecastId: Number(info.lastInsertRowid),
          ...result,
        });
        return;
      }

      res.json(result);
    } catch (err) {
      if (err instanceof AnalyticsValidationError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Failed to compute demand forecast.' });
    }
  });

  app.get('/api/analytics/forecasts/:productId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const productId = Number(req.params.productId);
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM forecasts WHERE product_id = ? ORDER BY id DESC LIMIT 10')
      .all(productId) as any[];

    res.json({
      forecasts: rows.map((r) => ({
        ...r,
        payload: JSON.parse(r.forecast_payload_json || '{}'),
      })),
    });
  });

  app.post('/api/analytics/optimize-inventory', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        productId,
        annualDemand: overrideAnnualDemand,
        dailyDemandStdDev: overrideStdDev,
        orderingCost: overrideOrderingCost,
        holdingCostRate: overrideHoldingRate,
        leadTimeDays: overrideLeadTime,
        serviceLevel: overrideServiceLevel,
      } = req.body || {};

      const pId = Number(productId);
      if (!Number.isInteger(pId) || pId <= 0) {
        res.status(400).json({ error: 'Valid productId is required.', code: 'VALIDATION_ERROR' });
        return;
      }

      const db = getDb();
      const product = db
        .prepare(
          `
        SELECT p.*, COALESCE(i.on_hand_qty, 0) as on_hand_qty,
               COALESCE(i.reserved_qty, 0) as reserved_qty,
               COALESCE(i.in_transit_qty, 0) as in_transit_qty
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id = ?
      `
        )
        .get(pId) as any;

      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }

      const historyRows = db
        .prepare('SELECT demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
        .all(pId) as { demand_qty: number }[];

      const computedMonthlyMean =
        historyRows.length > 0
          ? historyRows.reduce((s, r) => s + r.demand_qty, 0) / historyRows.length
          : 250;
      const annualDemand =
        overrideAnnualDemand !== undefined ? Number(overrideAnnualDemand) : computedMonthlyMean * 12;

      let empiricalDailyStdDev = (annualDemand / 365) * 0.25;
      if (historyRows.length >= 2) {
        const variance =
          historyRows.reduce((acc, r) => acc + Math.pow(r.demand_qty - computedMonthlyMean, 2), 0) /
          (historyRows.length - 1);
        empiricalDailyStdDev = Math.max(0.5, Math.sqrt(variance) / Math.sqrt(30));
      }

      const dailyDemandStdDev =
        overrideStdDev !== undefined ? Number(overrideStdDev) : empiricalDailyStdDev;
      const orderingCost =
        overrideOrderingCost !== undefined ? Number(overrideOrderingCost) : product.ordering_cost;
      const holdingCostRate =
        overrideHoldingRate !== undefined ? Number(overrideHoldingRate) : product.holding_cost_rate;
      const leadTimeDays =
        overrideLeadTime !== undefined ? Number(overrideLeadTime) : product.lead_time_days;
      const serviceLevel =
        overrideServiceLevel !== undefined ? Number(overrideServiceLevel) : product.service_level;

      const opt = optimizeInventory({
        annualDemand,
        dailyDemandMean: annualDemand / 365,
        dailyDemandStdDev,
        orderingCost,
        unitCost: product.unit_cost,
        holdingCostRate,
        leadTimeDays,
        serviceLevel,
        onHandQty: product.on_hand_qty,
        reservedQty: product.reserved_qty,
        inTransitQty: product.in_transit_qty,
      });

      const info = db
        .prepare(
          `
        INSERT INTO inventory_optimizations (
          product_id, annual_demand, daily_demand_mean, daily_demand_std_dev,
          ordering_cost, unit_holding_cost, lead_time_days, service_level, z_score,
          eoq, safety_stock, reorder_point, available_inventory, suggested_order_qty,
          total_annual_cost, status_classification
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          pId,
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

      // Build EOQ sensitivity cost curve for visualization
      const costCurve: { orderQty: number; orderingCost: number; holdingCost: number; totalCost: number }[] = [];
      if (opt.eoq > 0) {
        const multipliers = [0.4, 0.6, 0.8, 1.0, 1.25, 1.5, 1.8, 2.2];
        for (const m of multipliers) {
          const q = Math.max(1, Math.round(opt.eoq * m));
          const oCost = Math.round(((opt.annualDemand / q) * opt.orderingCost) * 100) / 100;
          const hCost = Math.round(((q / 2 + opt.safetyStock) * opt.unitHoldingCost) * 100) / 100;
          costCurve.push({
            orderQty: q,
            orderingCost: oCost,
            holdingCost: hCost,
            totalCost: Math.round((oCost + hCost) * 100) / 100,
          });
        }
      }

      res.json({
        optimizationId: Number(info.lastInsertRowid),
        product: { id: product.id, sku: product.sku, name: product.name },
        optimization: opt,
        costCurve,
      });
    } catch (err) {
      if (err instanceof AnalyticsValidationError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Inventory optimization failed.' });
    }
  });

  app.get('/api/analytics/optimizations', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT io.*, p.sku, p.name as product_name, p.category
      FROM inventory_optimizations io
      INNER JOIN (
        SELECT product_id, MAX(id) as max_id
        FROM inventory_optimizations
        GROUP BY product_id
      ) latest ON io.id = latest.max_id
      INNER JOIN products p ON p.id = io.product_id
      ORDER BY io.product_id ASC
    `
      )
      .all();

    res.json({ optimizations: rows });
  });

  // ---------------------------------------------------------------------------
  // 8. Delivery Route Planning Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/routes/nodes', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const nodes = db.prepare('SELECT * FROM delivery_nodes ORDER BY id ASC').all();
    res.json({ nodes });
  });

  app.post('/api/routes/nodes', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { code, name, nodeType = 'customer', city, latitude, longitude, demandUnits = 100 } = req.body || {};
    if (!code || typeof code !== 'string' || !name || typeof name !== 'string' || !city || typeof city !== 'string') {
      res.status(400).json({ error: 'Node code, name, and city are required.', code: 'VALIDATION_ERROR' });
      return;
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    const demand = Number(demandUnits);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'Valid latitude [-90, 90] and longitude [-180, 180] are required.' });
      return;
    }
    if (!Number.isFinite(demand) || demand < 0) {
      res.status(400).json({ error: 'Demand units must be a non-negative number.' });
      return;
    }

    const validType = ['depot', 'warehouse', 'customer'].includes(nodeType) ? nodeType : 'customer';
    const db = getDb();
    const dup = db.prepare('SELECT id FROM delivery_nodes WHERE lower(code) = lower(?)').get(code.trim());
    if (dup) {
      res.status(409).json({ error: `Delivery node code '${code.trim()}' already exists.` });
      return;
    }

    const info = db
      .prepare(
        `
      INSERT INTO delivery_nodes (code, name, node_type, city, latitude, longitude, demand_units)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(code.trim().toUpperCase(), name.trim(), validType, city.trim(), lat, lon, demand);

    const created = db.prepare('SELECT * FROM delivery_nodes WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ node: created });
  });

  app.delete('/api/routes/nodes/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const nodeId = Number(req.params.id);
    const db = getDb();
    const node = db.prepare('SELECT * FROM delivery_nodes WHERE id = ?').get(nodeId) as any;
    if (!node) {
      res.status(404).json({ error: 'Delivery node not found.' });
      return;
    }
    if (node.node_type === 'depot') {
      res.status(400).json({ error: 'Cannot delete primary depot node.' });
      return;
    }
    db.prepare('DELETE FROM delivery_nodes WHERE id = ?').run(nodeId);
    res.json({ deleted: true, id: nodeId });
  });

  app.get('/api/routes', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM delivery_routes ORDER BY id DESC LIMIT 15').all() as any[];
    res.json({
      routes: rows.map((r) => ({
        ...r,
        orderedStops: JSON.parse(r.ordered_stops_json || '[]'),
      })),
    });
  });

  app.post('/api/routes/plan', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        routeName = 'Optimized Regional Dispatch',
        depotNodeId,
        stopNodeIds,
        vehicleCapacity = 1800,
        algorithm = 'two_opt',
      } = req.body || {};

      const db = getDb();
      const allNodes = db.prepare('SELECT * FROM delivery_nodes ORDER BY id ASC').all() as any[];

      const mapRowToNode = (r: any): DeliveryNodeInput => ({
        id: r.id,
        code: r.code,
        name: r.name,
        nodeType: r.node_type,
        city: r.city,
        latitude: r.latitude,
        longitude: r.longitude,
        demandUnits: r.demand_units,
      });

      const depotRow = depotNodeId
        ? allNodes.find((n) => n.id === Number(depotNodeId))
        : allNodes.find((n) => n.node_type === 'depot') || allNodes[0];

      if (!depotRow) {
        res.status(400).json({ error: 'No valid depot node found.' });
        return;
      }

      let stopRows = allNodes.filter((n) => n.id !== depotRow.id);
      if (Array.isArray(stopNodeIds) && stopNodeIds.length > 0) {
        const idSet = new Set(stopNodeIds.map((id: any) => Number(id)));
        stopRows = stopRows.filter((n) => idSet.has(n.id));
      }

      if (stopRows.length === 0) {
        res.status(400).json({ error: 'Select at least one destination stop to plan a delivery route.' });
        return;
      }

      const plan = planDeliveryRoute(
        mapRowToNode(depotRow),
        stopRows.map(mapRowToNode),
        Number(vehicleCapacity),
        algorithm === 'nearest_neighbor' ? 'nearest_neighbor' : 'two_opt'
      );

      const info = db
        .prepare(
          `
        INSERT INTO delivery_routes (
          route_name, depot_node_id, vehicle_capacity, algorithm,
          ordered_stops_json, total_distance_km, estimated_duration_hrs,
          total_load_units, utilization_pct, fuel_cost_est,
          baseline_distance_km, distance_saved_km
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          String(routeName).trim() || 'Optimized Regional Dispatch',
          depotRow.id,
          plan.vehicleCapacity,
          plan.algorithm,
          JSON.stringify(plan.orderedStops),
          plan.totalDistanceKm,
          plan.estimatedDurationHrs,
          plan.totalLoadUnits,
          plan.utilizationPct,
          plan.fuelCostEst,
          plan.baselineDistanceKm,
          plan.distanceSavedKm
        );

      res.status(201).json({
        routeId: Number(info.lastInsertRowid),
        routeName: String(routeName).trim() || 'Optimized Regional Dispatch',
        ...plan,
      });
    } catch (err) {
      if (err instanceof AnalyticsValidationError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Route optimization failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Sequential vs. Parallel Benchmark Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/benchmarks', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const benchmarks = db.prepare('SELECT * FROM benchmarks ORDER BY id DESC LIMIT 15').all() as any[];
    res.json({
      benchmarks: benchmarks.map((b) => ({
        ...b,
        details: JSON.parse(b.details_json || '{}'),
      })),
    });
  });

  app.post('/api/benchmarks/run', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workloadSize = 60, iterations = 15000, workerCount = 4 } = req.body || {};
      const summary = await runExecutionBenchmark(
        Number(workloadSize),
        Number(iterations),
        Number(workerCount)
      );

      const db = getDb();
      const info = db
        .prepare(
          `
        INSERT INTO benchmarks (
          workload_size, iterations, worker_count,
          sequential_ms, parallel_ms, speedup_factor,
          efficiency_pct, results_match, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          summary.workloadSize,
          summary.iterations,
          summary.workerCount,
          summary.sequentialMs,
          summary.parallelMs,
          summary.speedupFactor,
          summary.efficiencyPct,
          summary.resultsMatch ? 1 : 0,
          JSON.stringify({ sampleOutputs: summary.sampleOutputs })
        );

      res.status(201).json({
        benchmarkId: Number(info.lastInsertRowid),
        ...summary,
      });
    } catch (err) {
      if (err instanceof AnalyticsValidationError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Failed to execute parallel benchmark.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Decision Support Recommendations Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/recommendations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const priorityFilter = typeof req.query.priority === 'string' ? req.query.priority.trim() : '';

    let sql = `
      SELECT r.*, p.sku, p.name as product_name
      FROM recommendations r
      LEFT JOIN products p ON p.id = r.product_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (statusFilter && statusFilter !== 'ALL') {
      sql += ` AND r.status = ?`;
      params.push(statusFilter);
    }
    if (priorityFilter && priorityFilter !== 'ALL') {
      sql += ` AND r.priority = ?`;
      params.push(priorityFilter);
    }

    sql += ` ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END, CASE r.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, r.id DESC`;
    const rows = db.prepare(sql).all(...params);
    res.json({ recommendations: rows });
  });

  app.post('/api/recommendations/generate', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const products = db
      .prepare(
        `
      SELECT p.*, COALESCE(i.on_hand_qty, 0) as on_hand_qty,
             COALESCE(i.reserved_qty, 0) as reserved_qty,
             COALESCE(i.in_transit_qty, 0) as in_transit_qty
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
    `
      )
      .all() as any[];

    const contexts = products.map((p) => {
      const history = db
        .prepare('SELECT period_date, demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
        .all(p.id) as { period_date: string; demand_qty: number }[];
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitCost: p.unit_cost,
        orderingCost: p.ordering_cost,
        holdingCostRate: p.holding_cost_rate,
        leadTimeDays: p.lead_time_days,
        serviceLevel: p.service_level,
        onHandQty: p.on_hand_qty,
        reservedQty: p.reserved_qty,
        inTransitQty: p.in_transit_qty,
        demandHistory: history.map((h) => ({ period: h.period_date, demand: h.demand_qty })),
      };
    });

    const generated = generateRecommendationsForProducts(contexts);

    const insertTx = db.transaction(() => {
      // Remove stale PENDING recommendations before inserting refreshed analysis
      db.prepare(`DELETE FROM recommendations WHERE status = 'PENDING'`).run();
      const stmt = db.prepare(`
        INSERT INTO recommendations (
          product_id, category, priority, title, rationale, suggested_action, estimated_savings, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      for (const rec of generated) {
        stmt.run(
          rec.productId,
          rec.category,
          rec.priority,
          rec.title,
          rec.rationale,
          rec.suggestedAction,
          rec.estimatedSavings
        );
      }
    });
    insertTx();

    const rows = db
      .prepare(
        `
      SELECT r.*, p.sku, p.name as product_name
      FROM recommendations r
      LEFT JOIN products p ON p.id = r.product_id
      ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END, r.id DESC
    `
      )
      .all();

    res.status(201).json({ generatedCount: generated.length, recommendations: rows });
  });

  app.patch('/api/recommendations/:id/decision', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const recId = Number(req.params.id);
    const { status, decisionNotes = '' } = req.body || {};

    if (!Number.isInteger(recId) || recId <= 0) {
      res.status(400).json({ error: 'Invalid recommendation ID.' });
      return;
    }
    if (status !== 'ACCEPTED' && status !== 'REJECTED') {
      res.status(400).json({
        error: 'Status must be either ACCEPTED or REJECTED.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recId) as any;
    if (!existing) {
      res.status(404).json({ error: 'Recommendation not found.' });
      return;
    }

    const decidedBy = req.user?.name || req.user?.email || 'Planner';
    db.prepare(
      `
      UPDATE recommendations
      SET status = ?, decided_by = ?, decided_at = datetime('now'), decision_notes = ?
      WHERE id = ?
    `
    ).run(status, decidedBy, String(decisionNotes).slice(0, 300), recId);

    const updated = db
      .prepare(
        `
      SELECT r.*, p.sku, p.name as product_name
      FROM recommendations r
      LEFT JOIN products p ON p.id = r.product_id
      WHERE r.id = ?
    `
      )
      .get(recId);

    logAudit(req.user, `RECOMMENDATION_${status}`, 'RECOMMENDATION', String(recId), {
      status,
      notes: decisionNotes,
    });

    res.json({ recommendation: updated });
  });

  // ---------------------------------------------------------------------------
  // 10. Advanced Database Engine Diagnostics & Maintenance
  // ---------------------------------------------------------------------------
  app.get('/api/system/metrics', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = getDatabaseStats();
      const mem = process.memoryUsage();
      res.json({
        database: stats,
        runtime: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          memory: {
            heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
            rssMb: Math.round(mem.rss / 1024 / 1024),
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve system metrics.' });
    }
  });

  app.get('/api/system/integrity', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const check = runIntegrityCheck();
      res.json(check);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Integrity check failed.' });
    }
  });

  app.post('/api/system/checkpoint', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = checkpointWal();
      logAudit(req.user, 'WAL_CHECKPOINT', 'DATABASE', 'WAL', result);
      res.json({ status: 'ok', result, message: 'SQLite WAL checkpoint completed.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'WAL checkpoint failed.' });
    }
  });

  app.post('/api/system/vacuum', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      vacuumDatabase();
      logAudit(req.user, 'VACUUM', 'DATABASE', 'MAIN', {});
      res.json({ status: 'ok', message: 'SQLite VACUUM optimization completed.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Database VACUUM failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 11. Audit Trail System
  // ---------------------------------------------------------------------------
  app.get('/api/audit-logs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const logs = db
      .prepare(
        `
      SELECT id, user_id, user_email, action, entity_type, entity_id, details_json, created_at
      FROM audit_logs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset) as any[];

    const total = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get() as { cnt: number }).cnt;

    res.json({
      auditLogs: logs.map((l) => ({
        ...l,
        details: (() => {
          try {
            return JSON.parse(l.details_json);
          } catch {
            return {};
          }
        })(),
      })),
      total,
      limit,
      offset,
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Enterprise Supplier Network Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/suppliers', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY id ASC').all();
    res.json({ suppliers });
  });

  app.post('/api/suppliers', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { code, name, contactEmail, leadTimeDays = 7, onTimeRate = 95, qualityRating = 4.8, riskScore = 'LOW' } = req.body || {};
    if (!code || !name || !contactEmail) {
      res.status(400).json({ error: 'Supplier code, name, and contact email are required.' });
      return;
    }

    const db = getDb();
    try {
      const info = db
        .prepare(`
          INSERT INTO suppliers (code, name, contact_email, lead_time_days, on_time_rate, quality_rating, risk_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          String(code).toUpperCase().trim(),
          String(name).trim(),
          String(contactEmail).toLowerCase().trim(),
          Number(leadTimeDays),
          Number(onTimeRate),
          Number(qualityRating),
          ['LOW', 'MEDIUM', 'HIGH'].includes(riskScore) ? riskScore : 'LOW'
        );

      const created = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);
      logAudit(req.user, 'SUPPLIER_CREATE', 'SUPPLIER', String(info.lastInsertRowid), { name, code });
      res.status(201).json({ supplier: created });
    } catch (err: any) {
      res.status(409).json({ error: 'Supplier code must be unique.' });
    }
  });

  app.put('/api/suppliers/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const supplierId = Number(req.params.id);
    const { name, contactEmail, leadTimeDays, onTimeRate, qualityRating, riskScore } = req.body || {};
    const db = getDb();

    db.prepare(`
      UPDATE suppliers
      SET name = COALESCE(?, name),
          contact_email = COALESCE(?, contact_email),
          lead_time_days = COALESCE(?, lead_time_days),
          on_time_rate = COALESCE(?, on_time_rate),
          quality_rating = COALESCE(?, quality_rating),
          risk_score = COALESCE(?, risk_score)
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      contactEmail ? String(contactEmail).trim() : null,
      leadTimeDays ? Number(leadTimeDays) : null,
      onTimeRate ? Number(onTimeRate) : null,
      qualityRating ? Number(qualityRating) : null,
      riskScore ? String(riskScore) : null,
      supplierId
    );

    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    logAudit(req.user, 'SUPPLIER_UPDATE', 'SUPPLIER', String(supplierId), req.body);
    res.json({ supplier: updated });
  });

  // ---------------------------------------------------------------------------
  // 13. Purchase Orders (PO) Workflow & Automatic Inventory Receipt
  // ---------------------------------------------------------------------------
  app.get('/api/purchase-orders', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const pos = db
      .prepare('SELECT * FROM purchase_orders ORDER BY id DESC')
      .all() as any[];

    const poItems = db.prepare('SELECT * FROM purchase_order_items').all() as any[];

    const result = pos.map((po) => ({
      ...po,
      items: poItems.filter((i) => i.po_id === po.id),
    }));

    res.json({ purchaseOrders: result });
  });

  app.post('/api/purchase-orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const {
      supplierId,
      supplierName,
      expectedDeliveryDate,
      notes = '',
      items = [],
    } = req.body || {};

    if (!supplierName || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Supplier name and at least one order line item are required.' });
      return;
    }

    const db = getDb();
    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    let totalAmount = 0;

    for (const it of items) {
      totalAmount += (Number(it.orderedQty) || 0) * (Number(it.unitCost) || 0);
    }

    const createdBy = req.user?.name || 'Supply Chain Planner';

    const tx = db.transaction(() => {
      const poInfo = db
        .prepare(`
          INSERT INTO purchase_orders (po_number, supplier_id, supplier_name, status, total_amount, expected_delivery_date, notes, created_by)
          VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)
        `)
        .run(
          poNumber,
          supplierId ? Number(supplierId) : null,
          String(supplierName).trim(),
          Math.round(totalAmount * 100) / 100,
          expectedDeliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          String(notes).slice(0, 300),
          createdBy
        );

      const poId = Number(poInfo.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO purchase_order_items (po_id, product_id, sku, name, ordered_qty, unit_cost, total_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        const qty = Number(it.orderedQty) || 1;
        const cost = Number(it.unitCost) || 0;
        insertItem.run(
          poId,
          Number(it.productId),
          String(it.sku),
          String(it.name),
          qty,
          cost,
          Math.round(qty * cost * 100) / 100
        );

        // Put into in_transit_qty
        db.prepare(`
          UPDATE inventory
          SET in_transit_qty = in_transit_qty + ?, updated_at = datetime('now')
          WHERE product_id = ?
        `).run(qty, Number(it.productId));
      }

      return poId;
    });

    const newPoId = tx();
    logAudit(req.user, 'PO_CREATED', 'PURCHASE_ORDER', poNumber, { poId: newPoId, totalAmount, itemsCount: items.length });

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(newPoId) as any;
    const poItemsResult = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(newPoId);

    res.status(201).json({ purchaseOrder: { ...po, items: poItemsResult } });
  });

  app.patch('/api/purchase-orders/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const poId = Number(req.params.id);
    const { status, notes } = req.body || {};
    const validStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId) as any;
    if (!existing) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }

    const tx = db.transaction(() => {
      // If moving to RECEIVED from an active status, replenish inventory!
      if (status === 'RECEIVED' && existing.status !== 'RECEIVED') {
        const items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId) as any[];
        for (const it of items) {
          db.prepare(`
            UPDATE inventory
            SET on_hand_qty = on_hand_qty + ?,
                in_transit_qty = MAX(0, in_transit_qty - ?),
                last_counted_at = datetime('now'),
                updated_at = datetime('now')
            WHERE product_id = ?
          `).run(it.ordered_qty, it.ordered_qty, it.product_id);
        }
      }

      db.prepare(`
        UPDATE purchase_orders
        SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
        WHERE id = ?
      `).run(status, notes ? String(notes).slice(0, 300) : null, poId);
    });

    tx();

    logAudit(req.user, `PO_STATUS_${status}`, 'PURCHASE_ORDER', existing.po_number, {
      fromStatus: existing.status,
      toStatus: status,
    });

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId) as any;
    const items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId);

    res.json({ purchaseOrder: { ...updated, items } });
  });

  // ---------------------------------------------------------------------------
  // 14. Advanced Analytics Endpoints (Holt Trend, Sensitivity, Monte Carlo, Scenario)
  // ---------------------------------------------------------------------------
  app.post('/api/analytics/holt-trend', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { productId, alpha = 0.35, beta = 0.15, horizonPeriods = 3 } = req.body || {};
    const db = getDb();

    const demandRows = db
      .prepare('SELECT period_date as period, demand_qty as demand FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(Number(productId)) as DemandPoint[];

    if (!demandRows || demandRows.length < 3) {
      res.status(400).json({ error: 'Holt linear trend model requires at least 3 historical demand points.' });
      return;
    }

    const result = holtLinearTrendForecast(demandRows, Number(alpha), Number(beta), Number(horizonPeriods));
    res.json(result);
  });

  app.post('/api/analytics/sensitivity', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { productId } = req.body || {};
    const db = getDb();

    const prod = db
      .prepare(`
        SELECT p.*, i.on_hand_qty, i.reserved_qty, i.in_transit_qty
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id = ?
      `)
      .get(Number(productId)) as any;

    if (!prod) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const history = db
      .prepare('SELECT demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(Number(productId)) as { demand_qty: number }[];

    const annualDemand = history.length > 0
      ? (history.reduce((a, b) => a + b.demand_qty, 0) / history.length) * 12
      : 3600;
    const dailyMean = annualDemand / 365;
    const dailyStd = dailyMean * 0.25;
    const unitHoldingCost = prod.unit_cost * prod.holding_cost_rate;

    const sensitivity = calculateSafetyStockSensitivity(
      annualDemand,
      dailyMean,
      dailyStd,
      prod.lead_time_days,
      prod.ordering_cost,
      unitHoldingCost
    );

    res.json({ productId: prod.id, sku: prod.sku, sensitivity });
  });

  app.post('/api/analytics/monte-carlo', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { productId, trials = 1000 } = req.body || {};
    const db = getDb();

    const prod = db
      .prepare(`
        SELECT p.*, i.on_hand_qty, i.reserved_qty, i.in_transit_qty
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id = ?
      `)
      .get(Number(productId)) as any;

    if (!prod) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const history = db
      .prepare('SELECT demand_qty FROM demand_history WHERE product_id = ? ORDER BY period_date ASC')
      .all(Number(productId)) as { demand_qty: number }[];

    const annualDemand = history.length > 0
      ? (history.reduce((a, b) => a + b.demand_qty, 0) / history.length) * 12
      : 3600;
    const dailyMean = annualDemand / 365;
    const dailyStd = dailyMean * 0.25;
    const unitHoldingCost = prod.unit_cost * prod.holding_cost_rate;
    const eoq = Math.sqrt((2 * annualDemand * prod.ordering_cost) / Math.max(0.1, unitHoldingCost));
    const ss = 1.645 * dailyStd * Math.sqrt(prod.lead_time_days);
    const rop = dailyMean * prod.lead_time_days + ss;
    const available = prod.on_hand_qty - prod.reserved_qty + prod.in_transit_qty;

    const sim = runMonteCarloStockoutSimulation({
      dailyDemandMean: dailyMean,
      dailyDemandStdDev: dailyStd,
      leadTimeDays: prod.lead_time_days,
      reorderPoint: rop,
      orderQuantity: eoq,
      initialInventory: available,
      trials: Math.min(5000, Math.max(100, Number(trials))),
    });

    res.json({ productId: prod.id, sku: prod.sku, simulation: sim });
  });

  app.post('/api/analytics/scenario-simulation', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const {
      demandMultiplier = 1.25,
      leadTimeDeltaDays = 5,
      unitCostMultiplier = 1.1,
      holdingCostRateDelta = 0.03,
    } = req.body || {};

    const db = getDb();
    const products = db
      .prepare(`
        SELECT p.*, i.on_hand_qty, i.reserved_qty, i.in_transit_qty
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        ORDER BY p.id ASC
      `)
      .all() as any[];

    const result = simulateScenario(products, {
      demandMultiplier: Number(demandMultiplier),
      leadTimeDeltaDays: Number(leadTimeDeltaDays),
      unitCostMultiplier: Number(unitCostMultiplier),
      holdingCostRateDelta: Number(holdingCostRateDelta),
    });

    res.json(result);
  });

  // ---------------------------------------------------------------------------
  // 15. Real-Time Data Export (CSV)
  // ---------------------------------------------------------------------------
  app.get('/api/export/inventory-csv', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const products = db
      .prepare(`
        SELECT
          p.sku,
          p.name,
          p.category,
          p.unit_cost,
          p.selling_price,
          p.holding_cost_rate,
          p.ordering_cost,
          p.lead_time_days,
          p.service_level,
          p.supplier_name,
          i.warehouse_location,
          i.on_hand_qty,
          i.reserved_qty,
          i.in_transit_qty,
          (i.on_hand_qty - i.reserved_qty + i.in_transit_qty) AS available_qty
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        ORDER BY p.sku ASC
      `)
      .all() as any[];

    const headers = [
      'SKU',
      'Name',
      'Category',
      'UnitCost',
      'SellingPrice',
      'LeadTimeDays',
      'Supplier',
      'Warehouse',
      'OnHandQty',
      'ReservedQty',
      'InTransitQty',
      'AvailableQty',
    ];

    const lines = [headers.join(',')];
    for (const p of products) {
      lines.push(
        [
          `"${p.sku}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.category}"`,
          p.unit_cost,
          p.selling_price,
          p.lead_time_days,
          `"${(p.supplier_name || '').replace(/"/g, '""')}"`,
          `"${p.warehouse_location || ''}"`,
          p.on_hand_qty || 0,
          p.reserved_qty || 0,
          p.in_transit_qty || 0,
          p.available_qty || 0,
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="scdss-inventory-master.csv"');
    res.send(lines.join('\n'));
  });

  // Reset to clean seed state endpoint (useful for demo reset)
  app.post('/api/system/reset-seed', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    resetAndSeedDb();
    res.json({ status: 'ok', message: 'Database reset to verified initial seed state.' });
  });

  // Safe global error handler (never leaks internal stack traces)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('SERVER ERROR:', err);
    if (err instanceof AnalyticsValidationError) {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({
      error: 'An unexpected server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  return app;
}

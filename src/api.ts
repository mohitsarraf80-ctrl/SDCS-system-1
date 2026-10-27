/**
 * SCDSS — Typed Frontend API Client
 */

const TOKEN_STORAGE_KEY = 'scdss_auth_token';
const USER_STORAGE_KEY = 'scdss_auth_user';

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'planner' | 'analyst';
}

export interface ProductRecord {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  selling_price: number;
  holding_cost_rate: number;
  ordering_cost: number;
  lead_time_days: number;
  service_level: number;
  supplier_name: string;
  warehouse_location: string;
  on_hand_qty: number;
  reserved_qty: number;
  in_transit_qty: number;
  available_qty: number;
  demand_records_count?: number;
  optimization_status?: 'OPTIMAL' | 'REORDER_NOW' | 'CRITICAL_SHORTAGE' | 'OVERSTOCK' | null;
  latest_eoq?: number | null;
  latest_rop?: number | null;
  latest_safety_stock?: number | null;
  latest_suggested_order?: number | null;
}

export interface DemandRecord {
  id: number;
  product_id: number;
  period_date: string;
  demand_qty: number;
  notes: string;
  source: 'manual' | 'csv' | 'seed';
  created_at: string;
}

export interface ForecastResponse {
  forecastId?: number;
  method: 'naive' | 'moving_average' | 'exponential_smoothing';
  windowSize?: number;
  alpha?: number;
  horizonPeriods: number;
  nextPeriodForecast: number;
  futureForecasts: { period: string; forecast: number }[];
  series: { period: string; actual: number | null; forecast: number }[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    sampleSize: number;
  };
}

export interface OptimizationData {
  annualDemand: number;
  dailyDemandMean: number;
  dailyDemandStdDev: number;
  orderingCost: number;
  unitHoldingCost: number;
  leadTimeDays: number;
  serviceLevel: number;
  zScore: number;
  eoq: number;
  safetyStock: number;
  reorderPoint: number;
  availableInventory: number;
  suggestedOrderQty: number;
  ordersPerYear: number;
  cycleStock: number;
  annualOrderingCost: number;
  annualHoldingCost: number;
  totalAnnualCost: number;
  statusClassification: 'OPTIMAL' | 'REORDER_NOW' | 'CRITICAL_SHORTAGE' | 'OVERSTOCK';
}

export interface DeliveryNode {
  id: number;
  code: string;
  name: string;
  node_type: 'depot' | 'warehouse' | 'customer';
  city: string;
  latitude: number;
  longitude: number;
  demand_units: number;
}

export interface RouteStop {
  sequence: number;
  nodeId: number;
  code: string;
  name: string;
  city: string;
  nodeType: 'depot' | 'warehouse' | 'customer';
  latitude: number;
  longitude: number;
  demandUnits: number;
  legDistanceKm: number;
  cumulativeDistanceKm: number;
  cumulativeLoadUnits: number;
  etaHours: number;
}

export interface DeliveryRoutePlan {
  id?: number;
  routeId?: number;
  route_name?: string;
  routeName?: string;
  algorithm: 'nearest_neighbor' | 'two_opt';
  vehicle_capacity?: number;
  vehicleCapacity?: number;
  orderedStops: RouteStop[];
  total_distance_km?: number;
  totalDistanceKm?: number;
  estimated_duration_hrs?: number;
  estimatedDurationHrs?: number;
  total_load_units?: number;
  totalLoadUnits?: number;
  utilization_pct?: number;
  utilizationPct?: number;
  fuel_cost_est?: number;
  fuelCostEst?: number;
  baseline_distance_km?: number;
  baselineDistanceKm?: number;
  distance_saved_km?: number;
  distanceSavedKm?: number;
  created_at?: string;
}

export interface RecommendationItem {
  id: number;
  product_id: number | null;
  sku?: string;
  product_name?: string;
  category:
    | 'INVENTORY_REPLENISHMENT'
    | 'SAFETY_STOCK_ADJUSTMENT'
    | 'DEMAND_SURGE'
    | 'ROUTE_CONSOLIDATION'
    | 'OVERSTOCK_REDUCTION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  rationale: string;
  suggested_action: string;
  estimated_savings: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  decided_by?: string | null;
  decided_at?: string | null;
  decision_notes?: string | null;
  created_at: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  contact_email: string;
  lead_time_days: number;
  on_time_rate: number;
  quality_rating: number;
  risk_score: 'LOW' | 'MEDIUM' | 'HIGH';
  active: number;
  created_at: string;
}

export interface PurchaseOrderItem {
  id: number;
  po_id: number;
  product_id: number;
  sku: string;
  name: string;
  ordered_qty: number;
  unit_cost: number;
  total_cost: number;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number | null;
  supplier_name: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
  total_amount: number;
  expected_delivery_date: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: PurchaseOrderItem[];
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  created_at: string;
}

export interface SystemMetrics {
  database: {
    path: string;
    journalMode: string;
    pageSize: number;
    pageCount: number;
    totalSizeBytes: number;
    freelistCount: number;
    cacheSizeKb: number;
    tableCounts: Record<string, number>;
  };
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
  };
}

export interface ServiceLevelSensitivityPoint {
  serviceLevel: number;
  serviceLevelPct: string;
  zScore: number;
  safetyStock: number;
  reorderPoint: number;
  annualHoldingCost: number;
  annualOrderingCost: number;
  totalAnnualCost: number;
  stockoutRiskPct: number;
}

export interface MonteCarloSimulationResult {
  trials: number;
  serviceLevelAchievedPct: number;
  stockoutProbabilityPct: number;
  fillRatePct: number;
  meanEndingInventory: number;
  valueAtRisk95Units: number;
  histogram: { binStart: number; binEnd: number; count: number; label: string }[];
}

export interface ScenarioSimulationResult {
  scenarioParameters: {
    demandMultiplier: number;
    leadTimeDeltaDays: number;
    unitCostMultiplier: number;
    holdingCostRateDelta: number;
  };
  baseline: {
    totalWorkingCapital: number;
    totalAnnualCost: number;
    stockoutSkusCount: number;
    reorderRequiredCount: number;
  };
  stressed: {
    totalWorkingCapital: number;
    totalAnnualCost: number;
    stockoutSkusCount: number;
    reorderRequiredCount: number;
  };
  deltas: {
    workingCapitalDelta: number;
    workingCapitalDeltaPct: number;
    annualCostDelta: number;
    annualCostDeltaPct: number;
    newShortagesCount: number;
  };
  atRiskSkus: {
    sku: string;
    name: string;
    category: string;
    baselineAvailable: number;
    stressedROP: number;
    projectedShortageUnits: number;
    projectedStockoutRiskPct: number;
    suggestedAction: string;
  }[];
}

export interface GreenLogisticsResult {
  distanceKm: number;
  baselineDistanceKm: number;
  distanceSavedKm: number;
  fuelConsumptionLiters: number;
  fuelSavedLiters: number;
  co2EmissionsKg: number;
  co2SavedKg: number;
  carbonReductionPct: number;
  greenEfficiencyRating: 'A+' | 'A' | 'B' | 'C';
}

export interface HoltTrendForecastResult {
  method: 'holt_linear_trend';
  alpha: number;
  beta: number;
  horizonPeriods: number;
  nextPeriodForecast: number;
  finalLevel: number;
  finalTrend: number;
  futureForecasts: {
    period: string;
    forecast: number;
    lowerBound95: number;
    upperBound95: number;
  }[];
  series: {
    period: string;
    actual: number | null;
    forecast: number;
    lowerBound95?: number;
    upperBound95?: number;
  }[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    sampleSize: number;
  };
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: UserProfile): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed with status ${res.status}`) as Error & {
      status?: number;
      details?: string[];
      code?: string;
    };
    err.status = res.status;
    err.details = data.details;
    err.code = data.code;
    throw err;
  }
  return data as T;
}

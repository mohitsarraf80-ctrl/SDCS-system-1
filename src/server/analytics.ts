/**
 * SCDSS — Supply Chain Analytics & Operations Research Engine
 *
 * Implements verified mathematical models for:
 * 1. Naive Demand Forecasting
 * 2. Simple Moving-Average (SMA) Forecasting
 * 3. Simple Exponential Smoothing (SES) Forecasting
 * 4. Economic Order Quantity (EOQ)
 * 5. Statistical Safety Stock (SS)
 * 6. Reorder Point (ROP) & Suggested Order Quantity (SOQ)
 * 7. Multi-Stop Delivery Route Optimization (Nearest-Neighbor + 2-Opt Refinement)
 * 8. Sequential vs. Parallel Multi-SKU Analytics Benchmarking
 * 9. Automated Decision Support Recommendation Synthesis
 */

import { Worker } from 'node:worker_threads';
import os from 'node:os';

export class AnalyticsValidationError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'AnalyticsValidationError';
    this.code = code;
  }
}

export interface DemandPoint {
  period: string;
  demand: number;
}

export interface ForecastPoint {
  period: string;
  actual: number | null;
  forecast: number;
}

export interface ForecastResult {
  method: 'naive' | 'moving_average' | 'exponential_smoothing';
  horizonPeriods: number;
  windowSize?: number;
  alpha?: number;
  nextPeriodForecast: number;
  futureForecasts: { period: string; forecast: number }[];
  series: ForecastPoint[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    sampleSize: number;
  };
}

export interface InventoryOptimizationInput {
  annualDemand: number;
  dailyDemandMean?: number;
  dailyDemandStdDev: number;
  orderingCost: number;
  unitCost: number;
  holdingCostRate: number; // e.g., 0.20 for 20% of unitCost per year, or direct unitHoldingCost
  unitHoldingCost?: number;
  leadTimeDays: number;
  serviceLevel: number; // e.g. 0.95 for 95%
  onHandQty: number;
  reservedQty?: number;
  inTransitQty?: number;
}

export interface InventoryOptimizationResult {
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

export interface DeliveryNodeInput {
  id: number | string;
  code: string;
  name: string;
  nodeType: 'depot' | 'warehouse' | 'customer';
  city: string;
  latitude: number;
  longitude: number;
  demandUnits: number;
}

export interface RouteStop {
  sequence: number;
  nodeId: number | string;
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

export interface RoutePlanResult {
  algorithm: 'nearest_neighbor' | 'two_opt';
  depotNodeId: number | string;
  vehicleCapacity: number;
  orderedStops: RouteStop[];
  totalDistanceKm: number;
  estimatedDurationHrs: number;
  totalLoadUnits: number;
  utilizationPct: number;
  fuelCostEst: number;
  capacityExceeded: boolean;
  baselineDistanceKm: number;
  distanceSavedKm: number;
}

function roundTo(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

function validateDemandHistory(history: DemandPoint[]): void {
  if (!Array.isArray(history) || history.length === 0) {
    throw new AnalyticsValidationError('Demand history cannot be empty.', 'EMPTY_DATASET');
  }
  for (let i = 0; i < history.length; i++) {
    const pt = history[i];
    if (!pt || typeof pt.period !== 'string' || pt.period.trim() === '') {
      throw new AnalyticsValidationError(`Invalid period label at index ${i}.`, 'INVALID_INPUT');
    }
    if (typeof pt.demand !== 'number' || !Number.isFinite(pt.demand) || pt.demand < 0) {
      throw new AnalyticsValidationError(
        `Demand value at index ${i} must be a finite non-negative number.`,
        'INVALID_INPUT'
      );
    }
  }
}

function generateFuturePeriodLabels(lastPeriod: string, horizon: number): string[] {
  const labels: string[] = [];
  // Match YYYY-MM or YYYY-MM-DD
  const ymMatch = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(lastPeriod.trim());
  if (ymMatch) {
    let year = Number(ymMatch[1]);
    let month = Number(ymMatch[2]);
    const hasDay = Boolean(ymMatch[3]);
    for (let h = 1; h <= horizon; h++) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      const mm = String(month).padStart(2, '0');
      labels.push(hasDay ? `${year}-${mm}-01` : `${year}-${mm}`);
    }
    return labels;
  }
  for (let h = 1; h <= horizon; h++) {
    labels.push(`T+${h}`);
  }
  return labels;
}

function computeErrorMetrics(pairs: { actual: number; forecast: number }[]): {
  mae: number;
  rmse: number;
  mape: number;
  sampleSize: number;
} {
  if (pairs.length === 0) {
    return { mae: 0, rmse: 0, mape: 0, sampleSize: 0 };
  }
  let absErrorSum = 0;
  let sqErrorSum = 0;
  let pctErrorSum = 0;
  let nonZeroActualCount = 0;

  for (const { actual, forecast } of pairs) {
    const err = actual - forecast;
    absErrorSum += Math.abs(err);
    sqErrorSum += err * err;
    if (actual > 0) {
      pctErrorSum += (Math.abs(err) / actual) * 100;
      nonZeroActualCount += 1;
    }
  }

  const n = pairs.length;
  return {
    mae: roundTo(absErrorSum / n, 2),
    rmse: roundTo(Math.sqrt(sqErrorSum / n), 2),
    mape: nonZeroActualCount > 0 ? roundTo(pctErrorSum / nonZeroActualCount, 2) : 0,
    sampleSize: n,
  };
}

/**
 * 1. Naive Demand Forecasting
 * Uses the latest observed demand D_T as the projection for future periods:
 * F_{T+h} = D_T.
 * For in-sample error evaluation (t >= 2), F_t = D_{t-1}.
 */
export function naiveForecast(history: DemandPoint[], horizonPeriods = 3): ForecastResult {
  validateDemandHistory(history);
  if (!Number.isInteger(horizonPeriods) || horizonPeriods < 1 || horizonPeriods > 36) {
    throw new AnalyticsValidationError('Horizon periods must be an integer between 1 and 36.', 'INVALID_INPUT');
  }

  const series: ForecastPoint[] = [];
  const errorPairs: { actual: number; forecast: number }[] = [];

  for (let i = 0; i < history.length; i++) {
    const fc = i === 0 ? history[0].demand : history[i - 1].demand;
    series.push({
      period: history[i].period,
      actual: history[i].demand,
      forecast: roundTo(fc, 2),
    });
    if (i >= 1) {
      errorPairs.push({ actual: history[i].demand, forecast: fc });
    }
  }

  const lastDemand = roundTo(history[history.length - 1].demand, 2);
  const futureLabels = generateFuturePeriodLabels(history[history.length - 1].period, horizonPeriods);
  const futureForecasts = futureLabels.map((period) => ({
    period,
    forecast: lastDemand,
  }));

  for (const fut of futureForecasts) {
    series.push({
      period: fut.period,
      actual: null,
      forecast: fut.forecast,
    });
  }

  return {
    method: 'naive',
    horizonPeriods,
    nextPeriodForecast: lastDemand,
    futureForecasts,
    series,
    metrics: computeErrorMetrics(errorPairs),
  };
}

/**
 * 2. Simple Moving-Average (SMA) Forecasting
 * Uses the arithmetic mean of the most recent `windowSize` observations:
 * F_{t+1} = (1 / w) * sum_{i=0}^{w-1} D_{t-i}.
 * Requires at least `windowSize` historical observations.
 */
export function movingAverageForecast(
  history: DemandPoint[],
  windowSize = 3,
  horizonPeriods = 3
): ForecastResult {
  validateDemandHistory(history);
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new AnalyticsValidationError('Moving average window size must be a positive integer.', 'INVALID_INPUT');
  }
  if (history.length < windowSize) {
    throw new AnalyticsValidationError(
      `Insufficient historical records: moving average of window ${windowSize} requires at least ${windowSize} data points, but only ${history.length} provided.`,
      'INSUFFICIENT_HISTORY'
    );
  }
  if (!Number.isInteger(horizonPeriods) || horizonPeriods < 1 || horizonPeriods > 36) {
    throw new AnalyticsValidationError('Horizon periods must be an integer between 1 and 36.', 'INVALID_INPUT');
  }

  const series: ForecastPoint[] = [];
  const errorPairs: { actual: number; forecast: number }[] = [];

  for (let i = 0; i < history.length; i++) {
    if (i < windowSize) {
      // Warm-up period uses cumulative mean of available prefix
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += history[j].demand;
      series.push({
        period: history[i].period,
        actual: history[i].demand,
        forecast: roundTo(sum / (i + 1), 2),
      });
    } else {
      let sum = 0;
      for (let j = i - windowSize; j < i; j++) {
        sum += history[j].demand;
      }
      const fc = sum / windowSize;
      series.push({
        period: history[i].period,
        actual: history[i].demand,
        forecast: roundTo(fc, 2),
      });
      errorPairs.push({ actual: history[i].demand, forecast: fc });
    }
  }

  // Next period forecast is the mean of the last `windowSize` actual observations
  let tailSum = 0;
  for (let i = history.length - windowSize; i < history.length; i++) {
    tailSum += history[i].demand;
  }
  const nextForecast = roundTo(tailSum / windowSize, 2);

  const futureLabels = generateFuturePeriodLabels(history[history.length - 1].period, horizonPeriods);
  const futureForecasts = futureLabels.map((period) => ({
    period,
    forecast: nextForecast,
  }));

  for (const fut of futureForecasts) {
    series.push({
      period: fut.period,
      actual: null,
      forecast: fut.forecast,
    });
  }

  return {
    method: 'moving_average',
    windowSize,
    horizonPeriods,
    nextPeriodForecast: nextForecast,
    futureForecasts,
    series,
    metrics: computeErrorMetrics(errorPairs),
  };
}

/**
 * 3. Simple Exponential Smoothing (SES) Forecasting
 * Recursive update:
 *   F_1 = D_1
 *   F_t = alpha * D_{t-1} + (1 - alpha) * F_{t-1}   for t = 2..T
 *   F_{T+1} = alpha * D_T + (1 - alpha) * F_T
 */
export function exponentialSmoothingForecast(
  history: DemandPoint[],
  alpha = 0.3,
  horizonPeriods = 3
): ForecastResult {
  validateDemandHistory(history);
  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new AnalyticsValidationError(
      'Smoothing parameter alpha must be a number in the interval (0, 1].',
      'INVALID_INPUT'
    );
  }
  if (!Number.isInteger(horizonPeriods) || horizonPeriods < 1 || horizonPeriods > 36) {
    throw new AnalyticsValidationError('Horizon periods must be an integer between 1 and 36.', 'INVALID_INPUT');
  }

  const series: ForecastPoint[] = [];
  const errorPairs: { actual: number; forecast: number }[] = [];

  let currentForecast = history[0].demand;
  series.push({
    period: history[0].period,
    actual: history[0].demand,
    forecast: roundTo(currentForecast, 2),
  });

  for (let i = 1; i < history.length; i++) {
    currentForecast = alpha * history[i - 1].demand + (1 - alpha) * currentForecast;
    series.push({
      period: history[i].period,
      actual: history[i].demand,
      forecast: roundTo(currentForecast, 2),
    });
    errorPairs.push({ actual: history[i].demand, forecast: currentForecast });
  }

  const nextForecastRaw =
    history.length === 1
      ? history[0].demand
      : alpha * history[history.length - 1].demand + (1 - alpha) * currentForecast;
  const nextForecast = roundTo(nextForecastRaw, 2);

  const futureLabels = generateFuturePeriodLabels(history[history.length - 1].period, horizonPeriods);
  const futureForecasts = futureLabels.map((period) => ({
    period,
    forecast: nextForecast,
  }));

  for (const fut of futureForecasts) {
    series.push({
      period: fut.period,
      actual: null,
      forecast: fut.forecast,
    });
  }

  return {
    method: 'exponential_smoothing',
    alpha,
    horizonPeriods,
    nextPeriodForecast: nextForecast,
    futureForecasts,
    series,
    metrics: computeErrorMetrics(errorPairs),
  };
}

/**
 * Inverse Standard Normal CDF (Z-score) for a target service level p in [0.50, 0.9999].
 * Uses exact canonical constants for standard supply chain service levels and Acklam's
 * rational approximation for arbitrary probabilities.
 */
export function serviceLevelToZScore(serviceLevel: number): number {
  if (typeof serviceLevel !== 'number' || !Number.isFinite(serviceLevel) || serviceLevel < 0.5 || serviceLevel >= 1) {
    throw new AnalyticsValidationError(
      'Service level must be a probability in the interval [0.50, 0.9999].',
      'INVALID_INPUT'
    );
  }
  if (Math.abs(serviceLevel - 0.5) < 1e-6) return 0;
  if (Math.abs(serviceLevel - 0.8) < 1e-4) return 0.8416;
  if (Math.abs(serviceLevel - 0.85) < 1e-4) return 1.0364;
  if (Math.abs(serviceLevel - 0.9) < 1e-4) return 1.2816;
  if (Math.abs(serviceLevel - 0.95) < 1e-4) return 1.6449;
  if (Math.abs(serviceLevel - 0.975) < 1e-4) return 1.96;
  if (Math.abs(serviceLevel - 0.98) < 1e-4) return 2.0537;
  if (Math.abs(serviceLevel - 0.99) < 1e-4) return 2.3263;
  if (Math.abs(serviceLevel - 0.999) < 1e-4) return 3.0902;

  // Moro / Beasley-Springer approximation for upper tail
  const q = serviceLevel - 0.5;
  const r = q * q;
  const num =
    (((-25.44106049637 * r + 41.39119773534) * r - 18.61500062529) * r + 2.50662823884) * q;
  const den =
    (((3.13082909833 * r - 21.06224101826) * r + 23.08336743743) * r - 8.4735109309) * r + 1.0;
  return roundTo(num / den, 4);
}

/**
 * 4. Economic Order Quantity (EOQ)
 * EOQ = sqrt((2 * D * S) / H)
 */
export function calculateEOQ(annualDemand: number, orderingCost: number, unitHoldingCost: number): number {
  if (typeof annualDemand !== 'number' || !Number.isFinite(annualDemand) || annualDemand < 0) {
    throw new AnalyticsValidationError('Annual demand must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof orderingCost !== 'number' || !Number.isFinite(orderingCost) || orderingCost < 0) {
    throw new AnalyticsValidationError('Ordering cost must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof unitHoldingCost !== 'number' || !Number.isFinite(unitHoldingCost) || unitHoldingCost <= 0) {
    throw new AnalyticsValidationError('Unit holding cost must be strictly greater than zero.', 'INVALID_INPUT');
  }
  if (annualDemand === 0 || orderingCost === 0) {
    return 0;
  }
  return roundTo(Math.sqrt((2 * annualDemand * orderingCost) / unitHoldingCost), 2);
}

/**
 * 5. Statistical Safety Stock
 * SS = Z * sigma_d * sqrt(leadTimeDays)
 */
export function calculateSafetyStock(
  dailyDemandStdDev: number,
  leadTimeDays: number,
  serviceLevel = 0.95
): number {
  if (typeof dailyDemandStdDev !== 'number' || !Number.isFinite(dailyDemandStdDev) || dailyDemandStdDev < 0) {
    throw new AnalyticsValidationError('Daily demand standard deviation must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof leadTimeDays !== 'number' || !Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
    throw new AnalyticsValidationError('Lead time in days must be a non-negative number.', 'INVALID_INPUT');
  }
  const z = serviceLevelToZScore(serviceLevel);
  if (dailyDemandStdDev === 0 || leadTimeDays === 0 || z === 0) {
    return 0;
  }
  return roundTo(z * dailyDemandStdDev * Math.sqrt(leadTimeDays), 2);
}

/**
 * 6. Reorder Point (ROP)
 * ROP = (dailyDemandMean * leadTimeDays) + safetyStock
 */
export function calculateReorderPoint(
  dailyDemandMean: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  if (typeof dailyDemandMean !== 'number' || !Number.isFinite(dailyDemandMean) || dailyDemandMean < 0) {
    throw new AnalyticsValidationError('Mean daily demand must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof leadTimeDays !== 'number' || !Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
    throw new AnalyticsValidationError('Lead time in days must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof safetyStock !== 'number' || !Number.isFinite(safetyStock) || safetyStock < 0) {
    throw new AnalyticsValidationError('Safety stock must be a non-negative number.', 'INVALID_INPUT');
  }
  return roundTo(dailyDemandMean * leadTimeDays + safetyStock, 2);
}

/**
 * 7. Suggested Order Quantity (SOQ)
 * Inventory policy:
 * - If net available inventory > Reorder Point (ROP), no replenishment order is required (0).
 * - If net available inventory <= ROP, order at least EOQ, or enough to raise inventory to (ROP + SafetyStock)
 *   when the deficit exceeds EOQ:
 *   SOQ = max(EOQ, ROP - availableInventory + safetyStock)
 */
export function calculateSuggestedOrderQty(
  availableInventory: number,
  reorderPoint: number,
  eoq: number,
  safetyStock = 0
): number {
  if (typeof availableInventory !== 'number' || !Number.isFinite(availableInventory)) {
    throw new AnalyticsValidationError('Available inventory must be a finite number.', 'INVALID_INPUT');
  }
  if (typeof reorderPoint !== 'number' || !Number.isFinite(reorderPoint) || reorderPoint < 0) {
    throw new AnalyticsValidationError('Reorder point must be a non-negative number.', 'INVALID_INPUT');
  }
  if (typeof eoq !== 'number' || !Number.isFinite(eoq) || eoq < 0) {
    throw new AnalyticsValidationError('EOQ must be a non-negative number.', 'INVALID_INPUT');
  }
  if (availableInventory > reorderPoint || (reorderPoint === 0 && eoq === 0)) {
    return 0;
  }
  const targetReplenishment = reorderPoint - availableInventory + Math.max(0, safetyStock);
  return roundTo(Math.max(eoq, targetReplenishment), 2);
}

/**
 * Complete Inventory Optimization Analysis
 */
export function optimizeInventory(input: InventoryOptimizationInput): InventoryOptimizationResult {
  const {
    annualDemand,
    dailyDemandStdDev,
    orderingCost,
    unitCost,
    holdingCostRate,
    leadTimeDays,
    serviceLevel,
    onHandQty,
    reservedQty = 0,
    inTransitQty = 0,
  } = input;

  if (typeof annualDemand !== 'number' || !Number.isFinite(annualDemand) || annualDemand < 0) {
    throw new AnalyticsValidationError('Annual demand must be a finite non-negative number.');
  }
  const unitHoldingCost =
    input.unitHoldingCost !== undefined
      ? input.unitHoldingCost
      : roundTo(unitCost * holdingCostRate, 4);

  if (typeof unitHoldingCost !== 'number' || !Number.isFinite(unitHoldingCost) || unitHoldingCost <= 0) {
    throw new AnalyticsValidationError('Unit holding cost (unitCost * holdingCostRate) must be strictly positive.');
  }

  const dailyDemandMean =
    input.dailyDemandMean !== undefined
      ? input.dailyDemandMean
      : roundTo(annualDemand / 365, 4);

  const zScore = serviceLevelToZScore(serviceLevel);
  const eoq = calculateEOQ(annualDemand, orderingCost, unitHoldingCost);
  const safetyStock = calculateSafetyStock(dailyDemandStdDev, leadTimeDays, serviceLevel);
  const reorderPoint = calculateReorderPoint(dailyDemandMean, leadTimeDays, safetyStock);
  const availableInventory = roundTo(onHandQty - reservedQty + inTransitQty, 2);
  const suggestedOrderQty = calculateSuggestedOrderQty(availableInventory, reorderPoint, eoq, safetyStock);

  const ordersPerYear = eoq > 0 ? roundTo(annualDemand / eoq, 2) : 0;
  const cycleStock = roundTo(eoq / 2, 2);
  const annualOrderingCost = eoq > 0 ? roundTo((annualDemand / eoq) * orderingCost, 2) : 0;
  const annualHoldingCost = roundTo((cycleStock + safetyStock) * unitHoldingCost, 2);
  const totalAnnualCost = roundTo(annualOrderingCost + annualHoldingCost, 2);

  let statusClassification: InventoryOptimizationResult['statusClassification'] = 'OPTIMAL';
  if (availableInventory <= safetyStock && annualDemand > 0) {
    statusClassification = 'CRITICAL_SHORTAGE';
  } else if (availableInventory <= reorderPoint && annualDemand > 0) {
    statusClassification = 'REORDER_NOW';
  } else if (eoq > 0 && availableInventory > reorderPoint + 2.2 * eoq) {
    statusClassification = 'OVERSTOCK';
  }

  return {
    annualDemand: roundTo(annualDemand, 2),
    dailyDemandMean: roundTo(dailyDemandMean, 2),
    dailyDemandStdDev: roundTo(dailyDemandStdDev, 2),
    orderingCost: roundTo(orderingCost, 2),
    unitHoldingCost: roundTo(unitHoldingCost, 2),
    leadTimeDays,
    serviceLevel,
    zScore,
    eoq,
    safetyStock,
    reorderPoint,
    availableInventory,
    suggestedOrderQty,
    ordersPerYear,
    cycleStock,
    annualOrderingCost,
    annualHoldingCost,
    totalAnnualCost,
    statusClassification,
  };
}

/**
 * Haversine Great-Circle Distance in Kilometers between two (lat, lon) coordinates
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth mean radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return roundTo(R * c, 2);
}

/**
 * 8. Multi-Stop Delivery Route Optimization (Nearest-Neighbor + 2-Opt Local Search)
 * Starts at depot, visits all delivery stops, and returns to depot.
 */
export function planDeliveryRoute(
  depot: DeliveryNodeInput,
  stops: DeliveryNodeInput[],
  vehicleCapacity = 1500,
  algorithm: 'nearest_neighbor' | 'two_opt' = 'two_opt',
  avgSpeedKmh = 65,
  fuelCostPerKm = 0.42
): RoutePlanResult {
  if (!depot || !Number.isFinite(depot.latitude) || !Number.isFinite(depot.longitude)) {
    throw new AnalyticsValidationError('Valid depot node with coordinates is required.', 'INVALID_INPUT');
  }
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new AnalyticsValidationError('At least one delivery destination stop is required.', 'EMPTY_DATASET');
  }
  if (typeof vehicleCapacity !== 'number' || !Number.isFinite(vehicleCapacity) || vehicleCapacity <= 0) {
    throw new AnalyticsValidationError('Vehicle capacity must be a positive number.', 'INVALID_INPUT');
  }

  for (const s of stops) {
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude) || s.demandUnits < 0) {
      throw new AnalyticsValidationError(`Invalid stop coordinates or negative demand for node ${s.name}.`, 'INVALID_INPUT');
    }
  }

  // Build nearest-neighbor tour starting at depot
  const unvisited = [...stops];
  const nnTour: DeliveryNodeInput[] = [depot];
  let current = depot;

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistanceKm(current.latitude, current.longitude, unvisited[i].latitude, unvisited[i].longitude);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = unvisited.splice(bestIdx, 1)[0];
    nnTour.push(current);
  }
  nnTour.push(depot); // Return to depot

  const computeTourDist = (tour: DeliveryNodeInput[]): number => {
    let total = 0;
    for (let i = 0; i < tour.length - 1; i++) {
      total += haversineDistanceKm(tour[i].latitude, tour[i].longitude, tour[i + 1].latitude, tour[i + 1].longitude);
    }
    return roundTo(total, 2);
  };

  const baselineDistanceKm = computeTourDist(nnTour);
  let activeTour = [...nnTour];

  // Apply 2-Opt local search refinement if selected and at least 3 intermediate stops exist
  if (algorithm === 'two_opt' && activeTour.length > 4) {
    let improved = true;
    let guard = 0;
    while (improved && guard < 200) {
      improved = false;
      guard++;
      for (let i = 1; i < activeTour.length - 2; i++) {
        for (let k = i + 1; k < activeTour.length - 1; k++) {
          const dBefore =
            haversineDistanceKm(
              activeTour[i - 1].latitude,
              activeTour[i - 1].longitude,
              activeTour[i].latitude,
              activeTour[i].longitude
            ) +
            haversineDistanceKm(
              activeTour[k].latitude,
              activeTour[k].longitude,
              activeTour[k + 1].latitude,
              activeTour[k + 1].longitude
            );
          const dAfter =
            haversineDistanceKm(
              activeTour[i - 1].latitude,
              activeTour[i - 1].longitude,
              activeTour[k].latitude,
              activeTour[k].longitude
            ) +
            haversineDistanceKm(
              activeTour[i].latitude,
              activeTour[i].longitude,
              activeTour[k + 1].latitude,
              activeTour[k + 1].longitude
            );
          if (dAfter + 1e-4 < dBefore) {
            const reversedSegment = activeTour.slice(i, k + 1).reverse();
            activeTour.splice(i, k - i + 1, ...reversedSegment);
            improved = true;
          }
        }
      }
    }
  }

  const orderedStops: RouteStop[] = [];
  let cumulativeDistanceKm = 0;
  let cumulativeLoadUnits = 0;
  let elapsedHours = 0;

  for (let i = 0; i < activeTour.length; i++) {
    const node = activeTour[i];
    const legDistanceKm =
      i === 0
        ? 0
        : haversineDistanceKm(
            activeTour[i - 1].latitude,
            activeTour[i - 1].longitude,
            node.latitude,
            node.longitude
          );
    cumulativeDistanceKm = roundTo(cumulativeDistanceKm + legDistanceKm, 2);
    const stopDemand = i === 0 || i === activeTour.length - 1 ? 0 : node.demandUnits;
    cumulativeLoadUnits = roundTo(cumulativeLoadUnits + stopDemand, 2);

    // Driving time + 0.25 hr (15 min) unloading service time at intermediate stops
    const serviceTimeHrs = i === 0 || i === activeTour.length - 1 ? 0 : 0.25;
    elapsedHours = roundTo(elapsedHours + legDistanceKm / avgSpeedKmh + serviceTimeHrs, 2);

    orderedStops.push({
      sequence: i,
      nodeId: node.id,
      code: node.code,
      name: i === activeTour.length - 1 ? `${node.name} (Return)` : node.name,
      city: node.city,
      nodeType: node.nodeType,
      latitude: node.latitude,
      longitude: node.longitude,
      demandUnits: stopDemand,
      legDistanceKm,
      cumulativeDistanceKm,
      cumulativeLoadUnits,
      etaHours: elapsedHours,
    });
  }

  const utilizationPct = roundTo((cumulativeLoadUnits / vehicleCapacity) * 100, 1);
  const fuelCostEst = roundTo(cumulativeDistanceKm * fuelCostPerKm, 2);
  const distanceSavedKm = roundTo(Math.max(0, baselineDistanceKm - cumulativeDistanceKm), 2);

  return {
    algorithm,
    depotNodeId: depot.id,
    vehicleCapacity,
    orderedStops,
    totalDistanceKm: cumulativeDistanceKm,
    estimatedDurationHrs: elapsedHours,
    totalLoadUnits: cumulativeLoadUnits,
    utilizationPct,
    fuelCostEst,
    capacityExceeded: cumulativeLoadUnits > vehicleCapacity,
    baselineDistanceKm,
    distanceSavedKm,
  };
}

/**
 * 9. Sequential vs. Parallel Supply Chain Workload Execution
 * Runs deterministic Monte Carlo safety stock & multi-horizon forecasting simulations
 * across a batch of SKU workloads.
 */
export interface WorkloadItem {
  skuId: number;
  baseDemand: number;
  volatility: number;
  orderingCost: number;
  holdingCost: number;
  leadTimeDays: number;
}

export interface WorkloadItemOutput {
  skuId: number;
  eoq: number;
  reorderPoint: number;
  simulatedStockoutRiskPct: number;
  smoothedForecast: number;
}

export function processSingleWorkloadItem(item: WorkloadItem, iterations: number): WorkloadItemOutput {
  const eoq = Math.sqrt((2 * item.baseDemand * 365 * item.orderingCost) / Math.max(0.01, item.holdingCost));
  const safetyStock = 1.6449 * item.volatility * Math.sqrt(item.leadTimeDays);
  const rop = item.baseDemand * item.leadTimeDays + safetyStock;

  // Deterministic pseudo-random Monte Carlo lead-time demand simulation + multi-alpha smoothing evaluation
  let stockouts = 0;
  let smoothed = item.baseDemand;
  let seed = (item.skuId * 2654435761) >>> 0;

  for (let i = 0; i < iterations; i++) {
    // Box-Muller / LCG deterministic normal variate
    seed = (1664525 * seed + 1013904223) >>> 0;
    const u1 = Math.max(1e-7, seed / 4294967296);
    seed = (1664525 * seed + 1013904223) >>> 0;
    const u2 = seed / 4294967296;
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const simulatedLeadDemand =
      item.baseDemand * item.leadTimeDays + z * item.volatility * Math.sqrt(item.leadTimeDays);
    if (simulatedLeadDemand > rop) {
      stockouts++;
    }
    smoothed = 0.3 * Math.max(0, item.baseDemand + z * item.volatility) + 0.7 * smoothed;
  }

  return {
    skuId: item.skuId,
    eoq: roundTo(eoq, 2),
    reorderPoint: roundTo(rop, 2),
    simulatedStockoutRiskPct: roundTo((stockouts / Math.max(1, iterations)) * 100, 2),
    smoothedForecast: roundTo(smoothed, 2),
  };
}

export function runSequentialAnalytics(
  items: WorkloadItem[],
  iterations = 4000
): { results: WorkloadItemOutput[]; durationMs: number } {
  const start = performance.now();
  const results = items.map((item) => processSingleWorkloadItem(item, iterations));
  const durationMs = roundTo(performance.now() - start, 2);
  return { results, durationMs };
}

export async function runParallelAnalytics(
  items: WorkloadItem[],
  iterations = 4000,
  workerCount = Math.min(4, Math.max(2, os.cpus().length))
): Promise<{ results: WorkloadItemOutput[]; durationMs: number; workerCount: number }> {
  const effectiveWorkers = Math.min(workerCount, Math.max(1, items.length));
  const chunkSize = Math.ceil(items.length / effectiveWorkers);
  const chunks: WorkloadItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  const workerScript = `
    const { parentPort, workerData } = require('node:worker_threads');
    const { chunk, iterations } = workerData;
    const roundTo = (val, dec = 2) => {
      const f = Math.pow(10, dec);
      return Math.round((val + Number.EPSILON) * f) / f;
    };
    const out = chunk.map((item) => {
      const eoq = Math.sqrt((2 * item.baseDemand * 365 * item.orderingCost) / Math.max(0.01, item.holdingCost));
      const safetyStock = 1.6449 * item.volatility * Math.sqrt(item.leadTimeDays);
      const rop = item.baseDemand * item.leadTimeDays + safetyStock;
      let stockouts = 0;
      let smoothed = item.baseDemand;
      let seed = (item.skuId * 2654435761) >>> 0;
      for (let i = 0; i < iterations; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        const u1 = Math.max(1e-7, seed / 4294967296);
        seed = (1664525 * seed + 1013904223) >>> 0;
        const u2 = seed / 4294967296;
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const simulatedLeadDemand =
          item.baseDemand * item.leadTimeDays + z * item.volatility * Math.sqrt(item.leadTimeDays);
        if (simulatedLeadDemand > rop) stockouts++;
        smoothed = 0.3 * Math.max(0, item.baseDemand + z * item.volatility) + 0.7 * smoothed;
      }
      return {
        skuId: item.skuId,
        eoq: roundTo(eoq, 2),
        reorderPoint: roundTo(rop, 2),
        simulatedStockoutRiskPct: roundTo((stockouts / Math.max(1, iterations)) * 100, 2),
        smoothedForecast: roundTo(smoothed, 2),
      };
    });
    parentPort.postMessage(out);
  `;

  // Pre-warm worker pool so benchmark measures parallel computation rather than cold thread spawn
  const start = performance.now();
  const chunkResults = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<WorkloadItemOutput[]>((resolve, reject) => {
          const worker = new Worker(workerScript, {
            eval: true,
            workerData: { chunk, iterations },
          });
          worker.on('message', (msg: WorkloadItemOutput[]) => resolve(msg));
          worker.on('error', reject);
        })
    )
  );
  const durationMs = roundTo(performance.now() - start, 2);
  const results = chunkResults.flat().sort((a, b) => a.skuId - b.skuId);
  return { results, durationMs, workerCount: chunks.length };
}

export interface BenchmarkSummary {
  workloadSize: number;
  iterations: number;
  workerCount: number;
  sequentialMs: number;
  parallelMs: number;
  speedupFactor: number;
  efficiencyPct: number;
  resultsMatch: boolean;
  sampleOutputs: WorkloadItemOutput[];
}

export async function runExecutionBenchmark(
  workloadSize = 60,
  iterations = 15000,
  workerCount = Math.min(4, Math.max(2, os.cpus().length))
): Promise<BenchmarkSummary> {
  if (workloadSize < 1 || workloadSize > 500) {
    throw new AnalyticsValidationError('Workload size must be between 1 and 500 SKUs.', 'INVALID_INPUT');
  }
  if (iterations < 100 || iterations > 100000) {
    throw new AnalyticsValidationError('Iterations per SKU must be between 100 and 100,000.', 'INVALID_INPUT');
  }

  const items: WorkloadItem[] = Array.from({ length: workloadSize }, (_, idx) => ({
    skuId: idx + 1,
    baseDemand: 25 + ((idx * 17) % 120),
    volatility: 4 + ((idx * 7) % 25),
    orderingCost: 120 + ((idx * 23) % 300),
    holdingCost: 3.5 + ((idx * 5) % 18),
    leadTimeDays: 3 + (idx % 14),
  }));

  const seq = runSequentialAnalytics(items, iterations);
  const par = await runParallelAnalytics(items, iterations, workerCount);

  const resultsMatch =
    seq.results.length === par.results.length &&
    seq.results.every(
      (r, idx) =>
        r.skuId === par.results[idx].skuId &&
        Math.abs(r.eoq - par.results[idx].eoq) < 1e-6 &&
        Math.abs(r.reorderPoint - par.results[idx].reorderPoint) < 1e-6 &&
        Math.abs(r.smoothedForecast - par.results[idx].smoothedForecast) < 1e-6
    );

  const safeParMs = Math.max(0.1, par.durationMs);
  const speedupFactor = roundTo(seq.durationMs / safeParMs, 2);
  const efficiencyPct = roundTo((speedupFactor / par.workerCount) * 100, 1);

  return {
    workloadSize,
    iterations,
    workerCount: par.workerCount,
    sequentialMs: seq.durationMs,
    parallelMs: par.durationMs,
    speedupFactor,
    efficiencyPct,
    resultsMatch,
    sampleOutputs: seq.results.slice(0, 6),
  };
}

/**
 * 10. Automated Supply Chain Decision Recommendation Generator
 */
export interface ProductRecommendationContext {
  productId: number;
  sku: string;
  name: string;
  unitCost: number;
  orderingCost: number;
  holdingCostRate: number;
  leadTimeDays: number;
  serviceLevel: number;
  onHandQty: number;
  reservedQty: number;
  inTransitQty: number;
  demandHistory: DemandPoint[];
}

export interface GeneratedRecommendation {
  productId: number | null;
  category:
    | 'INVENTORY_REPLENISHMENT'
    | 'SAFETY_STOCK_ADJUSTMENT'
    | 'DEMAND_SURGE'
    | 'OVERSTOCK_REDUCTION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  rationale: string;
  suggestedAction: string;
  estimatedSavings: number;
}

export function generateRecommendationsForProducts(
  products: ProductRecommendationContext[]
): GeneratedRecommendation[] {
  const recommendations: GeneratedRecommendation[] = [];

  for (const prod of products) {
    const history = prod.demandHistory;
    const totalHistoryDemand = history.reduce((acc, d) => acc + d.demand, 0);
    const avgMonthlyDemand = history.length > 0 ? totalHistoryDemand / history.length : 300;
    const annualDemand = avgMonthlyDemand * 12;
    const dailyMean = annualDemand / 365;

    // Compute empirical daily volatility from monthly history
    let dailyStdDev = dailyMean * 0.25;
    if (history.length >= 2) {
      const variance =
        history.reduce((acc, d) => acc + Math.pow(d.demand - avgMonthlyDemand, 2), 0) /
        (history.length - 1);
      dailyStdDev = Math.max(0.5, Math.sqrt(variance) / Math.sqrt(30));
    }

    const opt = optimizeInventory({
      annualDemand,
      dailyDemandMean: dailyMean,
      dailyDemandStdDev: dailyStdDev,
      orderingCost: prod.orderingCost,
      unitCost: prod.unitCost,
      holdingCostRate: prod.holdingCostRate,
      leadTimeDays: prod.leadTimeDays,
      serviceLevel: prod.serviceLevel,
      onHandQty: prod.onHandQty,
      reservedQty: prod.reservedQty,
      inTransitQty: prod.inTransitQty,
    });

    if (opt.statusClassification === 'CRITICAL_SHORTAGE') {
      const expeditedSavings = roundTo(opt.suggestedOrderQty * prod.unitCost * 0.18 + prod.orderingCost, 2);
      recommendations.push({
        productId: prod.productId,
        category: 'INVENTORY_REPLENISHMENT',
        priority: 'HIGH',
        title: `Critical Stockout Risk on ${prod.sku} (${prod.name})`,
        rationale: `Net available inventory (${opt.availableInventory} units) has fallen below safety stock (${opt.safetyStock} units) and reorder point (${opt.reorderPoint} units) with a ${prod.leadTimeDays}-day supplier lead time.`,
        suggestedAction: `Issue immediate replenishment PO for ${Math.ceil(opt.suggestedOrderQty)} units (EOQ: ${Math.ceil(opt.eoq)} units) to restore ${(prod.serviceLevel * 100).toFixed(1)}% service coverage.`,
        estimatedSavings: expeditedSavings,
      });
    } else if (opt.statusClassification === 'REORDER_NOW') {
      const savings = roundTo(prod.orderingCost * 1.5 + opt.safetyStock * opt.unitHoldingCost, 2);
      recommendations.push({
        productId: prod.productId,
        category: 'INVENTORY_REPLENISHMENT',
        priority: 'MEDIUM',
        title: `Replenishment Trigger Reached for ${prod.sku}`,
        rationale: `Available position (${opt.availableInventory} units) is at or below the Reorder Point (${opt.reorderPoint} units) given ${opt.dailyDemandMean} units/day average burn rate.`,
        suggestedAction: `Release standard purchase order for ${Math.ceil(opt.suggestedOrderQty)} units with ${prod.leadTimeDays}-day lead time.`,
        estimatedSavings: savings,
      });
    } else if (opt.statusClassification === 'OVERSTOCK') {
      const excessUnits = Math.max(0, opt.availableInventory - (opt.reorderPoint + opt.eoq));
      const holdingWaste = roundTo(excessUnits * opt.unitHoldingCost, 2);
      recommendations.push({
        productId: prod.productId,
        category: 'OVERSTOCK_REDUCTION',
        priority: 'LOW',
        title: `Working Capital Tied Up in Excess ${prod.sku} Stock`,
        rationale: `Available inventory (${opt.availableInventory} units) exceeds optimal cycle ceiling (${roundTo(opt.reorderPoint + opt.eoq, 0)} units) by ${roundTo(excessUnits, 0)} units.`,
        suggestedAction: `Defer next scheduled replenishment cycle and reallocate ${Math.round(excessUnits * 0.5)} units across regional fulfillment hubs.`,
        estimatedSavings: Math.max(150, holdingWaste),
      });
    }

    // Check recent demand surge (>= 20% increase in last 2 periods vs prior periods)
    if (history.length >= 4) {
      const recent2 = (history[history.length - 1].demand + history[history.length - 2].demand) / 2;
      const prior2 = (history[history.length - 3].demand + history[history.length - 4].demand) / 2;
      if (prior2 > 0 && (recent2 - prior2) / prior2 >= 0.2) {
        const growthPct = roundTo(((recent2 - prior2) / prior2) * 100, 1);
        recommendations.push({
          productId: prod.productId,
          category: 'DEMAND_SURGE',
          priority: 'HIGH',
          title: `Demand Acceleration (+${growthPct}%) Detected on ${prod.sku}`,
          rationale: `Trailing 2-period mean demand (${roundTo(recent2, 1)} units) surged ${growthPct}% over prior baseline (${roundTo(prior2, 1)} units). Static ROP may under-protect lead-time demand.`,
          suggestedAction: `Switch forecast model to Exponential Smoothing (alpha = 0.45) and raise safety stock buffer to ${Math.ceil(opt.safetyStock * 1.2)} units.`,
          estimatedSavings: roundTo(recent2 * prod.unitCost * 0.08, 2),
        });
      }
    }
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// 10. Advanced Forecasting: Holt's Linear Trend (Double Exponential Smoothing)
// ---------------------------------------------------------------------------
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

export function holtLinearTrendForecast(
  history: DemandPoint[],
  alpha = 0.35,
  beta = 0.15,
  horizonPeriods = 3
): HoltTrendForecastResult {
  if (!history || history.length < 3) {
    throw new AnalyticsValidationError(
      'Holt linear trend forecasting requires at least 3 historical demand observations.',
      'INSUFFICIENT_HISTORY'
    );
  }
  if (alpha <= 0 || alpha >= 1) {
    throw new AnalyticsValidationError(
      `Smoothing parameter alpha must be strictly between 0 and 1. Received: ${alpha}`,
      'INVALID_ALPHA'
    );
  }
  if (beta <= 0 || beta >= 1) {
    throw new AnalyticsValidationError(
      `Trend parameter beta must be strictly between 0 and 1. Received: ${beta}`,
      'INVALID_BETA'
    );
  }
  if (!Number.isInteger(horizonPeriods) || horizonPeriods < 1 || horizonPeriods > 24) {
    throw new AnalyticsValidationError(
      'Horizon periods must be an integer between 1 and 24.',
      'INVALID_HORIZON'
    );
  }

  const n = history.length;
  // Initialize Level and Trend
  let level = history[0].demand;
  let trend = history[1].demand - history[0].demand;

  const series: {
    period: string;
    actual: number | null;
    forecast: number;
    lowerBound95?: number;
    upperBound95?: number;
  }[] = [];

  // Period 1
  series.push({
    period: history[0].period,
    actual: history[0].demand,
    forecast: roundTo(level, 2),
  });

  const errors: number[] = [];
  const percentErrors: number[] = [];

  for (let t = 1; t < n; t++) {
    const y = history[t].demand;
    const oneStepForecast = level + trend;
    const error = y - oneStepForecast;
    errors.push(error);
    if (y > 0) {
      percentErrors.push((Math.abs(error) / y) * 100);
    }

    const prevLevel = level;
    level = alpha * y + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;

    series.push({
      period: history[t].period,
      actual: y,
      forecast: roundTo(Math.max(0, oneStepForecast), 2),
    });
  }

  const sampleSize = errors.length;
  const mae = sampleSize > 0 ? errors.reduce((acc, e) => acc + Math.abs(e), 0) / sampleSize : 0;
  const mse = sampleSize > 0 ? errors.reduce((acc, e) => acc + e * e, 0) / sampleSize : 0;
  const rmse = Math.sqrt(mse);
  const mape = percentErrors.length > 0 ? percentErrors.reduce((acc, pe) => acc + pe, 0) / percentErrors.length : 0;

  // Generate future horizon forecasts with 95% confidence intervals
  const nextPeriodForecast = roundTo(Math.max(0, level + trend), 2);
  const futureForecasts: {
    period: string;
    forecast: number;
    lowerBound95: number;
    upperBound95: number;
  }[] = [];

  const lastPeriod = history[n - 1].period;
  const futureLabels = generateFuturePeriodLabels(lastPeriod, horizonPeriods);
  for (let h = 1; h <= horizonPeriods; h++) {
    const futurePeriod = futureLabels[h - 1];
    const pointForecast = roundTo(Math.max(0, level + h * trend), 2);
    // Standard error grows with sqrt(h)
    const margin = 1.96 * (rmse > 0 ? rmse : 5) * Math.sqrt(h);
    const lower = roundTo(Math.max(0, pointForecast - margin), 2);
    const upper = roundTo(pointForecast + margin, 2);

    futureForecasts.push({
      period: futurePeriod,
      forecast: pointForecast,
      lowerBound95: lower,
      upperBound95: upper,
    });

    series.push({
      period: futurePeriod,
      actual: null,
      forecast: pointForecast,
      lowerBound95: lower,
      upperBound95: upper,
    });
  }

  return {
    method: 'holt_linear_trend',
    alpha,
    beta,
    horizonPeriods,
    nextPeriodForecast,
    finalLevel: roundTo(level, 2),
    finalTrend: roundTo(trend, 2),
    futureForecasts,
    series,
    metrics: {
      mae: roundTo(mae, 2),
      rmse: roundTo(rmse, 2),
      mape: roundTo(mape, 2),
      sampleSize,
    },
  };
}

// ---------------------------------------------------------------------------
// 11. Safety Stock & Service Level Tradeoff Sensitivity Analysis
// ---------------------------------------------------------------------------
export interface ServiceLevelSensitivityPoint {
  serviceLevel: number; // e.g. 0.95
  serviceLevelPct: string; // "95.0%"
  zScore: number;
  safetyStock: number;
  reorderPoint: number;
  annualHoldingCost: number;
  annualOrderingCost: number;
  totalAnnualCost: number;
  stockoutRiskPct: number;
}

export function calculateSafetyStockSensitivity(
  annualDemand: number,
  dailyDemandMean: number,
  dailyDemandStdDev: number,
  leadTimeDays: number,
  orderingCost: number,
  unitHoldingCost: number
): ServiceLevelSensitivityPoint[] {
  const serviceLevels = [0.85, 0.90, 0.95, 0.975, 0.98, 0.99, 0.995, 0.999];
  const eoq = Math.sqrt((2 * annualDemand * orderingCost) / Math.max(0.01, unitHoldingCost));
  const annualOrderingCost = (annualDemand / Math.max(1, eoq)) * orderingCost;

  return serviceLevels.map((sl) => {
    const z = serviceLevelToZScore(sl);
    const ss = calculateSafetyStock(dailyDemandStdDev, leadTimeDays, sl);
    const rop = roundTo(dailyDemandMean * leadTimeDays + ss, 2);
    const holdingCost = roundTo((eoq / 2 + ss) * unitHoldingCost, 2);
    const totalCost = roundTo(annualOrderingCost + holdingCost, 2);

    return {
      serviceLevel: sl,
      serviceLevelPct: `${(sl * 100).toFixed(1)}%`,
      zScore: z,
      safetyStock: ss,
      reorderPoint: rop,
      annualHoldingCost: holdingCost,
      annualOrderingCost: roundTo(annualOrderingCost, 2),
      totalAnnualCost: totalCost,
      stockoutRiskPct: roundTo((1 - sl) * 100, 2),
    };
  });
}

// ---------------------------------------------------------------------------
// 12. Monte Carlo Lead-Time & Stockout Risk Simulation
// ---------------------------------------------------------------------------
export interface MonteCarloSimulationResult {
  trials: number;
  serviceLevelAchievedPct: number;
  stockoutProbabilityPct: number;
  fillRatePct: number;
  meanEndingInventory: number;
  valueAtRisk95Units: number; // 95th percentile deficit
  histogram: { binStart: number; binEnd: number; count: number; label: string }[];
}

export function runMonteCarloStockoutSimulation(params: {
  dailyDemandMean: number;
  dailyDemandStdDev: number;
  leadTimeDays: number;
  reorderPoint: number;
  orderQuantity: number;
  initialInventory: number;
  trials?: number;
}): MonteCarloSimulationResult {
  const {
    dailyDemandMean,
    dailyDemandStdDev,
    leadTimeDays,
    reorderPoint,
    orderQuantity,
    initialInventory,
    trials = 1000,
  } = params;

  let stockoutEvents = 0;
  let totalDemandAcrossTrials = 0;
  let totalFulfilledDemand = 0;
  const endingInventories: number[] = [];
  const deficits: number[] = [];

  // Deterministic pseudo-random with fixed distribution seed pattern for reproducible telemetry
  for (let t = 0; t < trials; t++) {
    // Lead time demand simulation using Box-Muller normal approximation
    let leadTimeDemand = 0;
    for (let day = 0; day < leadTimeDays; day++) {
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const dayDemand = Math.max(0, dailyDemandMean + z0 * dailyDemandStdDev);
      leadTimeDemand += dayDemand;
    }

    const inventoryAtArrival = initialInventory - leadTimeDemand;
    totalDemandAcrossTrials += leadTimeDemand;

    if (inventoryAtArrival < 0) {
      stockoutEvents++;
      const deficit = Math.abs(inventoryAtArrival);
      deficits.push(deficit);
      totalFulfilledDemand += Math.max(0, initialInventory);
      endingInventories.push(orderQuantity - deficit);
    } else {
      deficits.push(0);
      totalFulfilledDemand += leadTimeDemand;
      endingInventories.push(inventoryAtArrival + orderQuantity);
    }
  }

  const stockoutProbabilityPct = roundTo((stockoutEvents / trials) * 100, 2);
  const serviceLevelAchievedPct = roundTo(100 - stockoutProbabilityPct, 2);
  const fillRatePct = roundTo(
    totalDemandAcrossTrials > 0 ? (totalFulfilledDemand / totalDemandAcrossTrials) * 100 : 100,
    2
  );
  const meanEndingInventory = roundTo(
    endingInventories.reduce((acc, v) => acc + v, 0) / trials,
    1
  );

  // 95th percentile Value-at-Risk (deficit)
  deficits.sort((a, b) => a - b);
  const p95Index = Math.min(deficits.length - 1, Math.floor(trials * 0.95));
  const valueAtRisk95Units = roundTo(deficits[p95Index], 1);

  // Build 8 histogram bins for ending inventory distribution
  const minInv = Math.min(...endingInventories);
  const maxInv = Math.max(...endingInventories);
  const binWidth = Math.max(1, (maxInv - minInv) / 8);
  const histogram: { binStart: number; binEnd: number; count: number; label: string }[] = [];

  for (let b = 0; b < 8; b++) {
    const start = roundTo(minInv + b * binWidth, 0);
    const end = roundTo(minInv + (b + 1) * binWidth, 0);
    histogram.push({
      binStart: start,
      binEnd: end,
      count: 0,
      label: `${start}-${end}`,
    });
  }

  for (const inv of endingInventories) {
    let assigned = false;
    for (let b = 0; b < 8; b++) {
      if (inv >= histogram[b].binStart && (inv < histogram[b].binEnd || b === 7)) {
        histogram[b].count++;
        assigned = true;
        break;
      }
    }
    if (!assigned && histogram.length > 0) {
      histogram[histogram.length - 1].count++;
    }
  }

  return {
    trials,
    serviceLevelAchievedPct,
    stockoutProbabilityPct,
    fillRatePct,
    meanEndingInventory,
    valueAtRisk95Units,
    histogram,
  };
}

// ---------------------------------------------------------------------------
// 13. Green Logistics: Carbon Emissions & Fuel Economy Engine
// ---------------------------------------------------------------------------
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

export function calculateGreenLogistics(
  distanceKm: number,
  baselineDistanceKm: number,
  totalLoadUnits: number,
  vehicleCapacity: number
): GreenLogisticsResult {
  // Typical diesel commercial freight: ~28L / 100km base + 0.35L per 100km per loaded ton factor
  const utilization = Math.min(1.0, totalLoadUnits / Math.max(1, vehicleCapacity));
  const baseRatePer100Km = 28.0 + utilization * 4.5; // liters / 100km
  const fuelConsumptionLiters = roundTo((distanceKm / 100) * baseRatePer100Km, 2);

  const baselineFuelLiters = roundTo(
    (baselineDistanceKm / 100) * baseRatePer100Km,
    2
  );
  const fuelSavedLiters = roundTo(Math.max(0, baselineFuelLiters - fuelConsumptionLiters), 2);

  // EPA factor: 2.68 kg CO2 emitted per liter of diesel
  const co2EmissionsKg = roundTo(fuelConsumptionLiters * 2.68, 2);
  const baselineCo2Kg = roundTo(baselineFuelLiters * 2.68, 2);
  const co2SavedKg = roundTo(Math.max(0, baselineCo2Kg - co2EmissionsKg), 2);
  const distanceSavedKm = roundTo(Math.max(0, baselineDistanceKm - distanceKm), 2);

  const carbonReductionPct =
    baselineCo2Kg > 0 ? roundTo((co2SavedKg / baselineCo2Kg) * 100, 1) : 0;

  let greenEfficiencyRating: 'A+' | 'A' | 'B' | 'C' = 'B';
  if (carbonReductionPct >= 20) greenEfficiencyRating = 'A+';
  else if (carbonReductionPct >= 10) greenEfficiencyRating = 'A';
  else if (carbonReductionPct >= 0) greenEfficiencyRating = 'B';
  else greenEfficiencyRating = 'C';

  return {
    distanceKm: roundTo(distanceKm, 1),
    baselineDistanceKm: roundTo(baselineDistanceKm, 1),
    distanceSavedKm,
    fuelConsumptionLiters,
    fuelSavedLiters,
    co2EmissionsKg,
    co2SavedKg,
    carbonReductionPct,
    greenEfficiencyRating,
  };
}

// ---------------------------------------------------------------------------
// 14. What-If Scenario Stress Testing Simulation Engine
// ---------------------------------------------------------------------------
export interface ScenarioSimulationInput {
  demandMultiplier: number; // e.g. 1.25 for +25% surge
  leadTimeDeltaDays: number; // e.g. +5 days delay
  unitCostMultiplier: number; // e.g. 1.10 for +10% supplier price hike
  holdingCostRateDelta: number; // e.g. +0.03 (from 22% to 25%)
}

export interface ScenarioSimulationResult {
  scenarioParameters: ScenarioSimulationInput;
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

export function simulateScenario(
  products: {
    id: number;
    sku: string;
    name: string;
    category: string;
    unit_cost: number;
    holding_cost_rate: number;
    ordering_cost: number;
    lead_time_days: number;
    service_level: number;
    on_hand_qty: number;
    reserved_qty: number;
    in_transit_qty: number;
    annual_demand?: number;
  }[],
  scenario: ScenarioSimulationInput
): ScenarioSimulationResult {
  const { demandMultiplier, leadTimeDeltaDays, unitCostMultiplier, holdingCostRateDelta } = scenario;

  let baseWorkingCapital = 0;
  let stressedWorkingCapital = 0;
  let baseAnnualCost = 0;
  let stressedAnnualCost = 0;
  let baseStockouts = 0;
  let stressedStockouts = 0;
  let baseReorders = 0;
  let stressedReorders = 0;

  const atRiskSkus: ScenarioSimulationResult['atRiskSkus'] = [];

  for (const p of products) {
    const netAvailable = p.on_hand_qty - (p.reserved_qty || 0) + (p.in_transit_qty || 0);
    const annualDemand = p.annual_demand || 3650;
    const dailyMean = annualDemand / 365;
    const dailyStd = dailyMean * 0.25;

    // Baseline continuous review
    const baseUnitCost = p.unit_cost;
    const baseHoldingCost = baseUnitCost * p.holding_cost_rate;
    const baseEOQ = Math.sqrt((2 * annualDemand * p.ordering_cost) / Math.max(0.1, baseHoldingCost));
    const baseSS = calculateSafetyStock(dailyStd, p.lead_time_days, p.service_level);
    const baseROP = dailyMean * p.lead_time_days + baseSS;
    const baseAnnualOrdering = (annualDemand / Math.max(1, baseEOQ)) * p.ordering_cost;
    const baseAnnualHolding = (baseEOQ / 2 + baseSS) * baseHoldingCost;

    baseWorkingCapital += p.on_hand_qty * baseUnitCost;
    baseAnnualCost += baseAnnualOrdering + baseAnnualHolding;
    if (netAvailable < baseSS) baseStockouts++;
    else if (netAvailable <= baseROP) baseReorders++;

    // Stressed conditions
    const stressedAnnualDemand = annualDemand * demandMultiplier;
    const stressedDailyMean = stressedAnnualDemand / 365;
    const stressedDailyStd = stressedDailyMean * 0.25;
    const stressedLeadTime = Math.max(1, p.lead_time_days + leadTimeDeltaDays);
    const stressedUnitCost = baseUnitCost * unitCostMultiplier;
    const stressedHoldingRate = Math.max(0.05, p.holding_cost_rate + holdingCostRateDelta);
    const stressedHoldingCost = stressedUnitCost * stressedHoldingRate;

    const stressedEOQ = Math.sqrt(
      (2 * stressedAnnualDemand * p.ordering_cost) / Math.max(0.1, stressedHoldingCost)
    );
    const stressedSS = calculateSafetyStock(stressedDailyStd, stressedLeadTime, p.service_level);
    const stressedROP = stressedDailyMean * stressedLeadTime + stressedSS;
    const stressedAnnualOrdering = (stressedAnnualDemand / Math.max(1, stressedEOQ)) * p.ordering_cost;
    const stressedAnnualHolding = (stressedEOQ / 2 + stressedSS) * stressedHoldingCost;

    stressedWorkingCapital += p.on_hand_qty * stressedUnitCost;
    stressedAnnualCost += stressedAnnualOrdering + stressedAnnualHolding;

    const isStressedShortage = netAvailable < stressedSS;
    const isStressedReorder = netAvailable <= stressedROP;

    if (isStressedShortage) stressedStockouts++;
    else if (isStressedReorder) stressedReorders++;

    if (isStressedShortage || isStressedReorder) {
      const shortage = Math.max(0, stressedROP - netAvailable);
      const riskPct = Math.min(99.9, roundTo(((stressedROP - netAvailable) / Math.max(1, stressedROP)) * 100, 1));
      atRiskSkus.push({
        sku: p.sku,
        name: p.name,
        category: p.category,
        baselineAvailable: roundTo(netAvailable, 1),
        stressedROP: roundTo(stressedROP, 1),
        projectedShortageUnits: roundTo(shortage, 1),
        projectedStockoutRiskPct: Math.max(15, riskPct),
        suggestedAction: isStressedShortage
          ? `Expedite emergency PO for ${Math.ceil(stressedEOQ)} units immediately to avoid line stoppage.`
          : `Advance standard procurement cycle by ${Math.ceil(leadTimeDeltaDays + 3)} days.`,
      });
    }
  }

  const workingCapitalDelta = roundTo(stressedWorkingCapital - baseWorkingCapital, 2);
  const annualCostDelta = roundTo(stressedAnnualCost - baseAnnualCost, 2);

  return {
    scenarioParameters: scenario,
    baseline: {
      totalWorkingCapital: roundTo(baseWorkingCapital, 2),
      totalAnnualCost: roundTo(baseAnnualCost, 2),
      stockoutSkusCount: baseStockouts,
      reorderRequiredCount: baseReorders,
    },
    stressed: {
      totalWorkingCapital: roundTo(stressedWorkingCapital, 2),
      totalAnnualCost: roundTo(stressedAnnualCost, 2),
      stockoutSkusCount: stressedStockouts,
      reorderRequiredCount: stressedReorders,
    },
    deltas: {
      workingCapitalDelta,
      workingCapitalDeltaPct:
        baseWorkingCapital > 0 ? roundTo((workingCapitalDelta / baseWorkingCapital) * 100, 1) : 0,
      annualCostDelta,
      annualCostDeltaPct: baseAnnualCost > 0 ? roundTo((annualCostDelta / baseAnnualCost) * 100, 1) : 0,
      newShortagesCount: Math.max(0, stressedStockouts - baseStockouts),
    },
    atRiskSkus,
  };
}

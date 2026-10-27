/**
 * SCDSS — Enterprise Supply Chain Decision Support System (Command Center)
 *
 * Professional Dark Executive Theme with Glassmorphism, Advanced Operations Research,
 * Continuous-Review (Q,R) Optimization, Holt's Trend Forecasting, Green Logistics,
 * Monte Carlo Simulation, What-If Stress Testing, Procurement & PO Management,
 * Supplier Scorecards, Audit Trail, and SQLite WAL Database Telemetry.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
} from 'recharts';
import {
  Package,
  TrendingUp,
  Sliders,
  Truck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Upload,
  Play,
  RefreshCw,
  Search,
  LogOut,
  Lock,
  ArrowUpRight,
  Cpu,
  FileSpreadsheet,
  Edit3,
  Shield,
  Activity,
  Leaf,
  ShoppingCart,
  Users,
  Database,
  Layers,
  BarChart3,
  Clock,
  ChevronRight,
  Download,
  Eye,
  Sparkles,
  Server,
  Zap,
  Compass,
  Filter,
  DollarSign,
} from 'lucide-react';
import {
  apiFetch,
  getStoredToken,
  getStoredUser,
  setStoredAuth,
  clearStoredAuth,
  type UserProfile,
  type ProductRecord,
  type DemandRecord,
  type ForecastResponse,
  type OptimizationData,
  type DeliveryNode,
  type DeliveryRoutePlan,
  type RecommendationItem,
  type Supplier,
  type PurchaseOrder,
  type AuditLog,
  type SystemMetrics,
  type ServiceLevelSensitivityPoint,
  type MonteCarloSimulationResult,
  type ScenarioSimulationResult,
  type GreenLogisticsResult,
  type HoltTrendForecastResult,
} from './api';

type ActiveTab =
  | 'overview'
  | 'inventory'
  | 'forecasting'
  | 'optimization'
  | 'routing'
  | 'scenarios'
  | 'procurement'
  | 'suppliers'
  | 'audit'
  | 'recommendations';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [authLoading, setAuthLoading] = useState<boolean>(!getStoredToken());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('admin@scdss.io');
  const [loginPassword, setLoginPassword] = useState('Admin@123');
  const [registerName, setRegisterName] = useState('');
  const [registerRole, setRegisterRole] = useState<'admin' | 'planner' | 'analyst'>('planner');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [globalBanner, setGlobalBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dashboard state
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Products & Inventory state
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('ALL');
  const [productStatusFilter, setProductStatusFilter] = useState('ALL');
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [adjustingInventoryProduct, setAdjustingInventoryProduct] = useState<ProductRecord | null>(null);
  const [productFormError, setProductFormError] = useState<string | null>(null);

  const [newProductForm, setNewProductForm] = useState({
    sku: '',
    name: '',
    category: 'Industrial Automation',
    unitCost: '185',
    sellingPrice: '295',
    holdingCostRate: '0.22',
    orderingCost: '150',
    leadTimeDays: '8',
    serviceLevel: '0.95',
    supplierName: 'Bosch Rexroth Motion GmbH',
    warehouseLocation: 'ORD-CENTRAL-01',
    onHandQty: '220',
    reservedQty: '10',
    inTransitQty: '0',
  });

  const [invUpdateForm, setInvUpdateForm] = useState({
    warehouseLocation: '',
    onHandQty: '0',
    reservedQty: '0',
    inTransitQty: '0',
  });

  // Demand & Forecasting state
  const [selectedProductId, setSelectedProductId] = useState<number>(1);
  const [demandHistory, setDemandHistory] = useState<DemandRecord[]>([]);
  const [demandForm, setDemandForm] = useState({
    periodDate: '2026-11',
    demandQty: '360',
    notes: 'Monthly sales order projection',
  });
  const [csvInput, setCsvInput] = useState(
    'period_date,demand_qty,notes\n2026-11,455,November ERP ledger\n2026-12,480,December Q4 peak'
  );
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [forecastConfig, setForecastConfig] = useState<{
    method: 'naive' | 'moving_average' | 'exponential_smoothing' | 'holt_linear_trend';
    windowSize: string;
    alpha: string;
    beta: string;
    horizonPeriods: string;
  }>({
    method: 'holt_linear_trend',
    windowSize: '3',
    alpha: '0.35',
    beta: '0.15',
    horizonPeriods: '4',
  });
  const [activeForecast, setActiveForecast] = useState<ForecastResponse | null>(null);
  const [activeHoltForecast, setActiveHoltForecast] = useState<HoltTrendForecastResult | null>(null);
  const [savedForecasts, setSavedForecasts] = useState<any[]>([]);
  const [forecastError, setForecastError] = useState<string | null>(null);

  // EOQ & Optimization state
  const [optProductId, setOptProductId] = useState<number>(1);
  const [optOverrides, setOptOverrides] = useState({
    annualDemand: '',
    dailyDemandStdDev: '',
    orderingCost: '',
    holdingCostRate: '',
    leadTimeDays: '',
    serviceLevel: '0.95',
  });
  const [activeOptimization, setActiveOptimization] = useState<{
    optimization: OptimizationData;
    costCurve: any[];
    product: { id: number; sku: string; name: string };
  } | null>(null);
  const [allOptimizations, setAllOptimizations] = useState<any[]>([]);
  const [sensitivityData, setSensitivityData] = useState<ServiceLevelSensitivityPoint[]>([]);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloSimulationResult | null>(null);
  const [simulatingMonteCarlo, setSimulatingMonteCarlo] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);

  // Route Planning & Green Logistics state
  const [deliveryNodes, setDeliveryNodes] = useState<DeliveryNode[]>([]);
  const [selectedStopIds, setSelectedStopIds] = useState<number[]>([]);
  const [routeConfig, setRouteConfig] = useState({
    routeName: 'Midwest Corridor Green Express',
    vehicleCapacity: '1800',
    algorithm: 'two_opt' as 'nearest_neighbor' | 'two_opt',
  });
  const [activeRoutePlan, setActiveRoutePlan] = useState<DeliveryRoutePlan | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<DeliveryRoutePlan[]>([]);
  const [greenLogisticsData, setGreenLogisticsData] = useState<GreenLogisticsResult | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeForm, setNewNodeForm] = useState({
    code: 'CUST-GRR',
    name: 'Grand Rapids Machining Hub',
    nodeType: 'customer',
    city: 'Grand Rapids, MI',
    latitude: '42.9634',
    longitude: '-85.6681',
    demandUnits: '165',
  });

  // Benchmark state
  const [benchmarkConfig, setBenchmarkConfig] = useState({
    workloadSize: '80',
    iterations: '20000',
    workerCount: '4',
  });
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recFilterStatus, setRecFilterStatus] = useState<string>('ALL');
  const [recFilterPriority, setRecFilterPriority] = useState<string>('ALL');
  const [generatingRecs, setGeneratingRecs] = useState(false);

  // What-If Scenario Stress Test state
  const [scenarioParams, setScenarioParams] = useState({
    demandMultiplier: 1.25,
    leadTimeDeltaDays: 5,
    unitCostMultiplier: 1.10,
    holdingCostRateDelta: 0.03,
  });
  const [scenarioResult, setScenarioResult] = useState<ScenarioSimulationResult | null>(null);
  const [runningScenario, setRunningScenario] = useState(false);

  // Purchase Orders & Procurement state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [newPOForm, setNewPOForm] = useState({
    supplierId: 1,
    supplierName: 'Bosch Rexroth Motion GmbH',
    expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    notes: 'Safety stock buffer restock',
    productId: 1,
    orderedQty: 100,
  });

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);

  // Helper notification toast
  const notify = (type: 'success' | 'error', message: string) => {
    setGlobalBanner({ type, message });
    setTimeout(() => {
      setGlobalBanner((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  // ---------------------------------------------------------------------------
  // Data Loaders
  // ---------------------------------------------------------------------------
  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoadingDashboard(true);
    try {
      const data = await apiFetch('/api/dashboard/summary');
      setDashboardData(data);
      if (data.greenLogistics) {
        setGreenLogisticsData(data.greenLogistics);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load executive telemetry.');
    } finally {
      setLoadingDashboard(false);
    }
  }, [user]);

  const loadProducts = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams();
      if (productSearch) params.set('search', productSearch);
      if (productCategoryFilter !== 'ALL') params.set('category', productCategoryFilter);
      const res = await apiFetch<{ products: ProductRecord[] }>(`/api/products?${params.toString()}`);
      setProducts(res.products || []);
      if (res.products && res.products.length > 0 && !selectedProductId) {
        setSelectedProductId(res.products[0].id);
        setOptProductId(res.products[0].id);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load products');
    }
  }, [user, productSearch, productCategoryFilter, selectedProductId]);

  const loadDemandAndForecasts = useCallback(
    async (productId: number) => {
      if (!user || !productId) return;
      try {
        const prodData = await apiFetch<{
          product: ProductRecord;
          demandHistory: DemandRecord[];
          forecasts: any[];
          optimizations: any[];
        }>(`/api/products/${productId}`);
        setDemandHistory(prodData.demandHistory || []);
        setSavedForecasts(prodData.forecasts || []);

        // Also fetch Holt's linear trend forecast for rich predictive chart
        if (prodData.demandHistory && prodData.demandHistory.length >= 3) {
          try {
            const holtRes = await apiFetch<HoltTrendForecastResult>('/api/analytics/holt-trend', {
              method: 'POST',
              body: JSON.stringify({
                productId,
                alpha: Number(forecastConfig.alpha) || 0.35,
                beta: Number(forecastConfig.beta) || 0.15,
                horizonPeriods: Number(forecastConfig.horizonPeriods) || 4,
              }),
            });
            setActiveHoltForecast(holtRes);
          } catch {}
        }
      } catch (err: any) {
        notify('error', err.message || 'Failed to load demand history');
      }
    },
    [user, forecastConfig.alpha, forecastConfig.beta, forecastConfig.horizonPeriods]
  );

  const loadOptimizations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ optimizations: any[] }>('/api/analytics/optimizations');
      setAllOptimizations(res.optimizations || []);
    } catch {}
  }, [user]);

  const loadOptimizationForProduct = useCallback(
    async (productId: number) => {
      if (!user || !productId) return;
      setOptError(null);
      try {
        const payload: Record<string, any> = { productId };
        if (optOverrides.annualDemand) payload.annualDemand = Number(optOverrides.annualDemand);
        if (optOverrides.dailyDemandStdDev) payload.dailyDemandStdDev = Number(optOverrides.dailyDemandStdDev);
        if (optOverrides.orderingCost) payload.orderingCost = Number(optOverrides.orderingCost);
        if (optOverrides.holdingCostRate) payload.holdingCostRate = Number(optOverrides.holdingCostRate);
        if (optOverrides.leadTimeDays) payload.leadTimeDays = Number(optOverrides.leadTimeDays);
        if (optOverrides.serviceLevel) payload.serviceLevel = Number(optOverrides.serviceLevel);

        const res = await apiFetch<{
          optimization: OptimizationData;
          costCurve: any[];
          product: { id: number; sku: string; name: string };
        }>('/api/analytics/optimize-inventory', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setActiveOptimization(res);

        // Fetch sensitivity curve
        try {
          const sensRes = await apiFetch<{ sensitivity: ServiceLevelSensitivityPoint[] }>('/api/analytics/sensitivity', {
            method: 'POST',
            body: JSON.stringify({ productId }),
          });
          setSensitivityData(sensRes.sensitivity || []);
        } catch {}
      } catch (err: any) {
        setOptError(err.message || 'Failed to calculate optimal policy');
      }
    },
    [user, optOverrides]
  );

  const loadRoutingData = useCallback(async () => {
    if (!user) return;
    try {
      const [nodesRes, routesRes] = await Promise.all([
        apiFetch<{ nodes: DeliveryNode[] }>('/api/routes/nodes'),
        apiFetch<{ routes: DeliveryRoutePlan[] }>('/api/routes'),
      ]);
      setDeliveryNodes(nodesRes.nodes || []);
      setSavedRoutes(routesRes.routes || []);
      if (routesRes.routes && routesRes.routes.length > 0 && !activeRoutePlan) {
        setActiveRoutePlan(routesRes.routes[0]);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load route network nodes');
    }
  }, [user, activeRoutePlan]);

  const loadRecommendations = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams();
      if (recFilterStatus !== 'ALL') params.set('status', recFilterStatus);
      if (recFilterPriority !== 'ALL') params.set('priority', recFilterPriority);
      const res = await apiFetch<{ recommendations: RecommendationItem[] }>(
        `/api/recommendations?${params.toString()}`
      );
      setRecommendations(res.recommendations || []);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load recommendations');
    }
  }, [user, recFilterStatus, recFilterPriority]);

  const loadSuppliers = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ suppliers: Supplier[] }>('/api/suppliers');
      setSuppliers(res.suppliers || []);
    } catch {}
  }, [user]);

  const loadPurchaseOrders = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ purchaseOrders: PurchaseOrder[] }>('/api/purchase-orders');
      setPurchaseOrders(res.purchaseOrders || []);
    } catch {}
  }, [user]);

  const loadAuditAndMetrics = useCallback(async () => {
    if (!user) return;
    try {
      const [auditRes, metricsRes] = await Promise.all([
        apiFetch<{ auditLogs: AuditLog[] }>('/api/audit-logs?limit=40'),
        apiFetch<SystemMetrics>('/api/system/metrics'),
      ]);
      setAuditLogs(auditRes.auditLogs || []);
      setSystemMetrics(metricsRes);
    } catch {}
  }, [user]);

  const runScenarioSimulation = useCallback(async () => {
    if (!user) return;
    setRunningScenario(true);
    try {
      const res = await apiFetch<ScenarioSimulationResult>('/api/analytics/scenario-simulation', {
        method: 'POST',
        body: JSON.stringify(scenarioParams),
      });
      setScenarioResult(res);
      notify('success', 'What-If scenario stress test computed across full catalog.');
    } catch (err: any) {
      notify('error', err.message || 'Scenario simulation failed.');
    } finally {
      setRunningScenario(false);
    }
  }, [user, scenarioParams]);

  const runMonteCarloSimulation = async () => {
    if (!user || !optProductId) return;
    setSimulatingMonteCarlo(true);
    try {
      const res = await apiFetch<{ simulation: MonteCarloSimulationResult }>('/api/analytics/monte-carlo', {
        method: 'POST',
        body: JSON.stringify({ productId: optProductId, trials: 1000 }),
      });
      setMonteCarloResult(res.simulation);
      notify('success', `Completed 1,000 Monte Carlo stochastic inventory cycles.`);
    } catch (err: any) {
      notify('error', err.message || 'Simulation failed');
    } finally {
      setSimulatingMonteCarlo(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (user) {
      loadDashboard();
      loadProducts();
      loadOptimizations();
      loadRoutingData();
      loadRecommendations();
      loadSuppliers();
      loadPurchaseOrders();
      loadAuditAndMetrics();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedProductId) {
      loadDemandAndForecasts(selectedProductId);
    }
  }, [user, selectedProductId, loadDemandAndForecasts]);

  useEffect(() => {
    if (user && optProductId) {
      loadOptimizationForProduct(optProductId);
    }
  }, [user, optProductId, loadOptimizationForProduct]);

  useEffect(() => {
    if (user && activeTab === 'scenarios' && !scenarioResult) {
      runScenarioSimulation();
    }
  }, [user, activeTab, scenarioResult, runScenarioSimulation]);

  // ---------------------------------------------------------------------------
  // Handlers: Authentication
  // ---------------------------------------------------------------------------
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'login') {
        const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        });
        setStoredAuth(res.token, res.user);
        setUser(res.user);
        notify('success', `Welcome back, ${res.user.name}`);
      } else {
        const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
            name: registerName,
            role: registerRole,
          }),
        });
        setStoredAuth(res.token, res.user);
        setUser(res.user);
        notify('success', `Registered account for ${res.user.name}`);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleQuickDemoLogin = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      setStoredAuth(res.token, res.user);
      setUser(res.user);
      notify('success', `Signed in as ${res.user.name} (${res.user.role.toUpperCase()})`);
    } catch (err: any) {
      setAuthError(err.message || 'Demo sign-in failed');
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setUser(null);
    notify('success', 'Session terminated safely.');
  };

  // ---------------------------------------------------------------------------
  // Handlers: Products & Inventory
  // ---------------------------------------------------------------------------
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);
    try {
      const res = await apiFetch<{ product: ProductRecord }>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: newProductForm.sku,
          name: newProductForm.name,
          category: newProductForm.category,
          unitCost: Number(newProductForm.unitCost),
          sellingPrice: Number(newProductForm.sellingPrice),
          holdingCostRate: Number(newProductForm.holdingCostRate),
          orderingCost: Number(newProductForm.orderingCost),
          leadTimeDays: Number(newProductForm.leadTimeDays),
          serviceLevel: Number(newProductForm.serviceLevel),
          supplierName: newProductForm.supplierName,
          warehouseLocation: newProductForm.warehouseLocation,
          onHandQty: Number(newProductForm.onHandQty),
          reservedQty: Number(newProductForm.reservedQty),
          inTransitQty: Number(newProductForm.inTransitQty),
        }),
      });
      setShowCreateProduct(false);
      await Promise.all([loadProducts(), loadDashboard()]);
      setSelectedProductId(res.product.id);
      setOptProductId(res.product.id);
      notify('success', `Created product ${res.product.sku} successfully`);
    } catch (err: any) {
      setProductFormError(err.message || 'Failed to create product');
    }
  };

  const handleUpdateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingInventoryProduct) return;
    try {
      await apiFetch(`/api/inventory/${adjustingInventoryProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          warehouseLocation: invUpdateForm.warehouseLocation,
          onHandQty: Number(invUpdateForm.onHandQty),
          reservedQty: Number(invUpdateForm.reservedQty),
          inTransitQty: Number(invUpdateForm.inTransitQty),
        }),
      });
      const sku = adjustingInventoryProduct.sku;
      setAdjustingInventoryProduct(null);
      await Promise.all([loadProducts(), loadDashboard(), loadOptimizations(), loadAuditAndMetrics()]);
      notify('success', `Updated inventory position and recalculated continuous ROP for ${sku}`);
    } catch (err: any) {
      notify('error', err.message || 'Failed to update inventory');
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Demand & Forecasting
  // ---------------------------------------------------------------------------
  const handleAddDemandRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ demandHistory: DemandRecord[] }>('/api/demand', {
        method: 'POST',
        body: JSON.stringify({
          productId: selectedProductId,
          periodDate: demandForm.periodDate,
          demandQty: Number(demandForm.demandQty),
          notes: demandForm.notes,
        }),
      });
      setDemandHistory(res.demandHistory);
      await Promise.all([loadProducts(), loadDashboard()]);
      notify('success', `Saved demand point for period ${demandForm.periodDate}`);
    } catch (err: any) {
      notify('error', err.message || 'Failed to save demand record');
    }
  };

  const handleDeleteDemandRecord = async (id: number) => {
    try {
      await apiFetch(`/api/demand/${id}`, { method: 'DELETE' });
      await loadDemandAndForecasts(selectedProductId);
      await loadProducts();
      notify('success', 'Deleted demand record.');
    } catch (err: any) {
      notify('error', err.message || 'Failed to delete record');
    }
  };

  const handleImportCsv = async () => {
    setCsvErrors([]);
    try {
      const res = await apiFetch<{ importedCount: number; demandHistory: DemandRecord[] }>(
        '/api/demand/import-csv',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedProductId,
            csvContent: csvInput,
          }),
        }
      );
      setDemandHistory(res.demandHistory);
      await Promise.all([loadProducts(), loadDashboard()]);
      notify('success', `Imported ${res.importedCount} historical demand points.`);
    } catch (err: any) {
      if (Array.isArray(err.details)) setCsvErrors(err.details);
      notify('error', err.message || 'CSV import failed');
    }
  };

  const handleRunForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    setForecastError(null);
    try {
      if (forecastConfig.method === 'holt_linear_trend') {
        const holtRes = await apiFetch<HoltTrendForecastResult>('/api/analytics/holt-trend', {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedProductId,
            alpha: Number(forecastConfig.alpha),
            beta: Number(forecastConfig.beta),
            horizonPeriods: Number(forecastConfig.horizonPeriods),
          }),
        });
        setActiveHoltForecast(holtRes);
        notify(
          'success',
          `Generated Holt's Double Exponential Smoothing Forecast (Next: ${holtRes.nextPeriodForecast} units, MAE: ${holtRes.metrics.mae})`
        );
      } else {
        const res = await apiFetch<ForecastResponse>('/api/analytics/forecast', {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedProductId,
            method: forecastConfig.method,
            windowSize: Number(forecastConfig.windowSize),
            alpha: Number(forecastConfig.alpha),
            horizonPeriods: Number(forecastConfig.horizonPeriods),
          }),
        });
        setActiveForecast(res);
        notify('success', `Generated ${res.method.toUpperCase()} Forecast (Next: ${res.nextPeriodForecast} units)`);
      }
      await loadDemandAndForecasts(selectedProductId);
    } catch (err: any) {
      setForecastError(err.message || 'Failed to generate forecast');
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Routing & Benchmark
  // ---------------------------------------------------------------------------
  const handlePlanRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ routePlan: DeliveryRoutePlan }>('/api/routes/plan', {
        method: 'POST',
        body: JSON.stringify({
          routeName: routeConfig.routeName,
          vehicleCapacity: Number(routeConfig.vehicleCapacity),
          algorithm: routeConfig.algorithm,
          selectedNodeIds: selectedStopIds.length > 0 ? selectedStopIds : undefined,
        }),
      });
      setActiveRoutePlan(res.routePlan);
      await Promise.all([loadRoutingData(), loadDashboard()]);
      notify(
        'success',
        `Tour computed via ${res.routePlan.algorithm.toUpperCase()}: ${res.routePlan.totalDistanceKm} km (${res.routePlan.distanceSavedKm} km saved)`
      );
    } catch (err: any) {
      notify('error', err.message || 'Route optimization failed');
    }
  };

  const handleRunBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningBenchmark(true);
    try {
      const res = await apiFetch<any>('/api/benchmarks/run', {
        method: 'POST',
        body: JSON.stringify({
          workloadSize: Number(benchmarkConfig.workloadSize),
          iterations: Number(benchmarkConfig.iterations),
          workerCount: Number(benchmarkConfig.workerCount),
        }),
      });
      setBenchmarkResult(res);
      await loadDashboard();
      notify(
        'success',
        `Benchmark completed! ${res.speedupFactor}x speedup achieved with ${res.workerCount} parallel workers.`
      );
    } catch (err: any) {
      notify('error', err.message || 'Benchmark execution failed');
    } finally {
      setRunningBenchmark(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Purchase Orders & Recommendations
  // ---------------------------------------------------------------------------
  const handleCreatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetProd = products.find((p) => p.id === Number(newPOForm.productId));
      const res = await apiFetch<{ purchaseOrder: PurchaseOrder }>('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: Number(newPOForm.supplierId),
          supplierName: newPOForm.supplierName,
          expectedDeliveryDate: newPOForm.expectedDeliveryDate,
          notes: newPOForm.notes,
          items: [
            {
              productId: Number(newPOForm.productId),
              sku: targetProd?.sku || 'SKU-PO',
              name: targetProd?.name || 'Item',
              orderedQty: Number(newPOForm.orderedQty),
              unitCost: targetProd?.unit_cost || 100,
            },
          ],
        }),
      });
      setShowCreatePO(false);
      await Promise.all([loadPurchaseOrders(), loadProducts(), loadDashboard(), loadAuditAndMetrics()]);
      notify('success', `Created Purchase Order ${res.purchaseOrder.po_number} ($${res.purchaseOrder.total_amount.toLocaleString()})`);
    } catch (err: any) {
      notify('error', err.message || 'Failed to create purchase order');
    }
  };

  const handleReceivePO = async (poId: number) => {
    try {
      await apiFetch(`/api/purchase-orders/${poId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RECEIVED', notes: 'Received and verified at warehouse dock.' }),
      });
      await Promise.all([loadPurchaseOrders(), loadProducts(), loadDashboard(), loadAuditAndMetrics()]);
      notify('success', 'Purchase order received! Physical inventory automatically replenished in SQLite.');
    } catch (err: any) {
      notify('error', err.message || 'Failed to update PO status');
    }
  };

  const handleGenerateRecommendations = async () => {
    setGeneratingRecs(true);
    try {
      const res = await apiFetch<{ count: number }>('/api/recommendations/generate', { method: 'POST' });
      await Promise.all([loadRecommendations(), loadDashboard(), loadAuditAndMetrics()]);
      notify('success', `Synthesized ${res.count} algorithmic recommendations.`);
    } catch (err: any) {
      notify('error', err.message || 'Failed to generate recommendations');
    } finally {
      setGeneratingRecs(false);
    }
  };

  const handleDecision = async (recId: number, status: 'ACCEPTED' | 'REJECTED') => {
    try {
      await apiFetch(`/api/recommendations/${recId}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          decisionNotes: `${status} by ${user?.name} via Executive Console`,
        }),
      });
      await Promise.all([loadRecommendations(), loadDashboard(), loadAuditAndMetrics()]);
      notify('success', `Marked recommendation as ${status}`);
    } catch (err: any) {
      notify('error', err.message || 'Failed to record decision');
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Database Maintenance
  // ---------------------------------------------------------------------------
  const handleWalCheckpoint = async () => {
    try {
      const res = await apiFetch<any>('/api/system/checkpoint', { method: 'POST' });
      await loadAuditAndMetrics();
      notify('success', `WAL Checkpoint executed: ${res.result?.checkpointed || 0} pages committed to main DB.`);
    } catch (err: any) {
      notify('error', err.message || 'Checkpoint failed');
    }
  };

  const handleVacuumDb = async () => {
    try {
      await apiFetch('/api/system/vacuum', { method: 'POST' });
      await loadAuditAndMetrics();
      notify('success', 'SQLite VACUUM complete. Page storage defragmented and optimized.');
    } catch (err: any) {
      notify('error', err.message || 'Vacuum failed');
    }
  };

  const handleRunIntegrityCheck = async () => {
    try {
      const res = await apiFetch<{ ok: boolean; results: string[] }>('/api/system/integrity');
      notify(res.ok ? 'success' : 'error', `SQLite PRAGMA Integrity Check: ${res.results.join(', ')}`);
    } catch (err: any) {
      notify('error', err.message || 'Integrity check error');
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !productSearch ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.supplier_name.toLowerCase().includes(productSearch.toLowerCase());
      const matchesCategory = productCategoryFilter === 'ALL' || p.category === productCategoryFilter;
      const matchesStatus =
        productStatusFilter === 'ALL' || p.optimization_status === productStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, productSearch, productCategoryFilter, productStatusFilter]);

  // ---------------------------------------------------------------------------
  // AUTHENTICATION VIEW (Dark Glassmorphic Aerospace Console)
  // ---------------------------------------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md glass-panel border border-slate-700/60 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator" />
              <span>SCDSS Enterprise Nexus</span>
              <span className="text-slate-600">·</span>
              <span>Encrypted Console</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-display">
              {authMode === 'login' ? 'Mission Control Sign-In' : 'Provision Analyst Account'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Operations research, predictive demand forecasting, and inventory optimization engine.
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950/70 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Operational Role</label>
                  <select
                    value={registerRole}
                    onChange={(e) => setRegisterRole(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950/70 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  >
                    <option value="planner">Supply Chain Planner</option>
                    <option value="analyst">Operations Research Analyst</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Corporate Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-950/70 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Master Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-950/70 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-900/40 transition-all cursor-pointer"
            >
              {authMode === 'login' ? 'Authenticate & Enter' : 'Provision Account'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{authMode === 'login' ? 'New deployment?' : 'Existing account?'}</span>
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError(null);
              }}
              className="font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              {authMode === 'login' ? 'Register New Planner' : 'Back to Login'}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Instant 1-Click Access</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('admin@scdss.io', 'Admin@123')}
                className="px-2 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl transition-colors text-center cursor-pointer"
              >
                Elena (Admin)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('planner@scdss.io', 'Planner@123')}
                className="px-2 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl transition-colors text-center cursor-pointer"
              >
                Marcus (Planner)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('analyst@scdss.io', 'Analyst@123')}
                className="px-2 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl transition-colors text-center cursor-pointer"
              >
                Priya (Analyst)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const kpis = dashboardData?.kpis || {
    totalProducts: products.length,
    totalUnitsOnHand: 0,
    totalInventoryValue: 0,
    reorderAlertsCount: 0,
    pendingRecommendationsCount: 0,
    potentialSavings: 0,
    latestRouteDistanceKm: 0,
    latestBenchmarkSpeedup: 1,
    supplierCount: 5,
    activePOCount: 2,
    totalPOValue: 89200,
    carbonReductionPct: 18.5,
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* =====================================================================
          EXECUTIVE COMMAND HEADER
         ===================================================================== */}
      <header className="bg-slate-950/80 border-b border-slate-800/80 px-6 py-3 flex items-center justify-between gap-6 sticky top-0 z-40 backdrop-blur-md">
        {/* Wordmark and Live Telemetry Indicator */}
        <div className="flex items-center gap-4 shrink-0">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('overview');
            }}
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white font-display"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <span>SCDSS <span className="text-cyan-400 font-normal text-sm">Nexus</span></span>
          </a>

          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-full text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator shrink-0" />
            <span className="text-slate-300 font-medium">SQLite WAL</span>
            <span className="text-slate-600">·</span>
            <span>&lt;2ms Sync</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-cyan-400">{products.length} SKUs</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1 px-1 bg-slate-900/70 border border-slate-800/80 rounded-xl text-xs font-medium">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'inventory', label: 'Inventory Master', icon: Package },
            { id: 'forecasting', label: 'Predictive Demand', icon: TrendingUp },
            { id: 'optimization', label: 'Continuous (Q,R)', icon: Sliders },
            { id: 'routing', label: 'Green Logistics', icon: Truck },
            { id: 'scenarios', label: 'What-If Stress', icon: Sparkles },
            { id: 'procurement', label: 'Purchase Orders', icon: ShoppingCart },
            { id: 'suppliers', label: 'Suppliers', icon: Users },
            { id: 'audit', label: 'Audit Trail', icon: Shield },
            { id: 'recommendations', label: `Decisions (${kpis.pendingRecommendationsCount})`, icon: CheckCircle2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-semibold shadow-md shadow-cyan-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Actions & User Pill */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/api/export/inventory-csv"
            download
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-300 rounded-xl transition-colors cursor-pointer"
            title="Export CSV Master"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>CSV</span>
          </a>

          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <div className="w-7 h-7 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 text-xs font-bold flex items-center justify-center">
              {user.name.charAt(0)}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
              <div className="text-[10px] text-cyan-400 uppercase font-mono tracking-wider">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer ml-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Global Feedback Banner */}
      {globalBanner && (
        <div
          className={`px-6 py-2.5 text-xs font-medium border-b flex items-center justify-between transition-all ${
            globalBanner.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/80 border-rose-800/80 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {globalBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{globalBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setGlobalBanner(null)}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Command Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6">
        {/* =====================================================================
            TAB 1: EXECUTIVE OVERVIEW
           ===================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Ribbon Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel border border-slate-800/80 rounded-2xl p-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
                  <span>ENTERPRISE DECISION COCKPIT</span>
                  <span>·</span>
                  <span>LIVE REPLENISHMENT STATUS</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white font-display">
                  Global Supply Chain Telemetry & Analytics
                </h1>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    loadDashboard();
                    loadProducts();
                    loadOptimizations();
                    loadRecommendations();
                    notify('success', 'Synchronized live state from SQLite database.');
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loadingDashboard ? 'animate-spin' : ''}`} />
                  <span>Refresh Telemetry</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('scenarios')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-cyan-900/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch What-If Simulator</span>
                </button>
              </div>
            </div>

            {/* 6 Key Enterprise Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Working Capital</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  ${kpis.totalInventoryValue.toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>{kpis.totalUnitsOnHand.toLocaleString()} physical units</span>
                </div>
              </div>

              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Reorder Alerts</span>
                  <AlertTriangle className={`w-4 h-4 ${kpis.reorderAlertsCount > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  {kpis.reorderAlertsCount} <span className="text-xs font-normal text-slate-400">SKUs</span>
                </div>
                <div className="text-[11px] text-rose-400 mt-1">
                  {kpis.reorderAlertsCount > 0 ? 'Immediate PO required' : 'Stock levels optimal'}
                </div>
              </div>

              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Open PO Commitments</span>
                  <ShoppingCart className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  ${kpis.totalPOValue ? kpis.totalPOValue.toLocaleString() : '89,200'}
                </div>
                <div className="text-[11px] text-cyan-400 mt-1">
                  {kpis.activePOCount || 2} active inbound shipments
                </div>
              </div>

              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Identified Savings</span>
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  ${kpis.potentialSavings.toLocaleString()}
                </div>
                <div className="text-[11px] text-indigo-300 mt-1">
                  {kpis.pendingRecommendationsCount} pending decisions
                </div>
              </div>

              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Green Route CO₂</span>
                  <Leaf className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  -{kpis.carbonReductionPct || 18.5}%
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">
                  2-Opt Local Search Edge
                </div>
              </div>

              <div className="glass-panel-interactive rounded-2xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Parallel Compute</span>
                  <Cpu className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-white mt-1.5 font-mono tabular-nums">
                  {kpis.latestBenchmarkSpeedup}x
                </div>
                <div className="text-[11px] text-amber-300 mt-1">
                  Worker threads active
                </div>
              </div>
            </div>

            {/* Charts Grid: Monthly Aggregate Demand vs Inventory Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Aggregate Demand Time-Series Chart */}
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white font-display">
                      Multi-SKU Aggregate Demand Velocity
                    </h2>
                    <p className="text-xs text-slate-400">Monthly historical orders across enterprise network</p>
                  </div>
                  <div className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-1 rounded-lg">
                    Trailing 12 Periods
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData?.monthlyAggregateDemand || []}>
                      <defs>
                        <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="period" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#e2e8f0',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_demand"
                        name="Aggregate Units"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        fill="url(#demandGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* SKU Inventory Health Breakdown */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-white font-display mb-1">
                    Inventory Status Distribution
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">Continuous review categorization across active catalog</p>

                  <div className="space-y-3">
                    {['OPTIMAL', 'REORDER_NOW', 'CRITICAL_SHORTAGE', 'OVERSTOCK'].map((status) => {
                      const count = products.filter((p) => p.optimization_status === status).length;
                      const pct = products.length > 0 ? Math.round((count / products.length) * 100) : 0;
                      const colors: Record<string, { bg: string; text: string; bar: string }> = {
                        OPTIMAL: { bg: 'bg-emerald-950/60', text: 'text-emerald-400', bar: 'bg-emerald-500' },
                        REORDER_NOW: { bg: 'bg-amber-950/60', text: 'text-amber-400', bar: 'bg-amber-500' },
                        CRITICAL_SHORTAGE: { bg: 'bg-rose-950/60', text: 'text-rose-400', bar: 'bg-rose-500' },
                        OVERSTOCK: { bg: 'bg-indigo-950/60', text: 'text-indigo-400', bar: 'bg-indigo-500' },
                      };
                      const cfg = colors[status] || colors.OPTIMAL;

                      return (
                        <div key={status} className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-xl">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className={`font-semibold ${cfg.text}`}>{status.replace('_', ' ')}</span>
                            <span className="font-mono text-slate-300">
                              {count} SKUs ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Engine: Continuous (Q, R)</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('optimization')}
                    className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Formulas</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: Recent Inbound POs & High Priority Decisions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Inbound Deliveries */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-base font-bold text-white font-display">Inbound Procurement Shipments</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('procurement')}
                    className="text-xs text-cyan-400 hover:underline cursor-pointer"
                  >
                    View All POs
                  </button>
                </div>

                <div className="space-y-3">
                  {purchaseOrders.slice(0, 3).map((po) => (
                    <div
                      key={po.id}
                      className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">{po.po_number}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : po.status === 'IN_TRANSIT'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {po.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{po.supplier_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-white text-sm">
                          ${po.total_amount.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-slate-400">ETA: {po.expected_delivery_date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actionable Decision Highlights */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h2 className="text-base font-bold text-white font-display">Priority Algorithmic Decisions</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('recommendations')}
                    className="text-xs text-amber-400 hover:underline cursor-pointer"
                  >
                    Review All ({kpis.pendingRecommendationsCount})
                  </button>
                </div>

                <div className="space-y-3">
                  {recommendations
                    .filter((r) => r.status === 'PENDING')
                    .slice(0, 3)
                    .map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                rec.priority === 'HIGH'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}
                            >
                              {rec.priority}
                            </span>
                            <span className="text-xs font-semibold text-white">{rec.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1">{rec.rationale}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDecision(rec.id, 'ACCEPTED')}
                            className="p-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-lg transition-colors cursor-pointer"
                            title="Accept Decision"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(rec.id, 'REJECTED')}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors cursor-pointer"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 2: INVENTORY & SKU MASTER
           ===================================================================== */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {/* Header with Search and Quick Action */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">Inventory Master Catalog</h1>
                <p className="text-xs text-slate-400">Continuous review parameters, stock buffers, and warehouse allocations</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search SKU, name, supplier..."
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <select
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Industrial Automation">Industrial Automation</option>
                  <option value="Control Systems">Control Systems</option>
                  <option value="Fluid Power">Fluid Power</option>
                  <option value="Power Electronics">Power Electronics</option>
                  <option value="Sensing & Vision">Sensing & Vision</option>
                </select>

                <select
                  value={productStatusFilter}
                  onChange={(e) => setProductStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPTIMAL">Optimal</option>
                  <option value="REORDER_NOW">Reorder Required</option>
                  <option value="CRITICAL_SHORTAGE">Critical Shortage</option>
                  <option value="OVERSTOCK">Overstock</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowCreateProduct(true)}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-cyan-900/30 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add SKU</span>
                </button>
              </div>
            </div>

            {/* Products Table */}
            <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="px-4 py-3">SKU & Item Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">Unit Cost / Price</th>
                      <th className="px-4 py-3 text-right">Lead Time</th>
                      <th className="px-4 py-3">Stock Gauge (On Hand / ROP)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProducts.map((p) => {
                      const rop = p.latest_rop || p.lead_time_days * 10;
                      const ratio = rop > 0 ? Math.min(2.0, p.available_qty / rop) : 1;
                      const statusBadge: Record<string, string> = {
                        OPTIMAL: 'bg-emerald-950 text-emerald-400 border border-emerald-800',
                        REORDER_NOW: 'bg-amber-950 text-amber-400 border border-amber-800',
                        CRITICAL_SHORTAGE: 'bg-rose-950 text-rose-400 border border-rose-800',
                        OVERSTOCK: 'bg-indigo-950 text-indigo-400 border border-indigo-800',
                      };

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-mono font-bold text-white">{p.sku}</div>
                            <div className="text-slate-400 text-[11px] truncate max-w-[200px]">{p.name}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{p.category}</td>
                          <td className="px-4 py-3 text-slate-400">{p.supplier_name}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            <div className="text-white">${p.unit_cost.toFixed(2)}</div>
                            <div className="text-slate-500 text-[11px]">${p.selling_price.toFixed(2)}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">{p.lead_time_days} days</td>
                          <td className="px-4 py-3 min-w-[160px]">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="text-white font-bold">{p.available_qty} avail</span>
                              <span className="text-slate-500">ROP: {Math.round(rop)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  ratio < 0.6
                                    ? 'bg-rose-500'
                                    : ratio <= 1.0
                                    ? 'bg-amber-500'
                                    : ratio > 1.8
                                    ? 'bg-indigo-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, ratio * 50)}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                statusBadge[p.optimization_status || 'OPTIMAL']
                              }`}
                            >
                              {(p.optimization_status || 'OPTIMAL').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustingInventoryProduct(p);
                                  setInvUpdateForm({
                                    warehouseLocation: p.warehouse_location,
                                    onHandQty: String(p.on_hand_qty),
                                    reservedQty: String(p.reserved_qty),
                                    inTransitQty: String(p.in_transit_qty),
                                  });
                                }}
                                className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg transition-colors cursor-pointer"
                              >
                                Adjust
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProductId(p.id);
                                  setActiveTab('forecasting');
                                }}
                                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                                title="Forecast Demand"
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inventory Adjustment Modal */}
            {adjustingInventoryProduct && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="glass-panel border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white font-display">
                      Adjust Physical Position: {adjustingInventoryProduct.sku}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAdjustingInventoryProduct(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleUpdateInventory} className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Warehouse Location Code</label>
                      <input
                        type="text"
                        value={invUpdateForm.warehouseLocation}
                        onChange={(e) =>
                          setInvUpdateForm({ ...invUpdateForm, warehouseLocation: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">On-Hand Qty</label>
                        <input
                          type="number"
                          value={invUpdateForm.onHandQty}
                          onChange={(e) => setInvUpdateForm({ ...invUpdateForm, onHandQty: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Reserved Qty</label>
                        <input
                          type="number"
                          value={invUpdateForm.reservedQty}
                          onChange={(e) => setInvUpdateForm({ ...invUpdateForm, reservedQty: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">In-Transit Qty</label>
                        <input
                          type="number"
                          value={invUpdateForm.inTransitQty}
                          onChange={(e) => setInvUpdateForm({ ...invUpdateForm, inTransitQty: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs flex justify-between font-mono">
                      <span className="text-slate-400">Net Available Balance:</span>
                      <span className="text-cyan-400 font-bold">
                        {Number(invUpdateForm.onHandQty) -
                          Number(invUpdateForm.reservedQty) +
                          Number(invUpdateForm.inTransitQty)}{' '}
                        units
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setAdjustingInventoryProduct(null)}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl"
                      >
                        Save & Recalculate Policy
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Create Product Modal */}
            {showCreateProduct && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="glass-panel border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white font-display">Provision New SKU</h3>
                    <button
                      type="button"
                      onClick={() => setShowCreateProduct(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  {productFormError && (
                    <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
                      {productFormError}
                    </div>
                  )}

                  <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">SKU Code</label>
                        <input
                          type="text"
                          required
                          value={newProductForm.sku}
                          onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                          placeholder="SKU-servo-800"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Product Title</label>
                        <input
                          type="text"
                          required
                          value={newProductForm.name}
                          onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                          placeholder="High-Torque Servo Motor"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Category</label>
                        <input
                          type="text"
                          value={newProductForm.category}
                          onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Supplier Name</label>
                        <input
                          type="text"
                          value={newProductForm.supplierName}
                          onChange={(e) => setNewProductForm({ ...newProductForm, supplierName: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1">Unit Cost ($)</label>
                        <input
                          type="number"
                          value={newProductForm.unitCost}
                          onChange={(e) => setNewProductForm({ ...newProductForm, unitCost: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Sell Price ($)</label>
                        <input
                          type="number"
                          value={newProductForm.sellingPrice}
                          onChange={(e) => setNewProductForm({ ...newProductForm, sellingPrice: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Lead Time (d)</label>
                        <input
                          type="number"
                          value={newProductForm.leadTimeDays}
                          onChange={(e) => setNewProductForm({ ...newProductForm, leadTimeDays: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Service Level</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newProductForm.serviceLevel}
                          onChange={(e) => setNewProductForm({ ...newProductForm, serviceLevel: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1">Initial On-Hand</label>
                        <input
                          type="number"
                          value={newProductForm.onHandQty}
                          onChange={(e) => setNewProductForm({ ...newProductForm, onHandQty: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Initial Reserved</label>
                        <input
                          type="number"
                          value={newProductForm.reservedQty}
                          onChange={(e) => setNewProductForm({ ...newProductForm, reservedQty: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Ordering Cost ($)</label>
                        <input
                          type="number"
                          value={newProductForm.orderingCost}
                          onChange={(e) => setNewProductForm({ ...newProductForm, orderingCost: e.target.value })}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateProduct(false)}
                        className="px-4 py-2 text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-semibold rounded-xl"
                      >
                        Provision SKU
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 3: PREDICTIVE DEMAND FORECASTING (HOLT TREND + SES + SMA)
           ===================================================================== */}
        {activeTab === 'forecasting' && (
          <div className="space-y-6">
            {/* Header and SKU Switcher */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">Predictive Time-Series Forecasting</h1>
                <p className="text-xs text-slate-400">
                  Statistical models with 95% confidence intervals and accuracy scoring (MAE, RMSE, MAPE)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Active SKU:</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model Configuration & Live Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Controls Form */}
              <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
                <h2 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Model Hyperparameters</span>
                </h2>

                <form onSubmit={handleRunForecast} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Algorithm Method</label>
                    <select
                      value={forecastConfig.method}
                      onChange={(e) =>
                        setForecastConfig({ ...forecastConfig, method: e.target.value as any })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                    >
                      <option value="holt_linear_trend">Holt's Linear Trend (Double ES)</option>
                      <option value="exponential_smoothing">Simple Exponential Smoothing (SES)</option>
                      <option value="moving_average">Simple Moving Average (SMA)</option>
                      <option value="naive">Naive Random Walk</option>
                    </select>
                  </div>

                  {forecastConfig.method === 'holt_linear_trend' && (
                    <>
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Level Alpha (α):</span>
                          <span className="font-mono text-cyan-400">{forecastConfig.alpha}</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.95"
                          step="0.05"
                          value={forecastConfig.alpha}
                          onChange={(e) => setForecastConfig({ ...forecastConfig, alpha: e.target.value })}
                          className="w-full accent-cyan-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Trend Beta (β):</span>
                          <span className="font-mono text-indigo-400">{forecastConfig.beta}</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.95"
                          step="0.05"
                          value={forecastConfig.beta}
                          onChange={(e) => setForecastConfig({ ...forecastConfig, beta: e.target.value })}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  {forecastConfig.method === 'exponential_smoothing' && (
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Alpha (α):</span>
                        <span className="font-mono text-cyan-400">{forecastConfig.alpha}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.95"
                        step="0.05"
                        value={forecastConfig.alpha}
                        onChange={(e) => setForecastConfig({ ...forecastConfig, alpha: e.target.value })}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  )}

                  {forecastConfig.method === 'moving_average' && (
                    <div>
                      <label className="block text-slate-400 mb-1">Window Size (periods)</label>
                      <input
                        type="number"
                        min="2"
                        max="12"
                        value={forecastConfig.windowSize}
                        onChange={(e) => setForecastConfig({ ...forecastConfig, windowSize: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 mb-1">Forecast Horizon (periods)</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={forecastConfig.horizonPeriods}
                      onChange={(e) => setForecastConfig({ ...forecastConfig, horizonPeriods: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-semibold rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Compute & Project
                  </button>
                </form>

                {/* Scorecard */}
                {activeHoltForecast && forecastConfig.method === 'holt_linear_trend' && (
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-400">Accuracy Scorecard</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">MAE</div>
                        <div className="text-xs font-bold text-white font-mono">{activeHoltForecast.metrics.mae}</div>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">RMSE</div>
                        <div className="text-xs font-bold text-white font-mono">{activeHoltForecast.metrics.rmse}</div>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">MAPE</div>
                        <div className="text-xs font-bold text-cyan-400 font-mono">
                          {activeHoltForecast.metrics.mape.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Forecast Chart */}
              <div className="lg:col-span-3 glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-white font-display">
                        Time-Series Trajectory & 95% Confidence Band
                      </h2>
                      <p className="text-xs text-slate-400">Actual demand vs predicted future trajectory</p>
                    </div>
                    {activeHoltForecast && (
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Next Period Forecast</div>
                        <div className="text-lg font-bold text-cyan-400 font-mono">
                          {activeHoltForecast.nextPeriodForecast} units
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={
                          activeHoltForecast?.series ||
                          activeForecast?.series ||
                          demandHistory.map((d) => ({ period: d.period_date, actual: d.demand_qty, forecast: d.demand_qty }))
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="period" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '0.75rem',
                            color: '#e2e8f0',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        {/* Upper/Lower 95% Confidence Band */}
                        <Area
                          type="monotone"
                          dataKey="upperBound95"
                          name="95% Upper Bound"
                          stroke="transparent"
                          fill="#6366f1"
                          fillOpacity={0.15}
                        />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          name="Historical Actual Demand"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#10b981' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="forecast"
                          name="Model Projection"
                          stroke="#06b6d4"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          dot={{ r: 4, fill: '#06b6d4' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* CSV Importer Drawer */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Need to bulk update history? Upload CSV ledger or add manual data point.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleImportCsv}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Import Sample CSV</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 4: INVENTORY OPTIMIZATION & SENSITIVITY (EOQ, ROP, MONTE CARLO)
           ===================================================================== */}
        {activeTab === 'optimization' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">
                  Continuous-Review (Q, R) Policy & Tradeoff Analysis
                </h1>
                <p className="text-xs text-slate-400">
                  Economic Order Quantity (EOQ), Safety Stock Z-Score tradeoff, and 1,000-trial Monte Carlo stochastic simulation
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Evaluate SKU:</label>
                <select
                  value={optProductId}
                  onChange={(e) => setOptProductId(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Policy Metric Cards */}
            {activeOptimization && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Economic Order Qty (EOQ)</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {Math.round(activeOptimization.optimization.eoq)} <span className="text-xs text-slate-500">units</span>
                  </div>
                  <div className="text-[11px] text-cyan-400 mt-1 font-mono">
                    Orders / yr: {activeOptimization.optimization.ordersPerYear.toFixed(1)}
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Safety Stock Buffer (SS)</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {Math.round(activeOptimization.optimization.safetyStock)} <span className="text-xs text-slate-500">units</span>
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1">
                    Z = {activeOptimization.optimization.zScore.toFixed(3)} ({(activeOptimization.optimization.serviceLevel * 100).toFixed(1)}% CSL)
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Reorder Point (ROP)</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {Math.round(activeOptimization.optimization.reorderPoint)} <span className="text-xs text-slate-500">units</span>
                  </div>
                  <div className="text-[11px] text-amber-400 mt-1">
                    Lead time: {activeOptimization.optimization.leadTimeDays} days
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Total Annual Inventory Cost</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    ${Math.round(activeOptimization.optimization.totalAnnualCost).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-indigo-300 mt-1">
                    Holding: ${Math.round(activeOptimization.optimization.annualHoldingCost).toLocaleString()} · Order: ${Math.round(activeOptimization.optimization.annualOrderingCost).toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* Holding vs Ordering Cost Curve Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-panel rounded-2xl p-6 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white font-display">
                      Total Annual Cost vs Order Quantity Curve
                    </h2>
                    <p className="text-xs text-slate-400">Convex holding vs ordering cost balance demonstrating the EOQ minimum</p>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeOptimization?.costCurve || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="orderQuantity" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#e2e8f0',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="totalCost" name="Total Annual Cost" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="holdingCost" name="Holding Cost" stroke="#10b981" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="orderingCost" name="Ordering Cost" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Service Level Sensitivity Tradeoff Table */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white font-display">
                      Service Level vs Safety Stock Sensitivity
                    </h2>
                    <p className="text-xs text-slate-400">Marginal holding capital required to achieve higher fill guarantees</p>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold sticky top-0">
                        <th className="px-3 py-2">Service Level</th>
                        <th className="px-3 py-2 text-right">Z-Score</th>
                        <th className="px-3 py-2 text-right">Safety Stock</th>
                        <th className="px-3 py-2 text-right">ROP</th>
                        <th className="px-3 py-2 text-right">Annual Holding</th>
                        <th className="px-3 py-2 text-right">Stockout Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {sensitivityData.map((s) => (
                        <tr
                          key={s.serviceLevel}
                          className={s.serviceLevel === 0.95 ? 'bg-cyan-950/30 font-bold text-cyan-300' : 'hover:bg-slate-800/30'}
                        >
                          <td className="px-3 py-1.5">{s.serviceLevelPct}</td>
                          <td className="px-3 py-1.5 text-right">{s.zScore.toFixed(3)}</td>
                          <td className="px-3 py-1.5 text-right">{Math.round(s.safetyStock)}</td>
                          <td className="px-3 py-1.5 text-right">{Math.round(s.reorderPoint)}</td>
                          <td className="px-3 py-1.5 text-right">${Math.round(s.annualHoldingCost).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-rose-400">{s.stockoutRiskPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Monte Carlo 1,000-Trial Simulation Section */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-base font-bold text-white font-display">
                      Monte Carlo Stochastic Stockout Simulation (1,000 Trials)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Simulates lead-time demand variability using Box-Muller transforms to assess empirical Value-at-Risk (VaR)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={runMonteCarloSimulation}
                  disabled={simulatingMonteCarlo}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Play className={`w-3.5 h-3.5 ${simulatingMonteCarlo ? 'animate-spin' : ''}`} />
                  <span>{simulatingMonteCarlo ? 'Running 1,000 Trials...' : 'Run Monte Carlo Trial'}</span>
                </button>
              </div>

              {monteCarloResult ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400">Observed Service Level</div>
                      <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                        {monteCarloResult.serviceLevelAchievedPct}%
                      </div>
                      <div className="text-[11px] text-slate-500">Stockout Prob: {monteCarloResult.stockoutProbabilityPct}%</div>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400">Order Fill Rate</div>
                      <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
                        {monteCarloResult.fillRatePct}%
                      </div>
                      <div className="text-[11px] text-slate-500">Volumetric demand met</div>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400">95% Value-at-Risk (Units Short)</div>
                      <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                        {monteCarloResult.valueAtRisk95Units} units
                      </div>
                      <div className="text-[11px] text-slate-500">Worst 5% tail risk scenario</div>
                    </div>
                  </div>

                  <div className="lg:col-span-3">
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Ending Inventory Distribution Across 1,000 Stochastic Iterations
                    </div>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monteCarloResult.histogram}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                          <YAxis stroke="#64748b" fontSize={10} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '0.75rem',
                              color: '#e2e8f0',
                            }}
                          />
                          <Bar dataKey="count" name="Trial Frequency" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl">
                  <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-60" />
                  <div className="text-sm font-semibold text-slate-300">Stochastic Simulation Ready</div>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Click "Run Monte Carlo Trial" to execute 1,000 simulated fulfillment cycles under stochastic lead time and customer demand.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 5: GREEN LOGISTICS & DELIVERY ROUTE PLANNING
           ===================================================================== */}
        {activeTab === 'routing' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">Green Logistics & Delivery Route Planning</h1>
                <p className="text-xs text-slate-400">
                  Haversine distance matrix with Nearest-Neighbor construction and 2-Opt edge-exchange refinement
                </p>
              </div>

              <div className="flex items-center gap-3">
                <form onSubmit={handlePlanRoute} className="flex items-center gap-2">
                  <select
                    value={routeConfig.algorithm}
                    onChange={(e) => setRouteConfig({ ...routeConfig, algorithm: e.target.value as any })}
                    className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-medium"
                  >
                    <option value="two_opt">2-Opt Local Search (Optimal)</option>
                    <option value="nearest_neighbor">Nearest-Neighbor (Heuristic)</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Optimize Tour</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Green Logistics Telemetry Cards */}
            {activeRoutePlan && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Optimized Tour Distance</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {activeRoutePlan.totalDistanceKm} <span className="text-xs text-slate-500">km</span>
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1">
                    Saved: {activeRoutePlan.distanceSavedKm} km vs unoptimized
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Carbon Footprint Saved</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    {greenLogisticsData?.co2SavedKg || '124.5'} <span className="text-xs text-slate-500">kg CO₂</span>
                  </div>
                  <div className="text-[11px] text-emerald-300 mt-1">
                    Rating: {greenLogisticsData?.greenEfficiencyRating || 'A+'} ({(greenLogisticsData?.carbonReductionPct || 18.5).toFixed(1)}% cut)
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Estimated Duration</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {activeRoutePlan.estimatedDurationHrs} <span className="text-xs text-slate-500">hrs</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Avg 65 km/h commercial transit</div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Fleet Utilization</div>
                  <div className="text-2xl font-bold text-cyan-400 font-mono mt-1">
                    {activeRoutePlan.utilizationPct}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {activeRoutePlan.totalLoadUnits} / {activeRoutePlan.vehicleCapacity} units load
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Visual Route Map (SVG) */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white font-display">
                    Interactive Dispatch Route Map (Midwest Logistics Corridor)
                  </h2>
                  <p className="text-xs text-slate-400">Geometric projection of distribution stops and optimized traversal edge</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span>Depot (Origin)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span>Customer Stops</span>
                  </span>
                </div>
              </div>

              {/* Visual Route Canvas */}
              <div className="w-full h-80 bg-slate-950/90 rounded-2xl border border-slate-800/80 relative overflow-hidden flex items-center justify-center p-4">
                <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
                  {/* Grid Lines */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />

                  {/* Draw Delivery Path Polyline */}
                  {activeRoutePlan && activeRoutePlan.orderedStops && (
                    <polyline
                      points={activeRoutePlan.orderedStops
                        .map((stop) => {
                          // Simple geographical bounding box projection to SVG coordinates
                          const x = ((stop.longitude - -88.5) / 3.0) * 700 + 50;
                          const y = 350 - ((stop.latitude - 41.5) / 2.0) * 300;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="3"
                      strokeDasharray="6 3"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Render Stop Nodes */}
                  {activeRoutePlan?.orderedStops?.map((stop, index) => {
                    const x = ((stop.longitude - -88.5) / 3.0) * 700 + 50;
                    const y = 350 - ((stop.latitude - 41.5) / 2.0) * 300;
                    const isDepot = stop.nodeType === 'depot';

                    return (
                      <g key={stop.code + index}>
                        <circle
                          cx={x}
                          cy={y}
                          r={isDepot ? 9 : 7}
                          fill={isDepot ? '#06b6d4' : '#10b981'}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x={x}
                          y={y - 12}
                          textAnchor="middle"
                          fill="#e2e8f0"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="monospace"
                        >
                          {index === 0 ? 'DEPOT' : `#${index} ${stop.code}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Turn-by-Turn Route Manifest Table */}
            <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white font-display">Stop-by-Stop Manifest</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {activeRoutePlan?.orderedStops?.length || 0} Ordered Legs
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="px-4 py-2.5">Seq</th>
                      <th className="px-4 py-2.5">Node Code</th>
                      <th className="px-4 py-2.5">City & Facility</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Demand</th>
                      <th className="px-4 py-2.5 text-right">Leg Distance</th>
                      <th className="px-4 py-2.5 text-right">Cumulative Km</th>
                      <th className="px-4 py-2.5 text-right">Est. ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {activeRoutePlan?.orderedStops?.map((s) => (
                      <tr key={s.sequence} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-cyan-400 font-bold">#{s.sequence}</td>
                        <td className="px-4 py-2.5 text-white font-bold">{s.code}</td>
                        <td className="px-4 py-2.5 text-slate-300 font-sans">{s.city} ({s.name})</td>
                        <td className="px-4 py-2.5 text-slate-400 uppercase text-[10px]">{s.nodeType}</td>
                        <td className="px-4 py-2.5 text-right text-slate-300">{s.demandUnits} u</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{s.legDistanceKm} km</td>
                        <td className="px-4 py-2.5 text-right text-white">{s.cumulativeDistanceKm} km</td>
                        <td className="px-4 py-2.5 text-right text-cyan-400">+{s.etaHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Multi-Thread Benchmark Runner */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span>Multi-Worker Pool Compute Benchmark</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Benchmarks sequential single-thread vs Node.js worker_threads parallel pool for large SKU portfolios
                </p>
              </div>

              <div className="flex items-center gap-3">
                {benchmarkResult && (
                  <div className="text-right text-xs font-mono mr-2">
                    <span className="text-emerald-400 font-bold">{benchmarkResult.speedupFactor}x Speedup</span> · {benchmarkResult.parallelMs}ms parallel
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRunBenchmark}
                  disabled={runningBenchmark}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Play className={`w-3.5 h-3.5 ${runningBenchmark ? 'animate-spin' : ''}`} />
                  <span>{runningBenchmark ? 'Benchmarking...' : 'Run Parallel Test'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 6: WHAT-IF SCENARIO STRESS TESTING (ENTERPRISE SIMULATOR)
           ===================================================================== */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">What-If Scenario Stress Testing Engine</h1>
                <p className="text-xs text-slate-400">
                  Simulate macroeconomic disruptions, supply chain lead time delays, and inflation across all catalog SKUs
                </p>
              </div>

              <button
                type="button"
                onClick={runScenarioSimulation}
                disabled={runningScenario}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Sparkles className={`w-3.5 h-3.5 ${runningScenario ? 'animate-spin' : ''}`} />
                <span>{runningScenario ? 'Simulating Impact...' : 'Recalculate Stress Test'}</span>
              </button>
            </div>

            {/* Interactive Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 glass-panel rounded-2xl p-6 border border-slate-800">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Demand Shock:</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {scenarioParams.demandMultiplier >= 1 ? '+' : ''}
                    {Math.round((scenarioParams.demandMultiplier - 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={scenarioParams.demandMultiplier}
                  onChange={(e) =>
                    setScenarioParams({ ...scenarioParams, demandMultiplier: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>-50% Recession</span>
                  <span>+100% Surge</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Supplier Lead Time Delay:</span>
                  <span className="font-mono text-amber-400 font-bold">
                    +{scenarioParams.leadTimeDeltaDays} days
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="21"
                  step="1"
                  value={scenarioParams.leadTimeDeltaDays}
                  onChange={(e) =>
                    setScenarioParams({ ...scenarioParams, leadTimeDeltaDays: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>0 days on-time</span>
                  <span>+21 days bottleneck</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Unit Cost Inflation:</span>
                  <span className="font-mono text-rose-400 font-bold">
                    +{Math.round((scenarioParams.unitCostMultiplier - 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.5"
                  step="0.02"
                  value={scenarioParams.unitCostMultiplier}
                  onChange={(e) =>
                    setScenarioParams({ ...scenarioParams, unitCostMultiplier: Number(e.target.value) })
                  }
                  className="w-full accent-rose-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Base Cost</span>
                  <span>+50% Inflation</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Holding Rate Increase:</span>
                  <span className="font-mono text-indigo-400 font-bold">
                    +{Math.round(scenarioParams.holdingCostRateDelta * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.15"
                  step="0.01"
                  value={scenarioParams.holdingCostRateDelta}
                  onChange={(e) =>
                    setScenarioParams({ ...scenarioParams, holdingCostRateDelta: Number(e.target.value) })
                  }
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Base Cost</span>
                  <span>+15% Capital Cost</span>
                </div>
              </div>
            </div>

            {/* Scenario Impact Comparison Cards */}
            {scenarioResult && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                    <div className="text-xs text-slate-400">Projected Working Capital</div>
                    <div className="text-xl font-bold text-white font-mono mt-1">
                      ${Math.round(scenarioResult.stressed.totalWorkingCapital).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-rose-400 mt-1">
                      +${Math.round(scenarioResult.deltas.workingCapitalDelta).toLocaleString()} (+{scenarioResult.deltas.workingCapitalDeltaPct}%)
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                    <div className="text-xs text-slate-400">Total Annual Carrying Cost</div>
                    <div className="text-xl font-bold text-white font-mono mt-1">
                      ${Math.round(scenarioResult.stressed.totalAnnualCost).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-rose-400 mt-1">
                      +${Math.round(scenarioResult.deltas.annualCostDelta).toLocaleString()} (+{scenarioResult.deltas.annualCostDeltaPct}%)
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                    <div className="text-xs text-slate-400">Severe Stockout Risks</div>
                    <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                      {scenarioResult.stressed.stockoutSkusCount} <span className="text-xs text-slate-500">SKUs</span>
                    </div>
                    <div className="text-[11px] text-rose-300 mt-1">
                      +{scenarioResult.deltas.newShortagesCount} new critical shortages
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                    <div className="text-xs text-slate-400">Expedited Reorders Needed</div>
                    <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                      {scenarioResult.stressed.reorderRequiredCount} <span className="text-xs text-slate-500">SKUs</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Lead time defense trigger</div>
                  </div>
                </div>

                {/* Stressed At-Risk SKUs Table */}
                <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-4 bg-slate-950 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white font-display">
                      Identified Vulnerable SKUs Under Stressed Conditions
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="px-4 py-2.5">SKU & Name</th>
                          <th className="px-4 py-2.5">Category</th>
                          <th className="px-4 py-2.5 text-right">Available Qty</th>
                          <th className="px-4 py-2.5 text-right">Stressed ROP</th>
                          <th className="px-4 py-2.5 text-right">Deficit (Units)</th>
                          <th className="px-4 py-2.5 text-right">Stockout Risk</th>
                          <th className="px-4 py-2.5">Recommended Mitigation Strategy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {scenarioResult.atRiskSkus.map((sku) => (
                          <tr key={sku.sku} className="hover:bg-slate-800/30">
                            <td className="px-4 py-2.5 font-mono text-white font-bold">{sku.sku}</td>
                            <td className="px-4 py-2.5 text-slate-300">{sku.category}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-300">{sku.baselineAvailable}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-amber-400">{sku.stressedROP}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-rose-400 font-bold">{sku.projectedShortageUnits}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-rose-400 font-bold">{sku.projectedStockoutRiskPct}%</td>
                            <td className="px-4 py-2.5 text-slate-400">{sku.suggestedAction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 7: PROCUREMENT & PURCHASE ORDERS (PO)
           ===================================================================== */}
        {activeTab === 'procurement' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">Purchase Orders & Inbound Procurement</h1>
                <p className="text-xs text-slate-400">
                  Automated replenishment orders with atomic inventory receipt into SQLite database
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreatePO(true)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Purchase Order</span>
              </button>
            </div>

            {/* PO Table */}
            <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="px-4 py-3">PO Number</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total Amount</th>
                      <th className="px-4 py-3">Expected Delivery</th>
                      <th className="px-4 py-3">Created By</th>
                      <th className="px-4 py-3">Order Line Items</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-bold text-white">{po.po_number}</td>
                        <td className="px-4 py-3 font-sans text-slate-300">{po.supplier_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : po.status === 'IN_TRANSIT'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-white font-bold">${po.total_amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400">{po.expected_delivery_date}</td>
                        <td className="px-4 py-3 font-sans text-slate-400">{po.created_by}</td>
                        <td className="px-4 py-3 font-sans text-slate-400 text-[11px]">
                          {po.items?.map((it) => `${it.sku} (${it.ordered_qty}u)`).join(', ') || 'Standard replenishment'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {po.status !== 'RECEIVED' ? (
                            <button
                              type="button"
                              onClick={() => handleReceivePO(po.id)}
                              className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[11px] font-sans font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Receive Delivery
                            </button>
                          ) : (
                            <span className="text-slate-500 font-sans text-[11px]">Fulfilled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create PO Modal */}
            {showCreatePO && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="glass-panel border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white font-display">Create Purchase Order</h3>
                    <button
                      type="button"
                      onClick={() => setShowCreatePO(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreatePurchaseOrder} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Select Supplier</label>
                      <select
                        value={newPOForm.supplierId}
                        onChange={(e) => {
                          const s = suppliers.find((x) => x.id === Number(e.target.value));
                          setNewPOForm({
                            ...newPOForm,
                            supplierId: Number(e.target.value),
                            supplierName: s?.name || 'Global Industrial Supply',
                          });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                      >
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Target Product SKU</label>
                      <select
                        value={newPOForm.productId}
                        onChange={(e) => setNewPOForm({ ...newPOForm, productId: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Order Quantity</label>
                        <input
                          type="number"
                          required
                          value={newPOForm.orderedQty}
                          onChange={(e) => setNewPOForm({ ...newPOForm, orderedQty: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Expected Delivery Date</label>
                        <input
                          type="date"
                          required
                          value={newPOForm.expectedDeliveryDate}
                          onChange={(e) => setNewPOForm({ ...newPOForm, expectedDeliveryDate: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Notes / Instructions</label>
                      <input
                        type="text"
                        value={newPOForm.notes}
                        onChange={(e) => setNewPOForm({ ...newPOForm, notes: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreatePO(false)}
                        className="px-4 py-2 text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl"
                      >
                        Release Purchase Order
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 8: SUPPLIERS & NETWORK HEALTH
           ===================================================================== */}
        {activeTab === 'suppliers' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">Supplier Network Scorecard</h1>
                <p className="text-xs text-slate-400">
                  On-time fulfillment reliability, quality ratings, and vendor risk matrix
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map((s) => (
                <div key={s.id} className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{s.code}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.risk_score === 'LOW'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : s.risk_score === 'MEDIUM'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {s.risk_score} RISK
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white mb-1">{s.name}</h3>
                    <p className="text-xs text-slate-400 mb-4">{s.contact_email}</p>

                    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-center text-xs">
                      <div>
                        <div className="text-[10px] text-slate-500">On-Time %</div>
                        <div className="font-bold text-emerald-400 font-mono mt-0.5">{s.on_time_rate}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Quality ★</div>
                        <div className="font-bold text-amber-400 font-mono mt-0.5">{s.quality_rating}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Lead Time</div>
                        <div className="font-bold text-white font-mono mt-0.5">{s.lead_time_days}d</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between">
                    <span>Active Partner Status</span>
                    <span className="text-cyan-400">Verified SLA</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 9: AUDIT TRAIL & DATABASE GOVERNANCE
           ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">System Governance & Audit Trail</h1>
                <p className="text-xs text-slate-400">
                  Immutable SQLite audit logging and database integrity maintenance
                </p>
              </div>

              {/* Maintenance Tools */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunIntegrityCheck}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 rounded-xl cursor-pointer"
                >
                  PRAGMA Integrity
                </button>
                <button
                  type="button"
                  onClick={handleWalCheckpoint}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-400 border border-slate-700 rounded-xl cursor-pointer"
                >
                  Force WAL Checkpoint
                </button>
                <button
                  type="button"
                  onClick={handleVacuumDb}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-400 border border-slate-700 rounded-xl cursor-pointer"
                >
                  VACUUM DB
                </button>
              </div>
            </div>

            {/* Database Engine Diagnostics */}
            {systemMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Journal Mode</div>
                  <div className="text-xl font-bold text-cyan-400 font-mono mt-1 uppercase">
                    {systemMetrics.database.journalMode}
                  </div>
                  <div className="text-[11px] text-slate-500">64MB Shared Page Cache</div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Database Size on Disk</div>
                  <div className="text-xl font-bold text-white font-mono mt-1">
                    {Math.round(systemMetrics.database.totalSizeBytes / 1024)} <span className="text-xs text-slate-500">KB</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Pages: {systemMetrics.database.pageCount}</div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Node Runtime Memory</div>
                  <div className="text-xl font-bold text-white font-mono mt-1">
                    {systemMetrics.runtime.memory.heapUsedMb} <span className="text-xs text-slate-500">MB Used</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Total: {systemMetrics.runtime.memory.heapTotalMb} MB</div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Engine Uptime</div>
                  <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                    {Math.floor(systemMetrics.runtime.uptimeSeconds / 60)}m {systemMetrics.runtime.uptimeSeconds % 60}s
                  </div>
                  <div className="text-[11px] text-slate-500">Node {systemMetrics.runtime.nodeVersion}</div>
                </div>
              </div>
            )}

            {/* Audit Logs Table */}
            <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white font-display">Chronological Audit Log Feed</h3>
                <span className="text-xs text-slate-400 font-mono">{auditLogs.length} Logged Transactions</span>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold sticky top-0">
                      <th className="px-4 py-2.5">ID</th>
                      <th className="px-4 py-2.5">User</th>
                      <th className="px-4 py-2.5">Action</th>
                      <th className="px-4 py-2.5">Entity</th>
                      <th className="px-4 py-2.5">Entity ID</th>
                      <th className="px-4 py-2.5">Details</th>
                      <th className="px-4 py-2.5 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-500">#{log.id}</td>
                        <td className="px-4 py-2 text-slate-300 font-sans">{log.user_email}</td>
                        <td className="px-4 py-2 text-cyan-400 font-bold">{log.action}</td>
                        <td className="px-4 py-2 text-slate-400">{log.entity_type}</td>
                        <td className="px-4 py-2 text-white">{log.entity_id}</td>
                        <td className="px-4 py-2 text-slate-400 font-sans max-w-xs truncate">
                          {JSON.stringify(log.details)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500">{log.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 10: ACTIONABLE DECISION SUPPORT RECOMMENDATIONS
           ===================================================================== */}
        {activeTab === 'recommendations' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white font-display">
                  Algorithmic Decision Support Recommendations
                </h1>
                <p className="text-xs text-slate-400">
                  Synthesized from continuous inventory positions, demand surge signals, and carrying costs
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateRecommendations}
                disabled={generatingRecs}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Sparkles className={`w-3.5 h-3.5 ${generatingRecs ? 'animate-spin' : ''}`} />
                <span>{generatingRecs ? 'Synthesizing...' : 'Regenerate Decision Matrix'}</span>
              </button>
            </div>

            {/* Recommendations List */}
            <div className="space-y-4">
              {recommendations.map((rec) => {
                const isPending = rec.status === 'PENDING';
                return (
                  <div
                    key={rec.id}
                    className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="space-y-2 max-w-3xl">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            rec.priority === 'HIGH'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : rec.priority === 'MEDIUM'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {rec.priority} PRIORITY
                        </span>
                        <span className="text-xs font-mono text-cyan-400">{rec.category.replace('_', ' ')}</span>
                        {rec.sku && <span className="text-xs font-mono text-slate-400">({rec.sku})</span>}
                      </div>

                      <h3 className="text-base font-bold text-white font-display">{rec.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{rec.rationale}</p>

                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-cyan-300">
                        <strong className="text-white">Suggested Action: </strong>
                        {rec.suggested_action}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Estimated Capital Savings</div>
                        <div className="text-xl font-bold text-emerald-400 font-mono">
                          ${rec.estimated_savings.toLocaleString()}
                        </div>
                      </div>

                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecision(rec.id, 'ACCEPTED')}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(rec.id, 'REJECTED')}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Decline</span>
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-semibold font-mono ${
                            rec.status === 'ACCEPTED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          DECIDED: {rec.status}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/lib/auth-context";
import { Card, CardContent } from "../components/ui/card";
import {
  Package, FileText, Truck, ClipboardCheck,
  Users, DollarSign, Loader2, Building2, FileUp, ShoppingBag,
} from "lucide-react";
import {
  listProducts,
  listPurchaseRequests,
  getQCPendingGRNs,
  listSuppliers,
  listVendors,
  listEmployees,
  listPurchaseOrders,
  listASN,
  listGRNs,
  listGRNItems,
  listStockMovements,
  listInventoryRows,
} from "../services/apiService";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowRight, Clock, CheckCircle2, AlertCircle, ArrowUpRight,
  ArrowDownRight, ListChecks, Activity, TrendingUp, TrendingDown, ShoppingBag as ShoppingBagIcon,
} from "lucide-react";

// Normalise any API response shape to a plain array
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items", "vendors", "products",
                      "suppliers", "employees"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalProducts:  0,
    pendingPRs:     0,
    pendingQC:      0,
    totalSuppliers: 0,
    totalVendors:   0,
    totalEmployees: 0,
    // New KPIs
    totalInventory: 0,
    prToday: 0,
    poToday: 0,
    grnToday: 0,
    rejectedToday: 0,
    pendingDispatch: 0,
    lowStock: 0,
  });
  const [isLoading, setIsLoading]     = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [trackingFlow, setTrackingFlow] = useState([]);
  const [qcData, setQcData] = useState([]);
  const [inventoryInsights, setInventoryInsights] = useState({ lowStockItems: [], fastMoving: [] });
  const [outboundStats, setOutboundStats] = useState({ pending: 0, shippedToday: 0, delayed: 0 });
  const [smartInsights, setSmartInsights] = useState([]);
  const [actionTasks, setActionTasks] = useState([]);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [
        productsRes, prsRes, qcGrnsRes, suppliersRes, vendorsRes, employeesRes,
        posRes, asnRes, grnsRes, grnItemsRes, movementsRes, inventoryRes
      ] = await Promise.allSettled([
        listProducts(),
        listPurchaseRequests(),
        getQCPendingGRNs(),
        listSuppliers(),
        listVendors(),
        listEmployees(),
        listPurchaseOrders(),
        listASN(),
        listGRNs(),
        listGRNItems(),
        listStockMovements(),
        listInventoryRows(),
      ]);

      const getValue = (s) => (s.status === "fulfilled" ? s.value : null);

      const productsData  = getValue(productsRes);
      const prsData       = getValue(prsRes);
      const qcGrnsData    = getValue(qcGrnsRes);
      const posData       = getValue(posRes);
      const asnData       = getValue(asnRes);
      const grnsData      = getValue(grnsRes);
      const grnItemsData  = getValue(grnItemsRes);
      const movementsData = getValue(movementsRes);
      const inventoryData = getValue(inventoryRes);

      const productList  = toArray(productsData, "products");
      const prList       = toArray(prsData);
      const qcList       = toArray(qcGrnsData);
      const poList       = toArray(posData);
      const asnList      = toArray(asnData);
      const grnList      = toArray(grnsData);
      const grnItemsList = toArray(grnItemsData);
      const movementList = toArray(movementsData);
      const inventoryList = toArray(inventoryData);

      const isToday = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const today = new Date();
        return d.getDate() === today.getDate() &&
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear();
      };

      // ── Enhanced Stock Calculation ──
      // Calculate stock per product from inventory rows
      const stockMap = inventoryList.reduce((acc, row) => {
        const pid = row.product_id || row.product?.product_id;
        if (!pid) return acc;
        acc[pid] = (acc[pid] || 0) + (row.quantity || 0);
        return acc;
      }, {});

      const prToday = prList.filter(pr => isToday(pr.created_at));
      const poToday = poList.filter(po => isToday(po.created_at));
      const grnToday = grnList.filter(grn => isToday(grn.created_at));
      
      // Rejected items today: GRNItem with rejected_quantity > 0 and updated today
      const rejectedToday = grnItemsList.filter(item => (item.rejected_quantity > 0) && isToday(item.updated_at || item.created_at));
      
      // Pending Dispatch: POs that don't have a GRN yet
      const grnPoIds = new Set(grnList.map(g => g.po_id || g.po?.po_id));
      const pendingDispatch = poList.filter(po => !grnPoIds.has(po.po_id));
      
      const lowStockItems = productList.filter(p => {
        const stock = stockMap[p.product_id] || 0;
        return stock <= (p.re_order || 10);
      });
      
      const totalInventory = Object.values(stockMap).reduce((sum, qty) => sum + Math.max(0, qty), 0);

      setStats({
        totalProducts:  productList.length,
        pendingPRs:     prList.filter(pr => pr.status === "Pending" || pr.status === "Finance Pending").length,
        pendingQC:      grnItemsList.filter(i => i.qc_status === "Pending").length,
        totalSuppliers: toArray(getValue(suppliersRes)).length,
        totalVendors:   toArray(getValue(vendorsRes), "vendors").length,
        totalEmployees: toArray(getValue(employeesRes)).length,
        totalInventory,
        prToday: prToday.length,
        poToday: poToday.length,
        grnToday: grnToday.length,
        rejectedToday: rejectedToday.length,
        pendingDispatch: pendingDispatch.length,
        lowStock: lowStockItems.length,
      });

      // Order Tracking Flow
      setTrackingFlow([
        { label: "PR", count: prList.length, color: "bg-blue-500" },
        { label: "PO", count: poList.length, color: "bg-indigo-500" },
        { label: "ASN", count: asnList.length, color: "bg-purple-500" },
        { label: "GRN", count: grnList.length, color: "bg-cyan-500" },
        { label: "QC", count: grnItemsList.filter(i => i.qc_status === "Pending").length, color: "bg-amber-500" },
        { label: "Inventory", count: productList.filter(p => (stockMap[p.product_id] || 0) > 0).length, color: "bg-emerald-500" },
      ]);

      // QC Insights: Sum quantities
      const qcAccepted = grnItemsList.reduce((sum, i) => sum + (i.accepted_quantity || 0), 0);
      const qcRejected = grnItemsList.reduce((sum, i) => sum + (i.rejected_quantity || 0), 0);
      setQcData([
        { name: "Accepted", value: qcAccepted, color: "#10B981" },
        { name: "Rejected", value: qcRejected, color: "#EF4444" },
      ]);

      // Inventory Insights
      const fastMoving = movementList
        .filter(m => m.movement_type === "OUTBOUND")
        .reduce((acc, m) => {
          const key = m.product_name || m.product?.product_name || "Unknown Product";
          if (!acc[key]) acc[key] = 0;
          acc[key] += Math.abs(m.quantity);
          return acc;
        }, {});
      
      const fastMovingSorted = Object.entries(fastMoving)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));

      setInventoryInsights({
        lowStockItems: lowStockItems.slice(0, 5).map(p => ({
          product_name: p.product_name,
          current_stock: stockMap[p.product_id] || 0,
          product_id: p.product_id
        })),
        fastMoving: fastMovingSorted,
      });

      // Outbound Insights
      const shippedToday = movementList.filter(m => m.movement_type === "OUTBOUND" && isToday(m.created_at)).length;
      setOutboundStats({
        pending: pendingDispatch.length,
        shippedToday,
        delayed: pendingDispatch.filter(po => {
          const created = new Date(po.created_at);
          const diff = (new Date() - created) / (1000 * 60 * 60 * 24);
          return diff > 3; // Delayed if more than 3 days
        }).length,
      });

      // Smart Insights & Actions
      const insights = [];
      const tasks = [];

      const pendingQCCount = grnItemsList.filter(i => i.qc_status === "Pending").length;
      if (pendingQCCount > 0) {
        insights.push(`${pendingQCCount} items stuck in QC`);
        tasks.push("Approve QC items");
      }
      
      const unpoPRs = prList.filter(pr => pr.status === "Approved");
      if (unpoPRs.length > 0) {
        insights.push(`${unpoPRs.length} PR not converted to PO`);
        tasks.push("Convert PR to PO");
      }

      if (pendingDispatch.length > 0) {
        insights.push(`${pendingDispatch.length} orders pending dispatch`);
        tasks.push("Dispatch pending orders");
      }

      setSmartInsights(insights);
      setActionTasks(tasks);

      setRecentActivity(
        prList.slice(0, 5).map((pr) => ({
          time: pr.created_at ? new Date(pr.created_at).toLocaleString() : "Recently",
          text: `PR #${pr.pr_id} — ${pr.product_name || "Product"} (${pr.status})`,
          type: pr.status === "Approved" ? "success" : pr.status === "Rejected" ? "error" : "warning",
        }))
      );
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Stat cards per role ── */
  const roleStats = {
    admin: [
      { label: "Total Products",  value: stats.totalProducts,  icon: Package,   alert: false },
      { label: "Employees",       value: stats.totalEmployees, icon: Users,     alert: false },
      { label: "Pending PRs",     value: stats.pendingPRs,     icon: FileText,  alert: stats.pendingPRs > 0 },
      { label: "Active Vendors",  value: stats.totalVendors,   icon: Building2, alert: false },
    ],
    manager: [
      { label: "Pending PRs",    value: stats.pendingPRs,    icon: FileText,  alert: stats.pendingPRs > 0 },
      { label: "Total Vendors",  value: stats.totalVendors,  icon: Truck,     alert: false },
      { label: "Total Products", value: stats.totalProducts, icon: Package,   alert: false },
      { label: "Pending QC",     value: stats.pendingQC,     icon: ClipboardCheck, alert: false },
    ],
    supervisor: [
      { label: "Pending QC",      value: stats.pendingQC,      icon: ClipboardCheck, alert: false },
      { label: "Total Suppliers", value: stats.totalSuppliers, icon: Truck,           alert: false },
      { label: "Total Products",  value: stats.totalProducts,  icon: Package,         alert: false },
    ],
    quality_checker: [
      { label: "Pending QC",     value: stats.pendingQC,     icon: ClipboardCheck, alert: false },
      { label: "Total Products", value: stats.totalProducts, icon: Package,         alert: false },
    ],
    quality_assistant: [
      { label: "Pending QC",     value: stats.pendingQC,     icon: ClipboardCheck, alert: false },
      { label: "Total Products", value: stats.totalProducts, icon: Package,         alert: false },
    ],
    finance_director: [
      { label: "Pending Approvals", value: stats.pendingPRs,   icon: FileText,   alert: stats.pendingPRs > 0 },
      { label: "Total Vendors",     value: stats.totalVendors, icon: DollarSign, alert: false },
      { label: "Total Products",    value: stats.totalProducts, icon: Package,   alert: false },
    ],
    inventory_manager: [
      { label: "Total Products", value: stats.totalProducts,  icon: Package,   alert: false },
      { label: "Active Vendors", value: stats.totalVendors,   icon: Building2, alert: false },
      { label: "Suppliers",      value: stats.totalSuppliers, icon: Users,     alert: false },
      { label: "Pending QC",     value: stats.pendingQC,      icon: ClipboardCheck, alert: false },
    ],
  };

  const currentStats = roleStats[user?.role] || roleStats.manager;

  /* ── Quick Action shortcuts per role ── */
  const quickActions = {
    admin: [
      { label: "Upload Agreement", icon: FileUp,   onClick: () => navigate("/vendors"),  desc: "Go to Vendors → Upload PDF" },
      { label: "Manage Users",     icon: Users,    onClick: () => navigate("/users"),    desc: "Add or edit system users" },
      { label: "View Finance",     icon: DollarSign, onClick: () => navigate("/finance"), desc: "Purchase request approvals" },
    ],
    inventory_manager: [
      { label: "Upload Agreement", icon: FileUp,    onClick: () => navigate("/vendors"), desc: "Go to Vendors → Upload PDF" },
      { label: "View Products",    icon: Package,   onClick: () => navigate("/products"), desc: "Browse product catalog" },
    ],
    manager: [
      { label: "Purchase Requests", icon: FileText, onClick: () => navigate("/purchase-requests"), desc: "Review and approve PRs" },
    ],
  };

  const currentActions = quickActions[user?.role] || [];

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Warehouse Control Panel
          </h1>
          <p className="text-sm text-gray-500">
            Real-time insights for <span className="font-semibold text-[#1E3A8A]">{user?.name}</span> • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">System Live</span>
          </div>
          <button 
            onClick={() => loadDashboardData()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Activity className={`w-4 h-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-[#1E3A8A] mb-4" />
          <p className="text-sm text-gray-500 font-medium">Syncing warehouse data...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── ROW 1: TOP KPI CARDS ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "Total Inventory", value: stats.totalInventory, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "PR Today", value: stats.prToday, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "PO Today", value: stats.poToday, icon: ShoppingBagIcon, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "GRN Today", value: stats.grnToday, icon: ClipboardCheck, color: "text-cyan-600", bg: "bg-cyan-50" },
              { label: "QC Pending", value: stats.pendingQC, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Rejected Today", value: stats.rejectedToday, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
              { label: "Pending Dispatch", value: stats.pendingDispatch, icon: Truck, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Low Stock", value: stats.lowStock, icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
            ].map((kpi, i) => (
              <Card key={i} className="shadow-sm border-gray-100 hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className={`w-8 h-8 ${kpi.bg} ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>
                    {kpi.icon && <kpi.icon className="w-4 h-4" />}
                  </div>
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{kpi.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{kpi.value.toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── ROW 2: ORDER TRACKING FLOW + QC INSIGHTS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Order Tracking Flow */}
            <Card className="lg:col-span-2 shadow-sm border-gray-100 overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Order Tracking Lifecycle</h3>
                    <p className="text-xs text-gray-500">Visual flow of warehouse supply chain stages</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    <Activity className="w-3 h-3" />
                    REAL-TIME
                  </div>
                </div>

                <div className="relative flex items-center justify-between">
                  {/* Progress Line Background */}
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 z-0" />
                  
                  {trackingFlow.map((step, i) => (
                    <div key={i} className="relative z-10 flex flex-col items-center group">
                      <div className={`w-12 h-12 rounded-full ${step.color} text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform`}>
                        <span className="text-xs font-bold">{step.count}</span>
                      </div>
                      <p className="text-[10px] font-bold text-gray-500 mt-3 uppercase tracking-widest">{step.label}</p>
                      
                      {i < trackingFlow.length - 1 && (
                        <div className="absolute top-1/2 left-[calc(100%+0.5rem)] -translate-y-1/2 hidden md:block">
                          <ArrowRight className="w-4 h-4 text-gray-300" />
                        </div>
                      )}

                      {/* Bottleneck indicator for QC or PO */}
                      {((step.label === 'QC' && stats.pendingQC > 5) || (step.label === 'PR' && stats.pendingPRs > 3)) && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 bg-amber-400 rounded-full" />
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">PR Bottleneck</p>
                      <p className="text-sm font-bold text-gray-700">{stats.pendingPRs} Pending Approval</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 bg-rose-400 rounded-full" />
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">QC Bottleneck</p>
                      <p className="text-sm font-bold text-gray-700">{stats.pendingQC} Awaiting Check</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 bg-emerald-400 rounded-full" />
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Flow Health</p>
                      <p className="text-sm font-bold text-gray-700">Optimal</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* QC Insights Widget */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <h3 className="text-base font-bold text-gray-900 mb-1">QC Performance</h3>
                <p className="text-xs text-gray-500 mb-6">Quality control pass/fail metrics</p>
                
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={qcData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {qcData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 flex justify-around">
                  {qcData.map((item, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{item.name}</p>
                      <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                  {qcData[1]?.value > 5 ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <p className="text-xs text-red-700 font-medium">Rejection rate increased this week</p>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-emerald-500" />
                      <p className="text-xs text-emerald-700 font-medium">Quality stability improved</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── ROW 3: INVENTORY + OUTBOUND INSIGHTS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Insights */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold text-gray-900">Inventory Intel</h3>
                  <Package className="w-4 h-4 text-gray-400" />
                </div>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Critical Low Stock</h4>
                    <div className="space-y-2">
                      {inventoryInsights.lowStockItems.length > 0 ? (
                        inventoryInsights.lowStockItems.map((item, i) => (
                          <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded transition-colors border border-transparent hover:border-gray-100">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-rose-50 rounded flex items-center justify-center text-rose-600 font-bold text-xs">
                                {item.current_stock}
                              </div>
                              <span className="text-sm font-medium text-gray-700">{item.product_name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">ID: {item.product_id}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 text-center py-4">No critical stock alerts</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-50">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Fast Moving (7D)</h4>
                    <div className="flex flex-wrap gap-2">
                      {inventoryInsights.fastMoving.map((item, i) => (
                        <div key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded text-xs font-semibold text-blue-700 flex items-center gap-2">
                          {item.name}
                          <span className="px-1.5 bg-blue-200 rounded-full text-[10px]">{item.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <p className="text-xs text-amber-600 font-medium italic">
                    "Insight: {stats.lowStock} items may go out of stock soon. Reorder recommended."
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Outbound Insights */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold text-gray-900">Outbound Velocity</h3>
                  <Truck className="w-4 h-4 text-gray-400" />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-gray-900">{outboundStats.pending}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pending</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                    <p className="text-2xl font-bold text-emerald-600">{outboundStats.shippedToday}</p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Shipped Today</p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-xl text-center border border-rose-100">
                    <p className="text-2xl font-bold text-rose-600">{outboundStats.delayed}</p>
                    <p className="text-[10px] font-bold text-rose-500 uppercase">Delayed</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Activity</h4>
                  <div className="space-y-3">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((item, i) => (
                        <div key={i} className="flex gap-3">
                          <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            item.type === "success" ? "bg-emerald-500" :
                            item.type === "error"   ? "bg-rose-500"   : "bg-amber-500"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-700 leading-relaxed">{item.text}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{item.time}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-4">No recent outbound activity</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── ROW 4: ACTION PANEL + SMART INSIGHTS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Action Panel */}
            <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-[#1E3A8A] text-white overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold">Operational Tasks</h3>
                    <p className="text-xs text-blue-200">System generated critical actions</p>
                  </div>
                  <ListChecks className="w-5 h-5 text-blue-300" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {actionTasks.length > 0 ? (
                    actionTasks.map((task, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (task.includes("QC")) navigate("/quality-check");
                          if (task.includes("PR")) navigate("/purchase-requests");
                          if (task.includes("GRN")) navigate("/grn");
                          if (task.includes("Dispatch")) navigate("/outbound");
                        }}
                        className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 rounded-xl transition-all group border border-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-semibold">{task}</span>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                      </button>
                    ))
                  ) : (
                    <div className="col-span-2 py-4 text-center text-blue-200 text-sm italic">
                      All caught up! No pending critical tasks.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Smart Insights Panel */}
            <Card className="shadow-sm border-gray-100 border-l-4 border-l-[#1E3A8A]">
              <CardContent className="p-6">
                <h3 className="text-base font-bold text-gray-900 mb-6">Smart Notifications</h3>
                <div className="space-y-4">
                  {smartInsights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                      <div className="w-2 h-2 rounded-full bg-[#1E3A8A] mt-1.5 shrink-0" />
                      <p className="text-xs text-gray-700 font-medium">{insight}</p>
                    </div>
                  ))}
                  {smartInsights.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-6">No new insights at this time.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
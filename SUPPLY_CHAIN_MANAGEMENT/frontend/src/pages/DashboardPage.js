import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/lib/auth-context";
import { Card, CardContent } from "../components/ui/card";
import {
  Package, FileText, Truck, ClipboardCheck,
  Users, DollarSign, Loader2, Building2, FileUp,
} from "lucide-react";
import {
  listProducts,
  listPurchaseRequests,
  getQCPendingGRNs,
  listSuppliers,
  listVendors,
  listEmployees,
} from "../services/apiService";

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
  });
  const [isLoading, setIsLoading]     = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [productsRes, prsRes, qcGrnsRes, suppliersRes, vendorsRes, employeesRes] =
        await Promise.allSettled([
          listProducts(),
          listPurchaseRequests(),
          getQCPendingGRNs(),
          listSuppliers(),
          listVendors(),
          listEmployees(),
        ]);

      const getValue = (s) => (s.status === "fulfilled" ? s.value : null);

      const productsData  = getValue(productsRes);
      const prsData       = getValue(prsRes);
      const qcGrnsData    = getValue(qcGrnsRes);
      const suppliersData = getValue(suppliersRes);
      const vendorsData   = getValue(vendorsRes);
      const employeesData = getValue(employeesRes);

      const productList  = toArray(productsData, "products");
      const prList       = toArray(prsData);
      const qcList       = toArray(qcGrnsData);
      const supplierList = toArray(suppliersData);
      // backend now returns { vendors: [...] }
      const vendorList   = toArray(vendorsData, "vendors");
      const employeeList = toArray(employeesData);

      const pendingPRs = prList.filter(
        (pr) => pr.status === "Pending" || pr.status === "Finance Pending"
      );

      setStats({
        totalProducts:  productsData?.count ?? productList.length,
        pendingPRs:     pendingPRs.length,
        pendingQC:      qcList.length,
        totalSuppliers: supplierList.length,
        totalVendors:   vendorList.length,
        totalEmployees: employeeList.length,
      });

      setRecentActivity(
        prList.slice(0, 5).map((pr) => ({
          time: pr.created_at
            ? new Date(pr.created_at).toLocaleString()
            : "Recently",
          text: `PR #${pr.pr_id} — ${pr.product?.product_name || "Product"} (${pr.status})`,
          type:
            pr.status === "Approved" ? "success" :
            pr.status === "Rejected" ? "error"   : "warning",
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(" ")[0] || "User"}
        </h1>
        <p className="text-sm text-gray-500 capitalize">
          {user?.role?.replace(/_/g, " ") || "Dashboard"} Dashboard
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#1E3A8A]" />
        </div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {currentStats.map((stat, index) => (
              <Card key={index} className="shadow-sm border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{stat.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${stat.alert ? "text-red-600" : "text-gray-900"}`}>
                        {stat.value}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.alert ? "bg-red-50" : "bg-[#1E3A8A]/10"}`}>
                      <stat.icon className={`w-4 h-4 ${stat.alert ? "text-red-600" : "text-[#1E3A8A]"}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Quick Actions (role-specific) ── */}
          {currentActions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={action.onClick}
                    className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-[#1E3A8A]/40 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#1E3A8A]/10 flex items-center justify-center shrink-0">
                      <action.icon className="w-4 h-4 text-[#1E3A8A]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{action.label}</p>
                      <p className="text-xs text-gray-500">{action.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent Activity ── */}
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
              ) : (
                <div className="space-y-0">
                  {recentActivity.map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}
                    >
                      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.type === "success" ? "bg-green-500" :
                        item.type === "error"   ? "bg-red-500"   : "bg-yellow-500"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">{item.text}</p>
                        <p className="text-xs text-gray-400">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
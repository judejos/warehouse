import React, { useState, useRef, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../components/lib/auth-context";
import { LogOut, Bell, X, ChevronRight, ClipboardList } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { listEmployees, listPurchaseRequests } from "../services/apiService";


/* First letter of the role string, upper-cased.
   inventory_manager → "I",  admin → "A",  supervisor → "S", etc. */
function roleInitial(role) {
  if (!role) return "U";
  return role.trim()[0].toUpperCase();
}

const SHOWN_AUTO_PR_KEY = "wms_shownAutoPRIds";

export function AppLayout() {
  const { user, logout, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // ── Auto-PR alert popup state (for managers/admins) ──
  const [autoPRAlerts, setAutoPRAlerts]     = useState([]);
  const [alertVisible, setAlertVisible]     = useState(false);
  const isManagerRole = ["manager", "admin"].includes(user?.role);

  /* Auto-sync user details if username is missing from old session storage */
  useEffect(() => {
    if (user && !user.username) {
      listEmployees()
        .then((employees) => {
          const current = employees.find((emp) => emp.employee_id === user.id);
          if (current) {
            const updated = {
              ...user,
              username: current.username,
              name: current.first_name || current.last_name
                ? `${current.first_name || ""} ${current.last_name || ""}`.trim()
                : current.username,
            };
            setUser(updated);
          }
        })
        .catch((err) => console.error("Error auto-fetching user details:", err));
    }
  }, [user, setUser]);

  /* ── Poll for pending auto-PRs (managers only) ── */
  const checkAutoPRs = useCallback(async () => {
    if (!isManagerRole || !user) return;
    try {
      const data = await listPurchaseRequests();
      const all = Array.isArray(data)
        ? data
        : Array.isArray(data?.results) ? data.results
        : Array.isArray(data?.data)    ? data.data
        : [];

      const pendingAuto = all.filter(
        (pr) => pr.is_auto_generated && pr.status === "Pending"
      );

      if (pendingAuto.length === 0) return;

      const shown = JSON.parse(
        sessionStorage.getItem(SHOWN_AUTO_PR_KEY) || "[]"
      );
      const fresh = pendingAuto.filter((pr) => !shown.includes(pr.pr_id));
      if (fresh.length === 0) return;

      // Mark these as shown so we don't re-alert
      sessionStorage.setItem(
        SHOWN_AUTO_PR_KEY,
        JSON.stringify([...shown, ...fresh.map((pr) => pr.pr_id)])
      );
      setAutoPRAlerts(fresh);
      setAlertVisible(true);
    } catch (_) {/* silent */}
  }, [isManagerRole, user]);

  useEffect(() => {
    checkAutoPRs();
    const id = setInterval(checkAutoPRs, 30000);
    return () => clearInterval(id);
  }, [checkAutoPRs]);

  /* Close dropdown on outside click */
  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileOpen]);

  /* Close dropdown on route change */
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);

  const getTitle = () => {
    const p = location.pathname;
    if (p.includes("upload-agreement"))  return "Upload Vendor Agreement";
    if (p.includes("dashboard"))         return "Dashboard";
    if (p.includes("users"))             return "User Management";
    if (p.includes("products"))          return "Products";
    if (p.includes("inventory"))         return "Inventory";
    if (p.includes("purchase-requests")) return "Purchase Requests";
    if (p.includes("asn/create"))        return "Create ASN";
    if (p.includes("asn"))               return "ASN";
    if (p.includes("grn"))               return "GRN";
    if (p.includes("suppliers"))         return "Suppliers";
    if (p.includes("vendors"))           return "Vendors";
    if (p.includes("warehouses"))        return "Warehouses";
    if (p.includes("outbound"))          return "Outbound Orders";
    if (p.includes("quality-check"))     return "Quality Check";
    if (p.includes("finance"))           return "Finance";
    if (p.includes("settings"))          return "Settings";
    if (p.includes("barcode-scanner"))   return "Barcode Scanner";
    return "";
  };

  const initial = roleInitial(user?.role);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Navbar ── */}
          <header className="h-12 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <h2 className="text-sm font-semibold text-foreground">{getTitle()}</h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Live notification bell */}
              <NotificationBell />

              {/* Avatar dropdown — single letter derived from role */}
              <div className="relative" ref={dropdownRef}>
                <button
                  id="navbar-profile-btn"
                  onClick={() => setProfileOpen(o => !o)}
                  className="w-8 h-8 rounded-full bg-[#1E3A8A] flex items-center justify-center text-sm font-bold text-white hover:opacity-90 transition-opacity select-none"
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  title={user?.role?.replace(/_/g, " ")}
                >
                  {initial}
                </button>

                {profileOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-lg z-50 overflow-hidden"
                    role="menu"
                  >
                    {/* User info header */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user?.username || user?.name || "User"}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 truncate">
                        {user?.id || ""}
                      </p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5 truncate">
                        {user?.role?.replace(/_/g, " ") || ""}
                      </p>
                    </div>

                    {/* Sign Out */}
                    <button
                      id="navbar-signout-btn"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 overflow-auto">
            <div className="animate-slide-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* ── Auto-PR Manager Alert Popup ── */}
      {alertVisible && autoPRAlerts.length > 0 && (
        <div
          className="fixed bottom-5 right-5 z-[300] max-w-sm w-full"
          style={{ animation: "autoPRSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-white" style={{ animation: "autoPRBellRing 0.8s ease" }} />
                <span className="text-white font-bold text-sm">Manager Approval Required</span>
              </div>
              <button
                onClick={() => setAlertVisible(false)}
                className="text-white/70 hover:text-white transition-colors rounded-full p-0.5"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="text-sm text-gray-500 mb-3">
                <span className="font-semibold text-gray-800">
                  {autoPRAlerts.length} auto-generated PR{autoPRAlerts.length > 1 ? "s" : ""}
                </span>{" "}
                pending your review.
              </p>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {autoPRAlerts.map((pr) => (
                  <div
                    key={pr.pr_id}
                    className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2 border border-blue-100"
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-[11px] font-mono font-bold text-blue-800">{pr.pr_id}</p>
                        <p className="text-[11px] text-gray-600 truncate max-w-[160px]">
                          {pr.product_name || "—"} &middot; {pr.requested_cartons} ctn
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-700 tabular-nums">
                      ₹{(pr.total_amount ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setAlertVisible(false);
                  navigate("/purchase-requests");
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Review Now <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes autoPRSlideIn {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes autoPRBellRing {
          0%,100% { transform: rotate(0); }
          15%     { transform: rotate(16deg); }
          35%     { transform: rotate(-12deg); }
          55%     { transform: rotate(8deg); }
          75%     { transform: rotate(-4deg); }
        }
      `}</style>
    </SidebarProvider>
  );
}
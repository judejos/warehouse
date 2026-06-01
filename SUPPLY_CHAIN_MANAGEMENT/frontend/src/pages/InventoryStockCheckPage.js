/**
 * InventoryStockCheckPage.js
 *
 * Dashboard for Inventory Manager:
 *   1. CPR Stock Check — Confirm or Reject stock availability for pending requests
 *   2. Pick & Pack / Dispatch — Move finalized Sales Orders from Finance Confirmed -> Pick & Pack -> Dispatched
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  CheckSquare, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Truck, Package, PackageOpen, HelpCircle,
} from "lucide-react";
import { listCPRs, inventoryActionCPR, listSalesOrders, pickPackSO, dispatchSO } from "../services/apiService";

// ── helpers ──────────────────────────────────────────────────────────────────
const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Pending":           "bg-amber-100 text-amber-800 border-amber-300",
  "Stock Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Stock Rejected":    "bg-red-100 text-red-800 border-red-300",
  "SO Created":        "bg-blue-100 text-blue-800 border-blue-300",
  "Finance Confirmed": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":       "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":        "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);

export default function InventoryStockCheckPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("cpr");
  const [cprs, setCPRs] = useState([]);
  const [sos, setSOs] = useState([]);
  const [loadingCPR, setLoadingCPR] = useState(true);
  const [loadingSO, setLoadingSO] = useState(true);
  const [showAllCPRs, setShowAllCPRs] = useState(false);

  // Dialog state for CPR Action
  const [actionCPR, setActionCPR] = useState(null); // CPR object
  const [actionType, setActionType] = useState(""); // "confirm" or "reject"
  const [actionNotes, setActionNotes] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Loading state for SO operations
  const [processingSOId, setProcessingSOId] = useState(null);

  const loadCPRs = useCallback(async () => {
    setLoadingCPR(true);
    try {
      const data = await listCPRs(showAllCPRs);
      setCPRs(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load CPRs", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCPR(false);
    }
  }, [showAllCPRs, toast]);

  const loadSOs = useCallback(async () => {
    setLoadingSO(true);
    try {
      const data = await listSalesOrders();
      setSOs(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load Orders", description: err.message, variant: "destructive" });
    } finally {
      setLoadingSO(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCPRs();
    loadSOs();
  }, [loadCPRs, loadSOs]);

  const handleCPRSubmit = async () => {
    if (!actionCPR || !actionType) return;
    if (actionType === "reject" && !actionNotes.trim()) {
      toast({ title: "Validation Error", description: "Please enter a reason/note for rejection.", variant: "destructive" });
      return;
    }

    setSavingAction(true);
    try {
      await inventoryActionCPR(actionCPR.cpr_id, {
        action: actionType,
        notes: actionNotes,
      });
      toast({
        title: actionType === "confirm" ? "Stock Confirmed ✅" : "Stock Rejected ❌",
        description: `Successfully processed CPR ${actionCPR.cpr_id}.`,
      });
      setActionCPR(null);
      setActionNotes("");
      loadCPRs();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingAction(false);
    }
  };

  const handleStartPickPack = async (soId) => {
    setProcessingSOId(soId);
    try {
      await pickPackSO(soId);
      toast({ title: "Pick & Pack Started 📦", description: `Sales Order ${soId} is now in Pick & Pack status.` });
      loadSOs();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingSOId(null);
    }
  };

  const handleDispatch = async (soId) => {
    setProcessingSOId(soId);
    try {
      await dispatchSO(soId);
      toast({ title: "Order Dispatched 🚚", description: `Sales Order ${soId} has been marked as Dispatched.` });
      loadSOs();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingSOId(null);
    }
  };

  const TABS = [
    { id: "cpr", label: "Stock Approvals (CPRs)", icon: CheckSquare },
    { id: "so",  label: "Pick, Pack & Dispatch", icon: Truck },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-[#1E3A8A]" /> Inventory Operations & Sales Dispatch
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Verify item availability and dispatch packages for confirmed Sales Orders</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-[#1E3A8A] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── CPR Tab ── */}
      {tab === "cpr" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#1E3A8A]" /> Pending Customer Requests
              <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {cprs.filter(c => c.status === "Pending").length}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAllCPRs}
                  onChange={e => { setShowAllCPRs(e.target.checked); }}
                  className="rounded border-gray-300 text-[#1E3A8A] focus:ring-[#1E3A8A] w-3.5 h-3.5"
                />
                Show historical CPRs
              </label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadCPRs}>
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">CPR ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product Requested</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Requested Qty</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Created By</TableHead>
                  <TableHead className="text-xs font-semibold">Request Notes</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCPR ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : cprs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-gray-400">No purchase requests to check at this time.</TableCell></TableRow>
                ) : cprs.map(c => (
                  <TableRow key={c.cpr_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{c.cpr_id}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{c.customer_name}</div>
                      <div className="text-[10px] text-gray-500">{c.customer_phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{c.product_name}</div>
                      <div className="text-[10px] font-mono text-gray-400">ID: {c.product}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold tabular-nums">{c.requested_quantity}</TableCell>
                    <TableCell><Pill status={c.status} /></TableCell>
                    <TableCell className="text-xs">{c.created_by_name || "Sales Manager"}</TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[160px] truncate" title={c.notes}>{c.notes || "—"}</TableCell>
                    <TableCell className="text-center">
                      {c.status === "Pending" ? (
                        <div className="flex justify-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => { setActionCPR(c); setActionType("confirm"); }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm Stock
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-red-600 hover:bg-red-700"
                            onClick={() => { setActionCPR(c); setActionType("reject"); }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">Checked: {c.inventory_notes || "No notes"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── SO Tab ── */}
      {tab === "so" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <Package className="w-4 h-4 text-[#1E3A8A]" /> Outbound Dispatch Queue
              <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {sos.filter(s => ["Finance Confirmed", "Pick & Pack"].includes(s.status)).length}
              </span>
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadSOs}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product Details</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Payment Status</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSO ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : sos.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-gray-400">No outbound Sales Orders in the dispatch queue.</TableCell></TableRow>
                ) : sos.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{s.customer_name}</div>
                      <div className="text-[10px] text-gray-500">{s.customer_phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{s.product_name}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold tabular-nums">{s.quantity}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-700">
                      {s.payment_info ? (
                        <div className="text-[10px] leading-tight text-right">
                          <span className="font-bold capitalize">{s.payment_info.payment_type} Payment</span>
                          <div>Rcvd: ₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</div>
                        </div>
                      ) : "Paid"}
                    </TableCell>
                    <TableCell><Pill status={s.status} /></TableCell>
                    <TableCell className="text-center">
                      {s.status === "Finance Confirmed" && (
                        <Button
                          size="sm"
                          disabled={processingSOId === s.so_id}
                          className="h-7 text-xs bg-[#1E3A8A] hover:bg-[#162d6e]"
                          onClick={() => handleStartPickPack(s.so_id)}
                        >
                          {processingSOId === s.so_id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <PackageOpen className="w-3.5 h-3.5 mr-1" />
                          )}
                          Start Pick & Pack
                        </Button>
                      )}
                      {s.status === "Pick & Pack" && (
                        <Button
                          size="sm"
                          disabled={processingSOId === s.so_id}
                          className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                          onClick={() => handleDispatch(s.so_id)}
                        >
                          {processingSOId === s.so_id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Truck className="w-3.5 h-3.5 mr-1" />
                          )}
                          Mark Dispatched
                        </Button>
                      )}
                      {s.status === "Dispatched" && (
                        <span className="text-xs text-teal-700 font-bold flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" /> Loaded & Dispatched
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Action Dialog */}
      {actionCPR && (
        <Dialog open onOpenChange={() => setActionCPR(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${actionType === "confirm" ? "text-emerald-700" : "text-red-700"}`}>
                {actionType === "confirm" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {actionType === "confirm" ? "Confirm Stock Availability" : "Reject Purchase Request"}
              </DialogTitle>
              <DialogDescription>
                {actionType === "confirm"
                  ? `Please verify that you have ${actionCPR.requested_quantity} units of ${actionCPR.product_name} ready in the warehouse inventory.`
                  : `Please specify the reason why CPR ${actionCPR.cpr_id} cannot be fulfilled.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              <div className="rounded-xl border bg-slate-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">CPR ID</span><span className="font-mono font-bold">{actionCPR.cpr_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Product</span><span className="font-semibold">{actionCPR.product_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Requested Qty</span><span className="font-semibold text-[#1E3A8A]">{actionCPR.requested_quantity} units</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{actionCPR.customer_name}</span></div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Notes / Remarks {actionType === "reject" && "*"}</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={actionType === "confirm" ? "e.g. Items verified in Zone B Bin 4. Stock checked and ready." : "e.g. Insufficient stock available in warehouse. Next stock arrival expected next week."}
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setActionCPR(null)} disabled={savingAction}>Cancel</Button>
              <Button
                onClick={handleCPRSubmit}
                disabled={savingAction}
                className={actionType === "confirm" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {savingAction ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                ) : actionType === "confirm" ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Confirm Availability</>
                ) : (
                  <><XCircle className="w-4 h-4 mr-2" />Reject Request</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

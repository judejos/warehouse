import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Label } from "../components/ui/label";
import {
  Plus, Search, Loader2, PackageOpen, Truck, ShoppingBag,
  RefreshCw, CheckCircle2, AlertTriangle, X, User,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { useToast } from "../components/ui/use-toast";
import {
  removeStockByProduct, listProducts, listStockMovements,
  listSalesOrders, pickPackSO, dispatchSO, listCustomers,
} from "../services/apiService";

/* ── helpers ── */
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"])
    if (Array.isArray(res[key])) return res[key];
  return Object.values(res).find(Array.isArray) || [];
};

/* ── STATUS helpers for Sales Orders ── */
const SO_STATUS_COLOR = {
  "Finance Confirmed": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":       "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":        "bg-teal-100 text-teal-800 border-teal-300",
};
const SOPill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SO_STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);



/* ── Confirm SO Dispatch Dialog ── */
function ConfirmSODispatchDialog({ so, onClose, onSuccess }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await dispatchSO(so.so_id);
      toast({
        title: "Dispatch Successful 🚚",
        description: `SO ${so.so_id} has been dispatched. Stock was automatically deducted.`,
      });
      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: "Dispatch Failed",
        description: err.message || "Unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            Confirm Sales Order Dispatch
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to dispatch <strong>{so.quantity} units</strong> for <strong>SO {so.so_id}</strong>? 
            This will automatically deduct physical stock from the warehouse using FIFO logic.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button 
            className="bg-teal-600 hover:bg-teal-700" 
            onClick={handleConfirm} 
            disabled={submitting}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Confirm Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════ MAIN PAGE ══════ */
export default function OutboundPage() {
  const { toast } = useToast();
  
  const [search, setSearch]             = useState("");
  const [movements, setMovements]       = useState([]);
  const [movLoading, setMovLoading]     = useState(true);
  
  const [sos, setSOs]                   = useState([]);
  const [loadingSO, setLoadingSO]       = useState(true);
  const [processingSOId, setProcessingSOId] = useState(null);
  
  const [dispatchSOObj, setDispatchSOObj]         = useState(null);

  // Load Data
  const loadData = useCallback(async () => {
    setMovLoading(true);
    setLoadingSO(true);
    try {
      const [movData, soData] = await Promise.all([
        listStockMovements(),
        listSalesOrders()
      ]);
      setMovements(toArray(movData));
      
      const arr = Array.isArray(soData) ? soData : soData?.results || soData?.data || soData?.items || [];
      setSOs(arr);
    } catch (err) {
      toast({ title: "Failed to load data", description: err.message, variant: "destructive" });
    } finally {
      setMovLoading(false);
      setLoadingSO(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle Pick & Pack transition for SOs
  const handleStartPickPack = async (soId) => {
    setProcessingSOId(soId);
    try {
      await pickPackSO(soId);
      toast({ title: "Pick & Pack Started 📦", description: `Sales Order ${soId} is now in Pick & Pack status.` });
      loadData();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingSOId(null);
    }
  };

  const queueSOs = sos.filter(s => ["Finance Confirmed", "Pick & Pack", "Dispatched"].includes(s.status));
  const q = search.toLowerCase();
  const filteredMovements = movements.filter(m => 
    m.movement_type === "OUTBOUND" && (
      !q ||
      m.product_name?.toLowerCase().includes(q) ||
      m.bin_id?.toLowerCase().includes(q) ||
      m.batch_number?.toLowerCase().includes(q) ||
      m.vendor_name?.toLowerCase().includes(q)
    )
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#1E3A8A]" /> Unified Outbound Dispatch
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage Sales Orders and manual stock dispatches efficiently with automated FIFO deductions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
          </Button>
        </div>
      </div>

      {/* ── Sales Order Dispatch Queue ── */}
      <Card className="shadow-sm overflow-hidden border-indigo-100">
        <div className="px-4 py-3 border-b bg-indigo-50/50 flex items-center justify-between">
          <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-700" /> Sales Order Queue
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              {sos.filter(s => ["Finance Confirmed", "Pick & Pack"].includes(s.status)).length} Pending
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-white hover:bg-white">
                <TableHead className="text-xs font-semibold text-slate-500">SO ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Customer</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Product Details</TableHead>
                <TableHead className="text-xs font-semibold text-right text-slate-500">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-right text-slate-500">Payment</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
                <TableHead className="text-xs font-semibold text-center text-slate-500 w-[160px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSO ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" /></TableCell></TableRow>
              ) : queueSOs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm font-medium text-slate-400">No pending outbound Sales Orders in the queue.</TableCell></TableRow>
              ) : queueSOs.map(s => (
                <TableRow key={s.so_id} className="hover:bg-slate-50/50 transition-colors group">
                  <TableCell className="text-xs font-mono font-bold text-indigo-700">{s.so_id}</TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-slate-800">{s.customer_name}</div>
                    <div className="text-[10px] text-slate-500">{s.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-slate-700">{s.product_name}</div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold tabular-nums text-slate-700">{s.quantity}</TableCell>
                  <TableCell className="text-xs text-right">
                    {s.payment_info ? (
                      <div className="text-[10px] leading-tight text-right text-emerald-700">
                        <span className="font-bold capitalize">{s.payment_info.payment_type}</span>
                        <div>₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</div>
                      </div>
                    ) : <span className="font-bold text-emerald-700 text-[10px]">Paid</span>}
                  </TableCell>
                  <TableCell><SOPill status={s.status} /></TableCell>
                  <TableCell className="text-center">
                    {s.status === "Finance Confirmed" && (
                      <Button
                        size="sm"
                        disabled={processingSOId === s.so_id}
                        className="h-8 w-full text-xs font-bold bg-[#1E3A8A] hover:bg-[#162d6e] shadow-sm transition-all group-hover:scale-105"
                        onClick={() => handleStartPickPack(s.so_id)}
                      >
                        {processingSOId === s.so_id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackageOpen className="w-3.5 h-3.5 mr-1.5" />}
                        Pick &amp; Pack
                      </Button>
                    )}
                    {s.status === "Pick & Pack" && (
                      <Button
                        size="sm"
                        className="h-8 w-full text-xs font-bold bg-teal-600 hover:bg-teal-700 shadow-sm transition-all group-hover:scale-105"
                        onClick={() => setDispatchSOObj(s)}
                      >
                        <Truck className="w-3.5 h-3.5 mr-1.5" />
                        Dispatch Now
                      </Button>
                    )}
                    {s.status === "Dispatched" && (
                      <span className="text-xs text-teal-700 font-bold flex items-center justify-center gap-1.5 bg-teal-50 py-1.5 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-teal-600" /> Dispatched
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Outbound Movement History ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-[#1E3A8A]" />
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Recent Physical Stock Deductions
            </p>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
              {filteredMovements.length}
            </span>
          </div>
          
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search history…"
              className="pl-8 h-8 text-xs bg-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-xs font-semibold">Product</TableHead>
                <TableHead className="text-xs font-semibold">Picked Bin</TableHead>
                <TableHead className="text-xs font-semibold">Supplier / Batch</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qty Deducted</TableHead>
                <TableHead className="text-xs font-semibold text-right">Bin Stock After</TableHead>
                <TableHead className="text-xs font-semibold">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-300" />
                  </TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400 text-sm font-medium">
                    {search ? "No outbound movements match your search." : "No physical outbound movements found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.slice(0, 100).map(m => (
                  <TableRow key={m.id ?? m.movement_id} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs font-bold text-slate-800">{m.product_name}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-700 bg-slate-100/50 rounded">{m.bin_id || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs text-slate-600 font-medium">{m.vendor_name || "—"}</div>
                      <div className="text-[10px] font-mono text-slate-400">Batch: {m.batch_number || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-bold text-rose-600">
                      -{m.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-semibold text-slate-600">
                      {m.new_stock}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-400 font-medium">
                      {m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Dialogs ── */}
      {dispatchSOObj && (
        <ConfirmSODispatchDialog
          so={dispatchSOObj}
          onClose={() => setDispatchSOObj(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
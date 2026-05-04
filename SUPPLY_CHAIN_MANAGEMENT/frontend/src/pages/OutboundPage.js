import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import {
  Plus, Search, Eye, Loader2, PackageOpen, Truck,
  RefreshCw, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { useToast } from "../components/ui/use-toast";
import {
  listPurchaseOrders, getPurchaseOrder,
  outboundPick, listProducts, listStockMovements,
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

const matchesSearch = (value, query) =>
  String(value ?? "").toLowerCase().includes(query);

const STATUS_MAP = {
  pending:    { label: "Pending",    variant: "outline" },
  approved:   { label: "Approved",   variant: "default" },
  dispatched: { label: "Dispatched", variant: "secondary" },
  cancelled:  { label: "Cancelled",  variant: "destructive" },
};

/* ── Dispatch Dialog ── */
function DispatchDialog({ onClose, onSuccess }) {
  const { toast } = useToast();
  const [products, setProducts]     = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);   // success result
  const [search, setSearch]         = useState("");

  useEffect(() => {
    listProducts()
      .then(r => setProducts(toArray(r)))
      .catch(() => toast({ title: "Error", description: "Failed to load products.", variant: "destructive" }))
      .finally(() => setLoadingProd(false));
  }, [toast]);

  const filteredProducts = products.filter(p =>
    !search ||
    p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.product_id?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProductObj = products.find(p => p.product_id === selectedProduct);

  const handleDispatch = async () => {
    if (!selectedProduct) {
      toast({ title: "Required", description: "Please select a product.", variant: "destructive" });
      return;
    }
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast({ title: "Required", description: "Please enter a valid quantity (> 0).", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await outboundPick(selectedProduct, { quantity: qty });
      setResult(res);
      onSuccess();
      toast({ title: "Dispatch Successful", description: `${qty} units of ${selectedProductObj?.product_name} dispatched.` });
    } catch (err) {
      toast({ title: "Dispatch Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#1E3A8A]" />
            Dispatch / Pick Stock
          </DialogTitle>
          <DialogDescription>
            Select a product and enter the quantity to dispatch from warehouse bins.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          /* ── Success View ── */
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              Dispatch Completed
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm">
              <p className="text-xs text-emerald-600 font-medium mb-2">Picked from bins:</p>
              {(result.picked_bins || []).map((b, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-emerald-100 last:border-0">
                  <span className="font-mono text-xs text-gray-700">{b.bin_id}</span>
                  <span className="text-xs text-gray-600">{b.vendor_name} · Batch: {b.batch_number}</span>
                  <span className="text-sm font-bold text-emerald-700">{b.picked_quantity} {b.base_unit}</span>
                </div>
              ))}
              <p className="text-xs text-emerald-700 font-semibold mt-2 pt-1 border-t border-emerald-200">
                Total dispatched: {result.requested_quantity} units
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="bg-[#1E3A8A] hover:bg-[#162d6e]">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Form View ── */
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Product *</Label>
              <Input
                placeholder="Search product name or barcode…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm mb-1"
              />
              {loadingProd ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-[#1E3A8A]" />
                </div>
              ) : (
                <select
                  value={selectedProduct}
                  onChange={e => setSelectedProduct(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  size={Math.min(filteredProducts.length + 1, 6)}
                >
                  <option value="">— Select a product —</option>
                  {filteredProducts.map(p => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name}  [{p.product_id}]  {p.barcode ? `· ${p.barcode}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {selectedProductObj && (
                <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
                  <span className="font-semibold">{selectedProductObj.product_name}</span>
                  {selectedProductObj.base_unit && <span className="ml-2 text-blue-500">Unit: {selectedProductObj.base_unit}</span>}
                  {selectedProductObj.barcode && <span className="ml-2 font-mono">{selectedProductObj.barcode}</span>}
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">
                Quantity * {selectedProductObj?.base_unit ? `(in ${selectedProductObj.base_unit})` : ""}
              </Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 50"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Stock will be picked from the nearest available bins. This action is irreversible and logs an OUTBOUND movement.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button
                onClick={handleDispatch}
                disabled={submitting || !selectedProduct || !quantity}
                className="bg-[#1E3A8A] hover:bg-[#162d6e]"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Dispatching…</>
                  : <><Truck className="w-4 h-4 mr-2" />Dispatch Stock</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── View Order Dialog ── */
function ViewOrderDialog({ order, onClose }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Order Details: {order?.po_id ?? order?.pr_id}
          </DialogTitle>
          <DialogDescription>
            Vendor: {order?.vendor?.vendor_name ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">PR Reference</p>
            <p className="font-mono">{order?.pr?.pr_id ?? order?.pr_id ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge
              variant={STATUS_MAP[order?.status]?.variant || "outline"}
              className="text-xs mt-0.5"
            >
              {STATUS_MAP[order?.status]?.label || order?.status || "—"}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Product</p>
            <p>
              {order?.pr?.product?.product_name ??
                order?.product?.product_name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Quantity</p>
            <p>{order?.order_quantity ?? order?.requested_quantity ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unit Price</p>
            <p>
              ₹{(
                order?.pr?.product?.unit_price ??
                order?.product?.unit_price ?? 0
              ).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Amount</p>
            <p className="font-bold">₹{(order?.total_amount ?? 0).toLocaleString()}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Created Date</p>
            <p>
              {order?.created_at
                ? new Date(order.created_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Recent Outbound Movements ── */
function OutboundMovementsCard({ movements, isLoading }) {
  const outbound = movements.filter(m => m.movement_type === "OUTBOUND");

  if (!isLoading && outbound.length === 0) return null;

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <PackageOpen className="w-4 h-4 text-[#1E3A8A]" />
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Recent Outbound Movements
        </p>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#1E3A8A] text-white text-[10px] font-bold">
          {outbound.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Product</TableHead>
              <TableHead className="text-xs font-semibold">Vendor</TableHead>
              <TableHead className="text-xs font-semibold">Bin</TableHead>
              <TableHead className="text-xs font-semibold">Batch</TableHead>
              <TableHead className="text-xs font-semibold text-right">Qty Picked</TableHead>
              <TableHead className="text-xs font-semibold text-right">Stock After</TableHead>
              <TableHead className="text-xs font-semibold">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (
              outbound.slice(0, 20).map(m => (
                <TableRow key={m.id ?? m.movement_id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-medium text-gray-800">{m.product_name}</TableCell>
                  <TableCell className="text-xs text-gray-500">{m.vendor_name || "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-gray-600">{m.bin_id || "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-gray-500">{m.batch_number || "—"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold text-red-600">
                    -{m.quantity}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-gray-700">
                    {m.new_stock}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">
                    {m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ══════ MAIN PAGE ══════ */
export default function OutboundPage() {
  const { toast } = useToast();
  const [search, setSearch]               = useState("");
  const [orders, setOrders]               = useState([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [movements, setMovements]         = useState([]);
  const [movLoading, setMovLoading]       = useState(true);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dispatchOpen, setDispatchOpen]   = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listPurchaseOrders();
      const all  = toArray(data);
      setOrders(
        all.filter(o => o.status === "approved" || o.status === "dispatched")
      );
    } catch (error) {
      console.error("Failed to load orders:", error);
      toast({ title: "Error", description: "Failed to load outbound orders.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadMovements = useCallback(async () => {
    setMovLoading(true);
    try {
      const data = await listStockMovements();
      setMovements(toArray(data));
    } catch {
      /* silent — movements are supplementary */
    } finally {
      setMovLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadMovements();
  }, [loadOrders, loadMovements]);

  const handleViewOrder = async orderId => {
    try {
      const order = await getPurchaseOrder(orderId);
      setSelectedOrder(order);
      setViewDialogOpen(true);
    } catch (error) {
      console.error("Failed to load order details:", error);
      toast({ title: "Error", description: "Failed to load order details.", variant: "destructive" });
    }
  };

  const handleDispatchSuccess = () => {
    loadMovements();   // refresh movements immediately to show new dispatch
  };

  const q = search.toLowerCase();
  const filtered = orders.filter(o =>
    matchesSearch(o.po_id, q) ||
    matchesSearch(o.pr_id, q) ||
    matchesSearch(o.vendor?.vendor_name, q)
  );

  return (
    <div className="space-y-5">
      {/* ── Header toolbar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search orders…"
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => { loadOrders(); loadMovements(); }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e]"
            onClick={() => setDispatchOpen(true)}
          >
            <Truck className="w-4 h-4 mr-1.5" /> Dispatch Stock
          </Button>
          <Button size="sm" variant="outline" className="h-9" asChild>
            <a href="/purchase-requests">
              <Plus className="w-4 h-4 mr-1.5" /> New Order
            </a>
          </Button>
        </div>
      </div>

      {/* ── Approved Purchase Orders table ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Approved Purchase Orders
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">PO ID</TableHead>
                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-right">Quantity</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total Amount</TableHead>
                <TableHead className="text-xs font-semibold">Created Date</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No outbound orders found. Orders appear here after finance approval.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(order => (
                  <TableRow key={order.po_id ?? order.pr_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-medium">
                      {order.po_id ?? order.pr_id}
                    </TableCell>
                    <TableCell className="text-sm">{order.vendor?.vendor_name || "—"}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">
                      {order.order_quantity ?? order.requested_quantity ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-medium">
                      ₹{(order.total_amount ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.created_at
                        ? new Date(order.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_MAP[order.status]?.variant || "outline"}
                        className="text-xs"
                      >
                        {STATUS_MAP[order.status]?.label || order.status || "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => handleViewOrder(order.po_id ?? order.pr_id)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Recent Outbound Movements ── */}
      <OutboundMovementsCard movements={movements} isLoading={movLoading} />

      {/* ── Dialogs ── */}
      {dispatchOpen && (
        <DispatchDialog
          onClose={() => setDispatchOpen(false)}
          onSuccess={handleDispatchSuccess}
        />
      )}

      {viewDialogOpen && selectedOrder && (
        <ViewOrderDialog
          order={selectedOrder}
          onClose={() => setViewDialogOpen(false)}
        />
      )}
    </div>
  );
}
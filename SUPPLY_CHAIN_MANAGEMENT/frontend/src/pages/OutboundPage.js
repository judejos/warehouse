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
  Plus, Search, Eye, Loader2, PackageOpen, Truck, ShoppingBag,
  RefreshCw, CheckCircle2, AlertTriangle, X, User
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { useToast } from "../components/ui/use-toast";
import {
  outboundPick, listProducts, listStockMovements, 
  getProductStockByVendor, listProductVendors, listVendors, listSuppliers
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

/* ── Dispatch Dialog ── */
function DispatchDialog({ onClose, onSuccess }) {
  const { toast } = useToast();
  const [products, setProducts]     = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [vendorStocks, setVendorStocks] = useState([]);
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

  // Fetch all suppliers when component mounts or product changes
  useEffect(() => {
    const fetchSupplierData = async () => {
      try {
        // 1. Get ALL registered suppliers in the system
        const suppliersData = await listSuppliers();
        const allSuppliersList = suppliersData?.results || suppliersData || [];
        
        // 2. Also get vendors to ensure we have the mapping for the backend
        const vendorsData = await listVendors();
        const allVendorsList = vendorsData?.results || vendorsData || [];

        let stockData = null;
        if (selectedProduct) {
          // 3. Get current stock for the selected product across all vendors
          stockData = await getProductStockByVendor(selectedProduct);
        }
        const byVendorList = stockData?.by_vendor || [];
        
        // Map them together
        const combined = allSuppliersList.map(s => {
          // Find the corresponding vendor by name or email to get the ID the backend needs
          const matchingVendor = allVendorsList.find(v => 
            v.vendor_name?.trim().toLowerCase() === s.supplier_name?.trim().toLowerCase() ||
            (v.email && s.email && v.email.trim().toLowerCase() === s.email.trim().toLowerCase())
          );
          const stock = byVendorList.find(sd => sd.vendor_id === matchingVendor?.vendor_id);
          
          return {
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name,
            vendor_id: matchingVendor?.vendor_id || "", // Internal ID for backend
            total_quantity: stock ? stock.total_qty : 0
          };
        });

        setVendorStocks(combined);
        if (!selectedProduct) setSelectedSupplierId("");
      } catch (err) {
        console.error("Failed to fetch suppliers:", err);
      }
    };
    fetchSupplierData();
  }, [selectedProduct]);

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
    const selectedSupplierObj = vendorStocks.find(vs => vs.supplier_id === selectedSupplierId);
    setSubmitting(true);
    try {
      const res = await outboundPick(selectedProduct, { 
        quantity: qty,
        vendor_id: selectedSupplierObj?.vendor_id || null
      });
      setResult(res);
      onSuccess();
      
      const isLow = res.reorder_triggered || res.low_stock_warning;
      
      let title = "Dispatch Successful";
      if (res.reorder_triggered) title = "Stock Alert";
      else if (res.low_stock_warning) title = "Low Stock Alert";

      let description = res.reorder_triggered 
        ? res.message 
        : `${qty} units of ${selectedProductObj?.product_name} dispatched.`;
      
      if (res.low_stock_warning && !res.reorder_triggered) {
        description += ` Remaining stock (${res.remaining_stock}) is below reorder point.`;
      }

      toast({ 
        title,
        description,
        variant: isLow ? "default" : "default" 
      });
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
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Product Selection *</Label>
              
              {!selectedProduct ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, ID or barcode…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9 h-10 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <X className="w-4 h-4 text-muted-foreground hover:text-gray-900" />
                      </button>
                    )}
                  </div>

                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <div className="max-h-[180px] overflow-y-auto bg-slate-50/50">
                      {loadingProd ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                          <p className="text-[10px] text-slate-500 font-medium">Loading products...</p>
                        </div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="py-8 text-center">
                          <PackageOpen className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                          <p className="text-xs text-slate-500 italic">No matching products found.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {filteredProducts.map(p => (
                            <button
                              key={p.product_id}
                              onClick={() => setSelectedProduct(p.product_id)}
                              className="w-full px-4 py-3 text-left hover:bg-white hover:shadow-inner transition-all flex items-center justify-between group"
                            >
                              <div>
                                <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                  {p.product_name}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  ID: {p.product_id} {p.barcode ? `· BC: ${p.barcode}` : ""}
                                </p>
                              </div>
                              <Plus className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Selected State ── */
                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedProductObj?.product_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-bold uppercase rounded">
                          {selectedProductObj?.product_id}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Unit: <strong>{selectedProductObj?.base_unit || "Units"}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSelectedProduct(""); setSearch(""); }}
                    className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-rose-500 hover:shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── Vendor Selection ── */}
              {selectedProduct && (
                <div className="space-y-2 mt-4 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">SELECT SUPPLIER (REQUIRED) *</label>
                  <div className="grid grid-cols-1 gap-2">
                    {vendorStocks.length > 0 ? (
                      vendorStocks.map((vs) => (
                        <div
                          key={vs.supplier_id}
                          onClick={() => setSelectedSupplierId(vs.supplier_id === selectedSupplierId ? "" : vs.supplier_id)}
                          className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all ${
                            selectedSupplierId === vs.supplier_id
                              ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-sm"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              selectedSupplierId === vs.supplier_id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                            }`}>
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-xs text-slate-800">{vs.supplier_name}</p>
                              <p className="text-[10px] text-slate-500">
                                ID: <span className="font-mono font-bold text-indigo-600">{vs.supplier_id}</span> · Stock: <span className="text-indigo-600 font-bold">{vs.total_quantity}</span> {selectedProductObj?.base_unit}
                              </p>
                            </div>
                          </div>
                          {selectedSupplierId === vs.supplier_id && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                        <p className="text-[10px] text-slate-400 font-medium italic">No specific supplier stock records found.</p>
                      </div>
                    )}
                  </div>
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
                disabled={submitting || !selectedProduct || !quantity || !selectedSupplierId}
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

/* ── Recent Outbound Movements ── */
function OutboundMovementsCard({ movements, isLoading, search }) {
  const q = search.toLowerCase();
  const filtered = movements.filter(m => 
    m.movement_type === "OUTBOUND" && (
      !q ||
      m.product_name?.toLowerCase().includes(q) ||
      m.bin_id?.toLowerCase().includes(q) ||
      m.batch_number?.toLowerCase().includes(q) ||
      m.vendor_name?.toLowerCase().includes(q)
    )
  );

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <PackageOpen className="w-4 h-4 text-[#1E3A8A]" />
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Recent Outbound Movements
        </p>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#1E3A8A] text-white text-[10px] font-bold">
          {filtered.length}
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
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  {search ? "No movements match your search." : "No outbound movements found. Dispatch stock to see activity here."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.slice(0, 50).map(m => (
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
  const [search, setSearch]           = useState("");
  const [movements, setMovements]     = useState([]);
  const [movLoading, setMovLoading]   = useState(true);
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const loadMovements = useCallback(async () => {
    setMovLoading(true);
    try {
      const data = await listStockMovements();
      setMovements(toArray(data));
    } catch {
      /* silent */
    } finally {
      setMovLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  return (
    <div className="space-y-5">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search dispatch history…"
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={loadMovements}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e]"
            onClick={() => setDispatchOpen(true)}
          >
            <Truck className="w-4 h-4 mr-1.5" /> Dispatch Stock
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <PackageOpen className="w-5 h-5 text-[#1E3A8A]" />
            Outbound Dispatch History
          </h2>
        </div>
        <OutboundMovementsCard movements={movements} isLoading={movLoading} search={search} />
      </div>

      {dispatchOpen && (
        <DispatchDialog
          onClose={() => setDispatchOpen(false)}
          onSuccess={loadMovements}
        />
      )}
    </div>
  );
}
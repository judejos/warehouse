/**
 * SalesPaymentsPage.js
 * Standalone page for Sales Manager — Payments tab
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  CreditCard, RefreshCw, Loader2, DollarSign,
} from "lucide-react";
import { apiRequest } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Payment Pending":     "bg-purple-100 text-purple-800 border-purple-300",
  "Finance Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":         "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":          "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);

function RecordPaymentDialog({ so, onClose, onRecorded }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [paymentType, setPaymentType] = useState("full");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const totalAmount = parseFloat(so.total_amount) || 0;
  const received = parseFloat(amountReceived) || 0;
  const balanceDue = (totalAmount - received).toFixed(2);

  const handleSubmit = async () => {
    if (!amountReceived || received <= 0) {
      toast({ title: "Validation Error", description: "Enter the amount received.", variant: "destructive" });
      return;
    }
    if (received > totalAmount) {
      toast({ title: "Validation Error", description: "Amount cannot exceed total order value.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/sales/so/${so.so_id}/payment/`, "POST", {
        payment_type: paymentType,
        amount_received: received,
        payment_notes: paymentNotes,
      });
      toast({ title: "Payment Recorded ✅", description: "Finance Director has been notified." });
      onRecorded();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E3A8A]">
            <DollarSign className="w-5 h-5" /> Record Payment — {so.so_id}
          </DialogTitle>
          <DialogDescription>Enter payment details. Finance Director will confirm receipt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl border bg-slate-50 p-3 text-sm flex justify-between items-center">
            <span className="text-gray-500">Total Order Amount</span>
            <span className="font-bold text-lg text-[#1E3A8A]">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Payment Type *</Label>
            <div className="flex gap-3">
              {[["full", "Full Payment", "💰"], ["advance", "Advance Payment", "💳"]].map(([val, label, icon]) => (
                <button
                  key={val}
                  onClick={() => { setPaymentType(val); if (val === "full") setAmountReceived(String(totalAmount)); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${paymentType === val ? "border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Amount Received (₹) *</Label>
            <Input
              type="number" min="0" step="0.01"
              placeholder={`Max: ₹${totalAmount.toLocaleString("en-IN")}`}
              value={amountReceived}
              onChange={e => setAmountReceived(e.target.value)}
            />
          </div>
          {amountReceived && received > 0 && (
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold flex justify-between ${parseFloat(balanceDue) > 0 ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              <span>Balance Due</span>
              <span>₹{parseFloat(balanceDue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input placeholder="e.g. Cheque no., UPI reference…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><CreditCard className="w-4 h-4 mr-2" />Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesPaymentsPage() {
  const { toast } = useToast();
  const [sos, setSOss] = useState([]);
  const [loadingSO, setLoadingSO] = useState(true);
  const [recordPaymentFor, setRecordPaymentFor] = useState(null);

  const loadSOs = useCallback(async () => {
    setLoadingSO(true);
    try { setSOss(toArr(await apiRequest("/sales/so/", "GET"))); }
    catch { /* silent */ } finally { setLoadingSO(false); }
  }, []);

  useEffect(() => { loadSOs(); }, [loadSOs]);

  const pendingPaymentSOs = sos.filter(s => s.status === "Supervisor Approved");
  const paymentSOs        = sos.filter(s => ["Payment Pending", "Finance Confirmed", "Pick & Pack", "Dispatched"].includes(s.status));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[#1E3A8A]" /> Payments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and track customer payments</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadSOs}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Awaiting Payment Recording */}
      {pendingPaymentSOs.length > 0 && (
        <Card className="shadow-sm overflow-hidden border-purple-200">
          <div className="px-4 py-3 border-b bg-purple-50 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-purple-700" />
            <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Awaiting Payment Recording</p>
            <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingPaymentSOs.length}</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-purple-50/50">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Total (₹)</TableHead>
                  <TableHead className="text-xs font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPaymentSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-purple-50/40">
                    <TableCell className="text-xs font-mono font-bold text-purple-700">{s.so_id}</TableCell>
                    <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                    <TableCell className="text-xs">{s.product_name}</TableCell>
                    <TableCell className="text-xs text-right font-bold">₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => setRecordPaymentFor(s)}>
                        <CreditCard className="w-3 h-3 mr-1" /> Record Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Payment History */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#1E3A8A]" />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Payment History</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">SO ID</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Product</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total (₹)</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSO ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : paymentSOs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-gray-400">No payment records yet.</TableCell></TableRow>
              ) : paymentSOs.map(s => (
                <TableRow key={s.so_id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                  <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                  <TableCell className="text-xs">{s.product_name}</TableCell>
                  <TableCell className="text-xs text-right font-bold">₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Pill status={s.status} /></TableCell>
                  <TableCell>
                    {s.payment_info ? (
                      <div className="text-[10px] space-y-0.5">
                        <div className="font-semibold capitalize">{s.payment_info.payment_type}</div>
                        <div className="text-gray-500">Rcvd: ₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</div>
                        {parseFloat(s.payment_info.balance_due) > 0 && (
                          <div className="text-amber-600 font-semibold">Bal: ₹{parseFloat(s.payment_info.balance_due).toLocaleString("en-IN")}</div>
                        )}
                        {s.payment_info.finance_confirmed && (
                          <span className="text-emerald-700 font-bold">✅ Finance OK</span>
                        )}
                      </div>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {recordPaymentFor && (
        <RecordPaymentDialog
          so={recordPaymentFor}
          onClose={() => setRecordPaymentFor(null)}
          onRecorded={() => { loadSOs(); setRecordPaymentFor(null); }}
        />
      )}
    </div>
  );
}

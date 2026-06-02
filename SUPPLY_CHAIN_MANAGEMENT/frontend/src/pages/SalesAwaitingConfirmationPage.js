/**
 * SalesAwaitingConfirmationPage.js
 * Standalone page for Finance Director — Awaiting Confirmation tab
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  CreditCard, RefreshCw, Loader2, CheckCircle2, Check,
} from "lucide-react";
import { listSOPayments, financeConfirmSO } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

export default function SalesAwaitingConfirmationPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmPayment, setConfirmPayment] = useState(null);
  const [financeNotes, setFinanceNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSOPayments(true);
      setPayments(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load payments", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const handleConfirm = async () => {
    if (!confirmPayment) return;
    setSaving(true);
    try {
      await financeConfirmSO(confirmPayment.so, { finance_notes: financeNotes });
      toast({
        title: "Payment Receipt Confirmed ✅",
        description: `Finalized Sales Order ${confirmPayment.so} payment successfully.`,
      });
      setConfirmPayment(null);
      setFinanceNotes("");
      loadPayments();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pendingPayments = payments.filter(p => !p.finance_confirmed);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[#1E3A8A]" /> Awaiting Confirmation
            <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">{pendingPayments.length}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Verify and confirm customer receipts to release orders for warehouse dispatch</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadPayments}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#1E3A8A]" /> Action Required
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Payment ID</TableHead>
                <TableHead className="text-xs font-semibold">SO ID</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Product Requested</TableHead>
                <TableHead className="text-xs font-semibold text-right">Order Total</TableHead>
                <TableHead className="text-xs font-semibold text-right">Amount Received</TableHead>
                <TableHead className="text-xs font-semibold text-right">Balance Due</TableHead>
                <TableHead className="text-xs font-semibold">Payment Type</TableHead>
                <TableHead className="text-xs font-semibold">Sales Notes</TableHead>
                <TableHead className="text-xs font-semibold text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : pendingPayments.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-gray-400">No customer payment records awaiting finance confirmation.</TableCell></TableRow>
              ) : pendingPayments.map(p => (
                <TableRow key={p.payment_id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{p.payment_id}</TableCell>
                  <TableCell className="text-xs font-mono text-gray-500 font-bold">{p.so}</TableCell>
                  <TableCell className="text-xs font-semibold">{p.customer_name || "—"}</TableCell>
                  <TableCell className="text-xs">{p.product_name || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-medium tabular-nums">
                    ₹{parseFloat(p.so_total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-bold text-emerald-800 bg-emerald-50/50">
                    ₹{parseFloat(p.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-semibold ${parseFloat(p.balance_due) > 0 ? "text-amber-700 bg-amber-50/30" : "text-gray-600"}`}>
                    ₹{parseFloat(p.balance_due || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="capitalize">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${p.payment_type === "full" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-purple-100 text-purple-800 border-purple-300"}`}>
                      {p.payment_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[150px] truncate" title={p.payment_notes}>{p.payment_notes || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      onClick={() => setConfirmPayment(p)}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Confirm Receipt
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {confirmPayment && (
        <Dialog open onOpenChange={() => setConfirmPayment(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" /> Confirm Payment Receipt
              </DialogTitle>
              <DialogDescription>
                Please verify that the bank transfer or cheque for the recorded amount has cleared before confirming receipt. This will authorize warehouse dispatch.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="rounded-xl border bg-slate-50 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Payment ID</span><span className="font-mono font-bold">{confirmPayment.payment_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Sales Order</span><span className="font-mono font-bold text-[#1E3A8A]">{confirmPayment.so}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{confirmPayment.customer_name}</span></div>
                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Payment Type</span><span className="font-semibold capitalize text-purple-700">{confirmPayment.payment_type}</span></div>
                <div className="flex justify-between"><span className="text-gray-500 font-medium">Order Total Value</span><span className="font-semibold">₹{parseFloat(confirmPayment.so_total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between font-bold text-emerald-800 text-lg bg-emerald-50 px-2 py-1 rounded"><span className="font-bold">Amount to Confirm</span><span>₹{parseFloat(confirmPayment.amount_received).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                {parseFloat(confirmPayment.balance_due) > 0 && (
                  <div className="flex justify-between text-xs text-amber-800 font-semibold px-2"><span className="font-medium">Remaining Balance Due</span><span>₹{parseFloat(confirmPayment.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Verification Notes / Remarks</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="e.g. Verified transaction ref TXN948382. Credit received in bank account."
                  value={financeNotes}
                  onChange={e => setFinanceNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setConfirmPayment(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirm &amp; Release Order</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

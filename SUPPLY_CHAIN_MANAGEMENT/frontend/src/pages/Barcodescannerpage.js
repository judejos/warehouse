/**
 * BarcodeScannerPage.js
 *
 * USB Mobile-as-Scanner page.
 * When you plug your phone in as a USB barcode scanner (HID mode / Droid scanner apps),
 * the phone sends keystrokes ending with Enter — exactly like a keyboard.
 *
 * This page maintains a single always-focused hidden input that captures every
 * keystroke from the scanner and routes the completed barcode (on Enter) through
 * three sequential modes:
 *
 *  MODE 1 — ADD ITEMS TO GRN (Supervisor)
 *    Scan a product barcode → preview product card → supervisor fills carton/batch
 *    details and submits to an active GRN via supervisorAddGRNItem()
 *
 *  MODE 2 — PUTAWAY SCAN
 *    Scan a GRN-XXXX or GRN-ITM-XXXX barcode from the printed log sheet →
 *    calls decodeGRNBarcode() → shows putaway plan rows inline
 *    Worker clicks Confirm per row → confirmPutaway() called immediately
 *    Worker can Reassign a bin without leaving the page
 *
 *  MODE 3 — DOWNLOAD LOG SHEETS
 *    Lists all QC-passed GRNs, shows barcode images per item,
 *    downloads a print-ready HTML log sheet for physical counts.
 *    Accessible to: supervisor, admin, inventory_manager, inventory_logger
 *
 * How USB HID scanning works here:
 *  - A hidden <input> is kept focused at all times via window keydown listener
 *  - Characters accumulate in a buffer; Enter or a 80ms gap flushes it as a barcode
 *  - The scanner never needs the user to click anything — just aim and scan
 *
 * Route: /barcode-scanner
 * Add to role-config.js for supervisor / inventory_manager / quality / inventory_logger roles.
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from "react";
import { Card, CardContent } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  ScanLine, CheckCircle, AlertTriangle, Loader2, RefreshCw,
  Package, MapPin, ChevronRight, Trash2, Download, RotateCcw,
  XCircle, Box, Printer,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { useAuth } from "../components/lib/auth-context";
import {
  listGRNs,
  getGRNItems,
  supervisorScanBarcode,
  supervisorAddGRNItem,
  decodeGRNBarcode,
  confirmPutaway,
  reassignPutawayBin,
} from "../services/apiService";

/* ── helpers ──────────────────────────────────────────────────────────── */
const toArr = (res, key) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "data", "items", "plans", "grns"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

const fmtD  = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDt = (d) => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—";

/* ── USB HID scanner: global keydown → buffer → onBarcode ────────────── */
const SCAN_DEBOUNCE_MS = 80;
const MIN_BARCODE_LEN  = 3;

function useScannerInput(onBarcode, paused) {
  const buffer   = useRef("");
  const timer    = useRef(null);
  const inputRef = useRef(null);

  const flush = useCallback(() => {
    const val = buffer.current.trim();
    buffer.current = "";
    if (val.length >= MIN_BARCODE_LEN && !paused) onBarcode(val);
  }, [onBarcode, paused]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (
        document.activeElement !== inputRef.current &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "SELECT"
      ) {
        inputRef.current?.focus();
      }
      if (e.key === "Enter") {
        clearTimeout(timer.current);
        flush();
        return;
      }
      if (e.key.length === 1) {
        buffer.current += e.key;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SCAN_DEBOUNCE_MS);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer.current);
    };
  }, [flush]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return inputRef;
}

/* ── Print sheet — always renders a scannable CODE128 barcode ──────────── */
function openPrintSheet(grn, items) {
  const accepted = items.filter(
    (i) => i.qc_status === "Completed" && (i.accepted_quantity ?? 0) > 0
  );

  /* Build row HTML.
   * Priority:
   *  1. barcode_image (base64 PNG from backend QC approval) — rendered as <img>
   *  2. Fallback: a <svg> placeholder filled in by JsBarcode after load using
   *     the grn_item_id value (CODE128 format, always scannable).
   */
  const rows = accepted.map((item, idx) => {
    const barcodeCell = item.barcode_image
      ? `<img src="data:image/png;base64,${item.barcode_image}"
             style="height:48px;width:auto;display:block;margin:0 auto;"
             alt="${item.grn_item_id}" />`
      : `<svg class="bc" id="bc-${idx}" data-value="${item.grn_item_id}"
             style="display:block;margin:0 auto;max-height:48px;"></svg>`;

    return `
      <tr>
        <td class="c">${idx + 1}</td>
        <td class="c">${barcodeCell}</td>
        <td class="m">${item.grn_item_id}</td>
        <td>${item.snapshot_product_name || item.product_name || "—"}</td>
        <td class="m">${item.snapshot_barcode || "—"}</td>
        <td class="c g">${item.accepted_quantity ?? 0}</td>
        <td class="w"></td>
        <td class="w"></td>
      </tr>`;
  }).join("");

  const printedOn = fmtD(new Date());

  /* JsBarcode is now a proper <script src> in <head>.
   * window.onload fires only after it loads, so barcodes always render. */

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>GRN Log — ${grn.grn_id}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    * { box-sizing: border-box; }
    body { font-family: Calibri, Arial, sans-serif; margin: 1.2cm 1.8cm; color: #0f172a; font-size: 12px; }
    .header-bar { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2.5px solid #1E3A8A; padding-bottom: 10px; margin-bottom: 10px; }
    h1 { font-size: 18px; font-weight: 700; color: #1E3A8A; margin: 0 0 3px; }
    .meta { font-size: 11px; color: #475569; line-height: 1.6; }
    .meta strong { color: #0f172a; }
    .notice { background: #fef9c3; border: 1px solid #fde047; padding: 6px 10px; font-size: 10px; color: #854d0e; border-radius: 3px; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 4px; }
    th { background: #1E3A8A; color: #fff; font-size: 11px; padding: 7px 8px; border: 1px solid #1E3A8A; text-align: left; white-space: nowrap; }
    td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 11px; vertical-align: middle; }
    .c { text-align: center; }
    .m { font-family: Courier New, monospace; font-size: 10px; }
    .g { color: #16a34a; font-weight: 700; font-size: 13px; }
    .w { min-height: 28px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .sign-row { margin-top: 24px; display: flex; gap: 48px; font-size: 11px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .sign-field { flex: 1; }
    .sign-field .line { border-bottom: 1px solid #94a3b8; height: 28px; margin-bottom: 4px; }
    .footer { margin-top: 10px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
    .print-btn { background: #1E3A8A; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #162d6e; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>GRN Inventory Log Sheet</h1>
      <div class="meta">
        <strong>GRN:</strong> ${grn.grn_id} &nbsp;|&nbsp;
        <strong>Number:</strong> ${grn.grn_number || "—"} &nbsp;|&nbsp;
        <strong>PO:</strong> ${grn.po_id || "—"} &nbsp;|&nbsp;
        <strong>Receipt:</strong> ${fmtD(grn.receipt_date)} &nbsp;|&nbsp;
        <strong>Items:</strong> ${accepted.length} &nbsp;|&nbsp;
        <strong>Printed:</strong> ${printedOn}
      </div>
    </div>
    <button class="print-btn no-print" onclick="window.print()">Print</button>
  </div>
  <div class="notice">
    Scan each item barcode during putaway and record the physical count in the
    <em>Phys. Count</em> column. QC-accepted quantities are pre-filled for reference.
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">S.No</th>
        <th style="width:90px">Item Barcode</th>
        <th style="width:120px">Item ID</th>
        <th>Product Name</th>
        <th style="width:110px">Product Barcode</th>
        <th style="width:68px;text-align:center">QC Accepted</th>
        <th style="width:76px">Phys. Count</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign-row">
    <div class="sign-field"><div class="line"></div>Counted By</div>
    <div class="sign-field"><div class="line"></div>Verified By</div>
    <div class="sign-field"><div class="line"></div>Date</div>
  </div>
  <div class="footer">
    <span>WMS Pro — Confidential</span>
    <span>${printedOn} &nbsp;|&nbsp; GRN: ${grn.grn_id}</span>
  </div>
  <script>
    window.onload = function() {
      document.querySelectorAll('svg.bc').forEach(function(el) {
        var val = el.getAttribute('data-value') || '';
        if (!val) return;
        try {
          JsBarcode(el, val, {
            format: 'CODE128', width: 1.5, height: 40,
            displayValue: true, fontSize: 9, margin: 2
          });
        } catch(e) {
          el.outerHTML = '<span style="font-size:9px;font-family:monospace;">' + val + '</span>';
        }
      });
      setTimeout(function() { window.print(); }, 400);
    };
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grn-log-${grn.grn_id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ── Shared atoms ─────────────────────────────────────────────────────── */
function ScanFlash({ value, type }) {
  if (!value) return null;
  const ok = type !== "error";
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border font-mono text-sm
      ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}`}>
      {ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
      <span className="font-semibold truncate">{value}</span>
    </div>
  );
}

function PlanBadge({ status }) {
  const map = {
    Pending:    "bg-amber-100 text-amber-700 border-amber-200",
    Completed:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    Reassigned: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${map[status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {status}
    </span>
  );
}

function ScannerStatusBar({ active, paused, grn, loading }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
      !active   ? "border-gray-200 bg-gray-50"
    : paused    ? "border-amber-300 bg-amber-50"
    :             "border-[#1E3A8A] bg-[#1E3A8A]/5"}`}>
      <div className={`w-3 h-3 rounded-full shrink-0 ${
        !active ? "bg-gray-300" : paused ? "bg-amber-400 animate-pulse" : "bg-emerald-500 animate-pulse"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">
          {!active  ? "Scanner paused — select a GRN first"
          : paused  ? "Scanner paused — fill in the form fields below"
          :           "Scanner active — point phone at a barcode"}
        </p>
        {grn && !paused && (
          <p className="text-xs text-gray-500 mt-0.5">
            GRN: <span className="font-mono font-semibold text-[#1E3A8A]">{grn.grn_id}</span>
          </p>
        )}
      </div>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-[#1E3A8A] shrink-0" />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODE 1 — Supervisor: Add items to a GRN by scanning product barcodes
════════════════════════════════════════════════════════════ */
function AddItemsMode({ user }) {
  const { toast } = useToast();
  const [grns, setGrns]               = useState([]);
  const [activeGRN, setActiveGRN]     = useState(null);
  const [scanResult, setScanResult]   = useState(null);
  const [scanning, setScanning]       = useState(false);
  const [lastScan, setLastScan]       = useState({ value: "", type: "" });
  const [addForm, setAddForm]         = useState({ batch_number: "", received_cartons: "1", manufactured_date: "", expiry_date: "" });
  const [adding, setAdding]           = useState(false);
  const [addedItems, setAddedItems]   = useState([]);
  const [paused, setPaused]           = useState(false);
  const setF = (k, v) => setAddForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    listGRNs()
      .then(r => setGrns(toArr(r).filter(g => ["RECEIVED", "QC_PENDING"].includes(g.status))))
      .catch(console.error);
  }, []);

  const handleBarcode = useCallback(async (barcode) => {
    if (!activeGRN) { setLastScan({ value: "No active GRN — select one first", type: "error" }); return; }
    setScanning(true); setScanResult(null);
    setLastScan({ value: barcode, type: "ok" });
    try {
      const res = await supervisorScanBarcode(activeGRN.grn_id, { barcode });
      setScanResult(res);
      setAddForm({ batch_number: "", received_cartons: "1", manufactured_date: "", expiry_date: "" });
      setPaused(true);
    } catch {
      setLastScan({ value: `${barcode} — not found`, type: "error" });
      setScanResult(null);
    } finally { setScanning(false); }
  }, [activeGRN]);

  const inputRef = useScannerInput(handleBarcode, paused);

  const handleAdd = async () => {
    if (!scanResult || !addForm.batch_number || !addForm.received_cartons) return;
    setAdding(true);
    try {
      await supervisorAddGRNItem(activeGRN.grn_id, {
        barcode:           scanResult.barcode,
        batch_number:      addForm.batch_number,
        received_cartons:  parseInt(addForm.received_cartons),
        manufactured_date: addForm.manufactured_date || undefined,
        expiry_date:       addForm.expiry_date || undefined,
      });
      const qty = Math.round(parseInt(addForm.received_cartons) * (scanResult.conversion_factor || 1));
      setAddedItems(prev => [{ barcode: scanResult.barcode, name: scanResult.product_name, batch: addForm.batch_number, cartons: parseInt(addForm.received_cartons), qty, unit: scanResult.base_unit, ts: new Date() }, ...prev]);
      toast({ title: "Item Added", description: `${scanResult.product_name} — ${addForm.received_cartons} carton(s)` });
      setScanResult(null); setLastScan({ value: "", type: "" }); setPaused(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setAdding(false); }
  };

  const cancelScan = () => { setScanResult(null); setLastScan({ value: "", type: "" }); setPaused(false); setTimeout(() => inputRef.current?.focus(), 50); };

  return (
    <div className="space-y-4">
      <input ref={inputRef} className="sr-only" readOnly tabIndex={-1} />

      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold text-gray-600">Select Active GRN</Label>
        <select
          value={activeGRN?.grn_id || ""}
          onChange={e => { const g = grns.find(x => x.grn_id === e.target.value); setActiveGRN(g || null); setScanResult(null); setAddedItems([]); setPaused(false); }}
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">— Select GRN —</option>
          {grns.map(g => <option key={g.grn_id} value={g.grn_id}>{g.grn_id} · {g.grn_number || "—"} · PO: {g.po_id || "—"}</option>)}
        </select>
      </div>

      <ScannerStatusBar active={!!activeGRN} paused={paused} grn={activeGRN} loading={scanning} />
      {lastScan.value && <ScanFlash value={lastScan.value} type={lastScan.type} />}

      {scanResult && (
        <Card className="border-2 border-[#1E3A8A] shadow-md">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-bold text-gray-900">{scanResult.product_name}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-mono">{scanResult.barcode}</span>
                  {scanResult.size && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{scanResult.size}</span>}
                  {scanResult.package_type && <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium">{scanResult.package_type}</span>}
                  {scanResult.abc && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">ABC-{scanResult.abc}</span>}
                </div>
                {scanResult.expected_qty_from_asn > 0 && <p className="text-xs text-emerald-700 mt-2 font-medium">ASN expected: {scanResult.expected_qty_from_asn} {scanResult.base_unit}s</p>}
                {scanResult.already_added && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Already added to this GRN</p>}
              </div>
              <Package className="w-10 h-10 text-gray-200 shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { k: "batch_number",      lbl: "Batch Number *",   type: "text", ph: "From carton label" },
                { k: "received_cartons",  lbl: "Received Cartons *", type: "number", ph: "" },
                { k: "manufactured_date", lbl: "Mfg Date (opt)",   type: "date", ph: "" },
                { k: "expiry_date",       lbl: "Expiry Date (opt)", type: "date", ph: "" },
              ].map(({ k, lbl, type, ph }) => (
                <div key={k} className="grid gap-1.5">
                  <Label className="text-xs font-medium text-gray-600">{lbl}</Label>
                  <Input
                    type={type} value={addForm[k]} placeholder={ph}
                    onChange={e => setF(k, e.target.value)}
                    onFocus={() => setPaused(true)}
                    onBlur={() => setPaused(!!scanResult)}
                    className="h-9 text-sm border-gray-300"
                    autoFocus={k === "batch_number"}
                    min={type === "number" ? "1" : undefined}
                  />
                </div>
              ))}
            </div>

            {addForm.received_cartons && scanResult.conversion_factor && (
              <p className="text-xs text-gray-500 mb-3">
                = <strong className="text-gray-800">{Math.round(parseInt(addForm.received_cartons || 0) * scanResult.conversion_factor)}</strong> {scanResult.base_unit}s
                <span className="ml-2 text-gray-400">({scanResult.conversion_factor} per carton)</span>
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAdd}
                disabled={adding || !addForm.batch_number || !addForm.received_cartons}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 font-semibold text-sm"
              >
                {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : <><CheckCircle className="w-4 h-4 mr-2" />Add to GRN</>}
              </Button>
              <Button variant="outline" onClick={cancelScan} className="h-9 text-sm border-gray-300">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {addedItems.length > 0 && (
        <Card className="shadow-sm border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Added This Session
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[#1E3A8A] text-white text-[10px] font-bold">{addedItems.length}</span>
            </p>
            <button onClick={() => setAddedItems([])} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
          <Table>
            <TableHeader><TableRow className="bg-gray-50">
              {["Product", "Batch", "Cartons", "Units", "Time"].map(h => <TableHead key={h} className="text-xs font-semibold text-gray-500">{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {addedItems.map((item, i) => (
                <TableRow key={i} className="hover:bg-gray-50">
                  <TableCell><p className="text-xs font-medium text-gray-800">{item.name}</p><p className="text-[10px] font-mono text-gray-400">{item.barcode}</p></TableCell>
                  <TableCell className="text-xs font-mono text-gray-600">{item.batch}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold">{item.cartons}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-[#1E3A8A] font-bold">{item.qty} {item.unit}</TableCell>
                  <TableCell className="text-[10px] text-gray-400 tabular-nums">{fmtDt(item.ts)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODE 2 — Putaway: Scan GRN or item barcode → show plan → confirm inline
════════════════════════════════════════════════════════════ */
function PutawayMode() {
  const { toast } = useToast();
  const [decoding, setDecoding]         = useState(false);
  const [lastScan, setLastScan]         = useState({ value: "", type: "" });
  const [result, setResult]             = useState(null);
  const [confirming, setConfirming]     = useState({});
  const [qtyOverrides, setQtyOverrides] = useState({});

  const handleBarcode = useCallback(async (barcode) => {
    setDecoding(true); setLastScan({ value: barcode, type: "ok" }); setResult(null);
    try {
      const res = await decodeGRNBarcode({ barcode_value: barcode });
      setResult(res);
      const plans = toArr(res.putaway_plans || res.putaway_plan || []);
      const init = {};
      for (const p of plans) init[p.plan_id] = String(p.planned_quantity);
      setQtyOverrides(init);
    } catch (err) {
      setLastScan({ value: `${barcode} — ${err.message}`, type: "error" });
    } finally { setDecoding(false); }
  }, []);

  const inputRef = useScannerInput(handleBarcode, false);

  const handleConfirm = async (plan) => {
    const qty = parseInt(qtyOverrides[plan.plan_id] || plan.planned_quantity);
    if (!qty || qty <= 0) return;
    setConfirming(p => ({ ...p, [plan.plan_id]: true }));
    try {
      await confirmPutaway(plan.plan_id, { quantity_placed: qty });
      toast({ title: "Putaway Confirmed", description: `${qty} units → ${plan.bin_id || plan.bin}` });
      setResult(prev => {
        if (!prev) return prev;
        const key = prev.putaway_plans ? "putaway_plans" : "putaway_plan";
        return { ...prev, [key]: (prev[key] || []).map(p => p.plan_id === plan.plan_id ? { ...p, status: "Completed", quantity_placed: qty } : p) };
      });
    } catch (err) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setConfirming(p => ({ ...p, [plan.plan_id]: false })); }
  };

  const handleReassign = async (planId) => {
    try {
      const res = await reassignPutawayBin(planId, {});
      toast({
        title: "Bin Reassigned",
        description: `Old: ${res.old_bin_id} → New: ${res.new_bin_id} (${res.zone_id} / ${res.rack_id} / ${res.shelf_id})`,
      });

      /* ── Update the result state in-place so the user keeps context ── */
      setResult(prev => {
        if (!prev) return prev;

        // Determine which key holds the plans array
        const planKey = prev.putaway_plans ? "putaway_plans" : "putaway_plan";
        const existing = Array.isArray(prev[planKey]) ? prev[planKey] : [];

        // Mark the old plan as Reassigned locally
        const updated = existing.map(p =>
          p.plan_id === planId ? { ...p, status: "Reassigned" } : p
        );

        // Append the new pending plan that the backend just created
        const newPlan = {
          plan_id:          res.new_plan_id,
          bin_id:           res.new_bin_id,
          bin:              res.new_bin_id,
          zone_id:          res.zone_id,
          rack_id:          res.rack_id,
          shelf_id:         res.shelf_id,
          status:           "Pending",
          planned_quantity: existing.find(p => p.plan_id === planId)?.planned_quantity ?? 0,
          quantity_placed:  0,
          distance_from_dispatch: null,
        };
        updated.push(newPlan);

        return { ...prev, [planKey]: updated };
      });
    } catch (err) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const plans = result ? toArr(result.putaway_plans || result.putaway_plan || []) : [];

  return (
    <div className="space-y-4">
      <input ref={inputRef} className="sr-only" readOnly tabIndex={-1} />

      <ScannerStatusBar active paused={false} loading={decoding} />
      <p className="text-xs text-gray-500">Scan a <strong>GRN barcode (GRN-XXXX)</strong> for the full plan, or an <strong>item barcode (GRN-ITM-XXXX)</strong> for a single item.</p>

      {lastScan.value && <ScanFlash value={lastScan.value} type={lastScan.type} />}

      {result && (
        <div className="space-y-3">
          <Card className="border-2 border-[#1E3A8A]/20 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${result.scan_type === "item" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {result.scan_type === "item" ? "Item Scan" : "GRN Scan"}
                    </span>
                    {result.grn_status && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${result.grn_status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                        {result.grn_status}
                      </span>
                    )}
                  </div>
                  {result.scan_type === "item" ? (
                    <>
                      <p className="text-base font-bold text-gray-900">{result.product_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Item: <span className="font-mono">{result.grn_item_id}</span> · GRN: <span className="font-mono">{result.grn_id}</span>
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">QC Accepted: <strong>{result.accepted_quantity}</strong> {result.base_unit}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-bold text-gray-900">{result.grn_id} — {result.grn_number || "—"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">PO: {result.po_id} · {result.vendor_name}</p>
                      <div className="flex gap-4 mt-2 text-xs">
                        <span>Total: <strong>{result.total_plans}</strong></span>
                        <span className="text-amber-600">Pending: <strong>{result.pending_plans}</strong></span>
                        <span className="text-emerald-600">Done: <strong>{result.completed_plans}</strong></span>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => { setResult(null); setLastScan({ value: "", type: "" }); }} className="p-1.5 rounded hover:bg-gray-100">
                  <XCircle className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </CardContent>
          </Card>

          {plans.length > 0 && (
            <Card className="shadow-sm border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Putaway Plan{plans.length > 1 ? `s (${plans.length})` : ""}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {plans.map(plan => {
                  const isDone = plan.status === "Completed";
                  const isCfm  = confirming[plan.plan_id];
                  return (
                    <div key={plan.plan_id} className={`px-4 py-4 ${isDone ? "bg-emerald-50/40" : ""}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-mono font-medium text-gray-500">{plan.plan_id}</p>
                            <PlanBadge status={plan.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-1">
                            <MapPin className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                            <span className="font-mono">{plan.bin_id || plan.bin}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 items-center">
                            <span>Zone: <strong className="text-gray-700">{plan.zone_id}</strong></span>
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                            <span>Rack: <strong className="text-gray-700">{plan.rack_id}</strong></span>
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                            <span>Shelf: <strong className="text-gray-700">{plan.shelf_id}</strong></span>
                            {plan.distance_from_dispatch != null && <span className="text-gray-400">· {plan.distance_from_dispatch}m</span>}
                          </div>
                          {plan.product_name && (
                            <p className="text-xs text-gray-600 mt-2">
                              {plan.product_name}
                              {plan.batch_number && <span className="ml-2 font-mono text-gray-400">Batch: {plan.batch_number}</span>}
                              {plan.expiry_date  && <span className="ml-2 text-amber-600">Exp: {fmtD(plan.expiry_date)}</span>}
                            </p>
                          )}
                          <div className="flex gap-4 mt-2 text-xs">
                            <span className="text-gray-500">Planned: <strong className="text-gray-800">{plan.planned_quantity}</strong></span>
                            {plan.quantity_placed > 0 && <span className="text-emerald-600">Placed: <strong>{plan.quantity_placed}</strong></span>}
                          </div>
                        </div>

                        {!isDone ? (
                          <div className="flex flex-col gap-2 shrink-0">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number" min="1" max={plan.planned_quantity}
                                value={qtyOverrides[plan.plan_id] ?? String(plan.planned_quantity)}
                                onChange={e => setQtyOverrides(q => ({ ...q, [plan.plan_id]: e.target.value }))}
                                className="w-20 h-8 text-sm text-center border-gray-300"
                              />
                              <Button
                                onClick={() => handleConfirm(plan)} disabled={isCfm}
                                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold px-3"
                              >
                                {isCfm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle className="w-3.5 h-3.5 mr-1" />Confirm</>}
                              </Button>
                            </div>
                            <button
                              onClick={() => handleReassign(plan.plan_id)}
                              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Reassign bin
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-600">
                            <CheckCircle className="w-5 h-5" />
                            <div className="text-xs"><p className="font-semibold">Done</p>{plan.completed_by && <p className="text-gray-400">{plan.completed_by}</p>}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {plans.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Box className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No putaway plans found for this scan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODE 3 — Log Sheets
   Accessible to: supervisor, admin, inventory_manager, inventory_logger
   Opens a print-ready HTML sheet instead of downloading a .doc
════════════════════════════════════════════════════════════ */
function LogSheetsMode() {
  const { toast } = useToast();
  const [grns, setGrns]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [itemsCache, setItemsCache]     = useState({});
  const [printing, setPrinting]         = useState({});
  const [expanded, setExpanded]         = useState(null);
  const [loadingItems, setLoadingItems] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listGRNs();
      setGrns(toArr(res).filter(g => ["PUTAWAY_PENDING", "COMPLETED"].includes(g.status)));
    } catch (err) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleGRN = async (grnId) => {
    if (expanded === grnId) { setExpanded(null); return; }
    setExpanded(grnId);
    if (!itemsCache[grnId]) {
      setLoadingItems(p => ({ ...p, [grnId]: true }));
      try { const res = await getGRNItems(grnId); setItemsCache(p => ({ ...p, [grnId]: toArr(res) })); }
      catch { /* silent */ } finally { setLoadingItems(p => ({ ...p, [grnId]: false })); }
    }
  };

  const handlePrint = async (e, grn) => {
    e.stopPropagation();
    setPrinting(p => ({ ...p, [grn.grn_id]: true }));
    try {
      let items = itemsCache[grn.grn_id];
      if (!items) {
        const res = await getGRNItems(grn.grn_id);
        items = toArr(res);
        setItemsCache(p => ({ ...p, [grn.grn_id]: items }));
      }
      openPrintSheet(grn, items);
    } catch (err) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setPrinting(p => ({ ...p, [grn.grn_id]: false })); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" /></div>;

  if (grns.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <Printer className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No QC-passed GRNs available.</p>
      <p className="text-xs mt-1">GRNs appear here after QC approval generates item barcodes.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">
          Click <strong>Print Sheet</strong> to open a print-ready barcode log for the inventory logger.
        </p>
        <button onClick={load} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {grns.map(grn => {
        const isExp = expanded === grn.grn_id;
        const items = itemsCache[grn.grn_id] || [];
        const ldg   = loadingItems[grn.grn_id];
        const prt   = printing[grn.grn_id];
        const qcCnt = items.filter(i => i.qc_status === "Completed").length;

        return (
          <Card key={grn.grn_id} className={`shadow-sm overflow-hidden transition-all ${isExp ? "border-[#1E3A8A]/30" : "border-gray-200"}`}>
            <div
              className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors ${isExp ? "bg-[#1E3A8A]/5" : "bg-white hover:bg-gray-50"}`}
              onClick={() => toggleGRN(grn.grn_id)}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#1E3A8A] font-mono">{grn.grn_id}</p>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${grn.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-purple-200 bg-purple-50 text-purple-700"}`}>
                    {grn.status === "COMPLETED" ? "Completed" : "Putaway Pending"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{grn.grn_number || "—"} · PO: {grn.po_id || "—"} · {fmtD(grn.receipt_date)}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-4" onClick={e => e.stopPropagation()}>
                {isExp && qcCnt > 0 && <span className="text-[10px] text-gray-400">{qcCnt} accepted items</span>}
                <Button
                  size="sm"
                  onClick={e => handlePrint(e, grn)}
                  disabled={prt}
                  className="h-8 bg-[#1E3A8A] hover:bg-[#162d6e] text-xs font-semibold"
                >
                  {prt
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Loading...</>
                    : <><Printer className="w-3.5 h-3.5 mr-1.5" />Print Sheet</>}
                </Button>
              </div>
            </div>

            {isExp && (
              <div className="border-t border-gray-100">
                {ldg
                  ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                  : items.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-6">No items.</p>
                  : (
                    <Table>
                      <TableHeader><TableRow className="bg-gray-50">
                        {["Barcode", "Item ID", "Product", "Accepted", "Rejected", "QC"].map(h => (
                          <TableHead key={h} className="text-xs font-semibold text-gray-500">{h}</TableHead>
                        ))}
                      </TableRow></TableHeader>
                      <TableBody>
                        {items.map(item => (
                          <TableRow key={item.grn_item_id} className="hover:bg-gray-50">
                            <TableCell>
                              {item.barcode_image
                                ? <img src={`data:image/png;base64,${item.barcode_image}`} alt={item.grn_item_id} className="h-8 w-auto" />
                                : <span className="text-[10px] text-gray-300 italic">After QC</span>}
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-gray-500">{item.grn_item_id}</TableCell>
                            <TableCell>
                              <p className="text-xs font-medium text-gray-800">{item.snapshot_product_name || item.product_name}</p>
                              <p className="text-[10px] font-mono text-gray-400">{item.snapshot_barcode || "—"}</p>
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-emerald-600">{item.accepted_quantity ?? 0}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-red-500">{item.rejected_quantity ?? 0}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${item.qc_status === "Completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                {item.qc_status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
   CHANGE: added "inventory_logger" to the Log Sheets mode roles
════════════════════════════════════════════════════════════ */
const MODES = [
  {
    id: "add",
    label: "Add Items to GRN",
    icon: ScanLine,
    roles: ["supervisor", "admin"],
  },
  {
    id: "putaway",
    label: "Putaway Scan",
    icon: MapPin,
    roles: ["supervisor", "admin", "inventory_manager", "quality_checker", "quality_assistant"],
  },
  {
    id: "logs",
    label: "Log Sheets",
    icon: Printer,
    // inventory_logger added — they only need to print sheets, not scan or putaway
    roles: ["supervisor", "admin", "inventory_manager", "inventory_logger"],
  },
];

export default function BarcodeScannerPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const allowed = MODES.filter(m => m.roles.includes(user?.role));
    if (allowed.length > 0) setMode(allowed[0].id);
  }, [user?.role]);

  const allowedModes = MODES.filter(m => m.roles.includes(user?.role));

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-[#1E3A8A]" /> USB Barcode Scanner
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Connect your phone via USB in HID keyboard mode. Scans are captured automatically — no clicking required.
        </p>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
        <p className="text-xs font-semibold text-blue-800 mb-2">Setup Instructions</p>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Install a barcode scanner app on your phone (<strong>USB Barcode Scanner</strong>, <strong>Droid Scanner</strong>, or similar).</li>
          <li>Connect phone to PC via USB → in the app, select <strong>HID Keyboard</strong> output mode.</li>
          <li>Keep this browser tab in focus — scans arrive as keystrokes and are captured globally.</li>
          <li>Point the phone camera at any barcode → result appears instantly, no button press needed.</li>
        </ol>
      </div>

      {allowedModes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {allowedModes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                mode === m.id
                  ? "border-[#1E3A8A] bg-[#1E3A8A] text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-[#1E3A8A]/50"
              }`}
            >
              <m.icon className="w-4 h-4" />{m.label}
            </button>
          ))}
        </div>
      )}

      {mode === "add"     && <AddItemsMode user={user} />}
      {mode === "putaway" && <PutawayMode />}
      {mode === "logs"    && <LogSheetsMode />}
    </div>
  );
}
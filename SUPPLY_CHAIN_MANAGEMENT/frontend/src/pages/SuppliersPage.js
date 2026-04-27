import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplier,
} from "../services/apiService";
import { useToast } from "../components/ui/use-toast";

// Normalise any API response to a plain array
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

// Safe search: coerces any value type to string before matching
const matchesSearch = (value, query) =>
  String(value ?? "").toLowerCase().includes(query);

const EMPTY_FORM = {
  supplier_name: "",
  contact_personname: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "",
};

export default function SuppliersPage() {
  const { toast } = useToast();
  const navigate = useNavigate(); // ✅ ADDED
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | edit | delete
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const data = await listSuppliers();
      setSuppliers(toArray(data, "suppliers"));
    } catch (error) {
      console.error("Failed to load suppliers:", error);
      toast({
        title: "Error",
        description: "Failed to load suppliers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEdit = async (supplierId) => {
    setIsLoading(true);
    try {
      const supplier = await getSupplier(supplierId);
      setSelectedSupplier(supplier);
      setFormData({
        supplier_name:      supplier.supplier_name ?? "",
        contact_personname: supplier.contact_personname ?? "",
        email:   supplier.email   ?? "",
        phone:   supplier.phone   ?? "",
        address: supplier.address ?? "",
        city:    supplier.city    ?? "",
        state:   supplier.state   ?? "",
        country: supplier.country ?? "",
      });
      setDialogMode("edit");
      setDialogOpen(true);
    } catch (error) {
      console.error("Failed to load supplier:", error);
      toast({
        title: "Error",
        description: "Failed to load supplier details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDelete = (supplier) => {
    setSelectedSupplier(supplier);
    setDialogMode("delete");
    setDialogOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setIsSubmitting(true);
    try {
      if (dialogMode === "edit") {
        await updateSupplier(selectedSupplier.supplier_id, formData);
        toast({ title: "Success", description: "Supplier updated successfully." });
      } else if (dialogMode === "delete") {
        await deleteSupplier(selectedSupplier.supplier_id);
        toast({ title: "Success", description: "Supplier deleted successfully." });
      }
      setDialogOpen(false);
      loadSuppliers();
    } catch (error) {
      console.error("Operation failed:", error);
      toast({
        title: "Error",
        description: error.message || "Operation failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const q = search.toLowerCase();
  const filteredSuppliers = suppliers.filter(
    (s) =>
      matchesSearch(s.supplier_name, q) ||
      matchesSearch(s.supplier_id, q)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* ✅ CHANGED: navigate to create page instead of opening dialog */}
        <Button size="sm" className="h-9" onClick={() => navigate("/suppliers/create")}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Supplier
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">ID</TableHead>
                <TableHead className="text-xs font-semibold">Company Name</TableHead>
                <TableHead className="text-xs font-semibold">Contact</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold">Location</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No suppliers found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuppliers.map((s) => (
                  <TableRow key={s.supplier_id}>
                    <TableCell className="text-xs font-mono font-medium">{s.supplier_id}</TableCell>
                    <TableCell className="text-sm font-medium">{s.supplier_name}</TableCell>
                    <TableCell className="text-xs">{s.contact_personname || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.email || "-"}</TableCell>
                    <TableCell className="text-xs">{s.phone || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {s.city ? `${s.city}, ${s.state}` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.is_active !== false ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {s.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(s.supplier_id)}
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(s)}
                          className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={dialogOpen && dialogMode === "edit"}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Supplier</DialogTitle>
              <DialogDescription>Update the supplier information.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="supplier_name">Company Name *</Label>
                <Input id="supplier_name" name="supplier_name" value={formData.supplier_name}
                  onChange={handleInputChange} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact_personname">Contact Person</Label>
                <Input id="contact_personname" name="contact_personname" value={formData.contact_personname}
                  onChange={handleInputChange} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email}
                    onChange={handleInputChange} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" value={formData.phone}
                    onChange={handleInputChange} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" name="address" value={formData.address}
                  onChange={handleInputChange} rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" name="city" value={formData.city}
                    onChange={handleInputChange} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State *</Label>
                  <Input id="state" name="state" value={formData.state}
                    onChange={handleInputChange} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input id="country" name="country" value={formData.country}
                    onChange={handleInputChange} required />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={dialogOpen && dialogMode === "delete"}
        onOpenChange={setDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{selectedSupplier?.supplier_name}</span>?
              This action can be undone by restoring the supplier.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Building2, ArrowLeft, CheckCircle2, User, Mail, Phone, MapPin } from "lucide-react";
import { createSupplier } from "../services/apiService";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const LOCATION_DATA = {
  "United States": {
    "California": ["Los Angeles", "San Francisco", "San Jose", "San Diego", "Sacramento"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"],
    "Texas": ["Houston", "Austin", "Dallas", "San Antonio", "Fort Worth"],
    "Washington": ["Seattle", "Tacoma", "Bellevue", "Spokane", "Olympia"],
    "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee"],
  },
  "India": {
    "Karnataka": ["Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Trichy", "Salem"],
    "Delhi": ["New Delhi", "Noida", "Gurugram", "Dwarka", "Saket"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
  },
  "United Kingdom": {
    "England": ["London", "Manchester", "Birmingham", "Leeds", "Liverpool"],
    "Scotland": ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"],
    "Wales": ["Cardiff", "Swansea", "Newport", "St Davids", "Bangor"],
  },
  "Canada": {
    "Ontario": ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
    "Quebec": ["Montreal", "Quebec City", "Laval", "Gatineau", "Sherbrooke"],
    "British Columbia": ["Vancouver", "Victoria", "Surrey", "Burnaby", "Richmond"],
  },
  "Australia": {
    "New South Wales": ["Sydney", "Newcastle", "Wollongong", "Maitland"],
    "Victoria": ["Melbourne", "Geelong", "Ballarat", "Bendigo"],
    "Queensland": ["Brisbane", "Gold Coast", "Sunshine Coast", "Townsville"],
  },
  "Germany": {
    "Bavaria": ["Munich", "Nuremberg", "Augsburg", "Regensburg"],
    "Berlin": ["Berlin"],
    "Hamburg": ["Hamburg"],
  }
};


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

const Field = ({ label, icon: Icon, required, error, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
    {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
  </div>
);

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-background rounded-lg border shadow-sm p-5 space-y-4">
    <div className="flex items-center gap-2 pb-3 border-b">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    {children}
  </div>
);

export default function AddSupplierPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const [isCustomCountry, setIsCustomCountry] = useState(false);
  const [isCustomState, setIsCustomState] = useState(false);
  const [isCustomCity, setIsCustomCity] = useState(false);

  const handleCountryChange = (val) => {
    if (errors.country) setErrors((prev) => ({ ...prev, country: null }));
    if (errors.state) setErrors((prev) => ({ ...prev, state: null }));
    if (errors.city) setErrors((prev) => ({ ...prev, city: null }));

    if (val === "other") {
      setIsCustomCountry(true);
      setFormData((prev) => ({ ...prev, country: "", state: "", city: "" }));
      setIsCustomState(true);
      setIsCustomCity(true);
    } else {
      setIsCustomCountry(false);
      setFormData((prev) => ({ ...prev, country: val, state: "", city: "" }));
      setIsCustomState(false);
      setIsCustomCity(false);
    }
  };

  const handleStateChange = (val) => {
    if (errors.state) setErrors((prev) => ({ ...prev, state: null }));
    if (errors.city) setErrors((prev) => ({ ...prev, city: null }));

    if (val === "other") {
      setIsCustomState(true);
      setFormData((prev) => ({ ...prev, state: "", city: "" }));
      setIsCustomCity(true);
    } else {
      setIsCustomState(false);
      setFormData((prev) => ({ ...prev, state: val, city: "" }));
      setIsCustomCity(false);
    }
  };

  const handleCityChange = (val) => {
    if (errors.city) setErrors((prev) => ({ ...prev, city: null }));

    if (val === "other") {
      setIsCustomCity(true);
      setFormData((prev) => ({ ...prev, city: "" }));
    } else {
      setIsCustomCity(false);
      setFormData((prev) => ({ ...prev, city: val }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.supplier_name.trim()) errs.supplier_name = "Required";
    if (!formData.city.trim()) errs.city = "Required";
    if (!formData.state.trim()) errs.state = "Required";
    if (!formData.country.trim()) errs.country = "Required";
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email))
      errs.email = "Invalid email address";
    return errs;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSubmitting(true);
    try {
      await createSupplier(formData);
      toast({ title: "Success", description: `${formData.supplier_name} has been created.` });
      navigate("/suppliers");
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to create supplier.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedFields = Object.values(formData).filter((v) => String(v).trim() !== "").length;
  const totalFields = Object.keys(formData).length;
  const progress = Math.round((completedFields / totalFields) * 100);

  const isFormValid =
    formData.supplier_name.trim() &&
    formData.city.trim() &&
    formData.state.trim() &&
    formData.country.trim();

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">

      {/* ── Sticky Top Bar ── */}
      <header className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/suppliers")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Suppliers
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h1 className="text-sm font-semibold">Create New Supplier</h1>
            <p className="text-xs text-muted-foreground">Fill in all required fields to register a supplier</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{completedFields}/{totalFields} fields</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFormData(EMPTY_FORM); setErrors({}); }}
          >
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/suppliers")}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1.5" />Create Supplier</>
            )}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <form onSubmit={handleSubmit} className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* ── Row 1: Company Info (2/3) + Status (1/3) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Company & Contact */}
            <div className="lg:col-span-2">
              <Section icon={Building2} title="Supplier Information">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="Company Name" icon={Building2} required error={errors.supplier_name}>
                      <Input
                        name="supplier_name"
                        value={formData.supplier_name}
                        onChange={handleChange}
                        placeholder="Company or trade name"
                        className="h-9"
                      />
                    </Field>
                  </div>
                  <Field label="Contact Person" icon={User} error={errors.contact_personname}>
                    <Input
                      name="contact_personname"
                      value={formData.contact_personname}
                      onChange={handleChange}
                      placeholder="Full name"
                      className="h-9"
                    />
                  </Field>
                  <Field label="Phone Number" icon={Phone} error={errors.phone}>
                    <Input
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Primary contact number"
                      className="h-9"
                    />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Email Address" icon={Mail} error={errors.email}>
                      <Input
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="Business email address"
                        className="h-9"
                      />
                    </Field>
                  </div>
                </div>
              </Section>
            </div>

            {/* Status card */}
            <Section icon={CheckCircle2} title="Registration">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Default Status</span>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
              <div className="rounded-md bg-muted/60 border px-3 py-2.5 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Supplier records are <span className="font-medium text-foreground">active by default</span> and
                  can be deactivated at any time from the supplier management panel.
                </p>
              </div>
              <div className="pt-1 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Required fields</p>
                {["Company Name", "City", "State", "Country"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* ── Row 2: Address & Location ── */}
          <Section icon={MapPin} title="Address & Location">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-3">
                <Field label="Street Address" icon={MapPin}>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Street address, building, floor..."
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                </Field>
              </div>
              {/* ── Country ── */}
              <Field label="Country" required error={errors.country}>
                {!isCustomCountry ? (
                  <Select value={formData.country} onValueChange={handleCountryChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(LOCATION_DATA).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      placeholder="Enter country"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomCountry(false); setFormData(p => ({ ...p, country: "", state: "", city: "" })); setIsCustomState(false); setIsCustomCity(false); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>

              {/* ── State ── */}
              <Field label="State" required error={errors.state}>
                {!isCustomState ? (
                  <Select
                    value={formData.state}
                    onValueChange={handleStateChange}
                    disabled={!formData.country || isCustomCountry}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={formData.country ? "Select state" : "Select country first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(LOCATION_DATA[formData.country] ? Object.keys(LOCATION_DATA[formData.country]) : []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      placeholder="Enter state / province"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomState(false); setFormData(p => ({ ...p, state: "", city: "" })); setIsCustomCity(false); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>

              {/* ── City ── */}
              <Field label="City" required error={errors.city}>
                {!isCustomCity ? (
                  <Select
                    value={formData.city}
                    onValueChange={handleCityChange}
                    disabled={!formData.state || isCustomState}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={formData.state ? "Select city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(LOCATION_DATA[formData.country]?.[formData.state] ?? []).map((city) => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Enter city"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomCity(false); setFormData(p => ({ ...p, city: "" })); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>
            </div>
          </Section>

          {/* ── Row 3: Summary Preview ── */}
          <Section icon={CheckCircle2} title="Summary Preview">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Company",   value: formData.supplier_name },
                { label: "Contact",   value: formData.contact_personname },
                { label: "Email",     value: formData.email },
                { label: "Phone",     value: formData.phone },
                { label: "City",      value: formData.city },
                { label: "Location",  value: [formData.state, formData.country].filter(Boolean).join(", ") },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md bg-muted/50 border px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">{label}</p>
                  <p className={`text-xs font-medium truncate ${!value ? "text-muted-foreground italic" : "text-foreground"}`}>
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Bottom Actions ── */}
          <div className="flex justify-end gap-3 pb-4">
            <Button type="button" variant="outline" onClick={() => navigate("/suppliers")}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting} className="min-w-[140px]">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-1.5" />Create Supplier</>
              )}
            </Button>
          </div>

        </div>
      </form>
    </div>
  );
}
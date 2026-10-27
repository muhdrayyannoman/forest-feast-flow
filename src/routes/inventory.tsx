import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, PackageCheck, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  INVENTORY_CATEGORIES, UNITS, stockStatus, formatQty, timeAgo,
  type InventoryItem, type StockStatus,
} from "@/lib/inventory-logic";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Kitchen Inventory — Verdant Table" },
      { name: "description", content: "Staff dashboard to track ingredients, supplies and stock levels." },
      { property: "og:title", content: "Kitchen Inventory — Verdant Table" },
      { property: "og:description", content: "Track ingredients, supplies and stock levels." },
    ],
  }),
  component: InventoryPage,
});

const input = "h-11 w-full rounded-2xl border bg-card px-4 outline-none focus:border-accent";

const stockBadge: Record<StockStatus, { label: string; className: string }> = {
  ok: { label: "In stock", className: "bg-success/15 text-success" },
  low: { label: "Low stock", className: "bg-warning/20 text-foreground" },
  out: { label: "Out of stock", className: "bg-destructive/15 text-destructive" },
};

type MovementReason = "Incoming stock" | "Stock used";
type Modal =
  | { mode: "add" }
  | { mode: "edit"; item: InventoryItem }
  | { mode: "movement"; item: InventoryItem; reason: MovementReason }
  | null;

function InventoryPage() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        const { data: ok } = await supabase.rpc("has_role", { _user_id: id, _role: "admin" });
        setIsAdmin(!!ok);
      } else setIsAdmin(false);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") check();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (userId === undefined) return <p className="container-page py-12 text-muted-foreground">Loading…</p>;
  if (!userId) return <StaffLogin />;
  if (!isAdmin)
    return (
      <div className="container-page py-12">
        <h1 className="text-3xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-muted-foreground">Only kitchen admins can manage inventory.</p>
        <Button className="mt-4" variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    );
  return <InventoryDashboard />;
}

function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
  }
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="font-display text-3xl font-semibold">Kitchen inventory sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use your kitchen staff account to manage stock.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className={input} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="hero" className="w-full">Sign in</Button>
      </form>
      <Link to="/admin" className="mt-4 inline-block text-sm font-semibold text-accent">Go to kitchen dashboard</Link>
    </div>
  );
}

type StockLog = {
  id: string;
  change: number;
  reason: string;
  note: string | null;
  order_number: string | null;
  created_at: string;
  inventory_items: { name: string; unit: string } | null;
};

function InventoryDashboard() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [modal, setModal] = useState<Modal>(null);

  const items = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async (): Promise<InventoryItem[]> => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("category").order("name");
      if (error) throw error;
      return (data ?? []).map((d) => ({
        ...d,
        quantity: Number(d.quantity),
        min_stock_level: Number(d.min_stock_level),
      }));
    },
    refetchInterval: 15000,
  });

  const logs = useQuery({
    queryKey: ["inventory-logs"],
    queryFn: async (): Promise<StockLog[]> => {
      const { data, error } = await supabase
        .from("inventory_logs")
        .select("*, inventory_items(name, unit)")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as StockLog[];
    },
  });

  const list = items.data ?? [];
  const alerts = list.filter((i) => stockStatus(i.quantity, i.min_stock_level) !== "ok");
  const outCount = list.filter((i) => stockStatus(i.quantity, i.min_stock_level) === "out").length;
  const lowCount = alerts.length - outCount;

  const filtered = list.filter(
    (i) =>
      (cat === "All" || i.category === cat) &&
      (search.trim() === "" || i.name.toLowerCase().includes(search.trim().toLowerCase())),
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["inventory-items"] });
    qc.invalidateQueries({ queryKey: ["inventory-logs"] });
  }

  async function moveStock(item: InventoryItem, reason: MovementReason, amount: number, note: string): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    const change = reason === "Incoming stock" ? amount : -amount;
    const { data, error } = await supabase.rpc("record_stock_movement", {
      p_item_id: item.id, p_change: change, p_reason: reason, p_note: note.trim() || undefined,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${reason}: ${formatQty(amount, item.unit)} · ${item.name}`);
    setModal(null);
    refresh();
  }

  async function saveItem(values: { name: string; category: string; unit: string; quantity: number; min: number }, editing: InventoryItem | null): Promise<void> {
    const name = values.name.trim();
    if (name.length < 2) { toast.error("Item name is too short."); return; }
    if (values.quantity < 0 || values.min < 0) { toast.error("Quantity and minimum cannot be negative."); return; }
    if (editing) {
      const { error } = await supabase
        .from("inventory_items")
        .update({ name, category: values.category, unit: values.unit, min_stock_level: values.min })
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Item updated");
    } else {
      const { error } = await supabase
        .from("inventory_items")
        .insert({ name, category: values.category, unit: values.unit, quantity: values.quantity, min_stock_level: values.min });
      if (error) {
        toast.error(error.code === "23505" ? "An item with this name already exists." : error.message);
        return;
      }
      if (values.quantity > 0) {
        const { data: created } = await supabase.from("inventory_items").select("id").eq("name", name).maybeSingle();
        if (created) {
          await supabase.from("inventory_logs").insert({
            item_id: created.id, change: values.quantity, reason: "Incoming stock", note: "Opening stock",
          });
        }
      }
      toast.success("Item added to inventory");
    }
    setModal(null);
    refresh();
  }

  const stats = [
    { label: "Items tracked", value: list.length },
    { label: "Low stock", value: lowCount },
    { label: "Out of stock", value: outCount },
    { label: "Categories", value: new Set(list.map((i) => i.category)).size },
  ];

  return (
    <div className="container-page py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Kitchen Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ingredients and supplies — quantities update automatically as orders come in.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Kitchen dashboard</Button></Link>
          <Button variant="hero" onClick={() => setModal({ mode: "add" })}><Plus className="h-4 w-4" /> Add item</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl border bg-card p-5 shadow-soft">
            <p className="text-3xl font-bold text-primary">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {(alerts.length > 0) && (
        <div className="mt-6 rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-destructive"><TriangleAlert className="h-5 w-5" /> Stock alerts ({alerts.length})</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {alerts.map((i) => (
              <button key={i.id} onClick={() => setModal({ mode: "movement", item: i, reason: "Incoming stock" })}
                className="rounded-full border bg-card px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5">
                {i.name} · {i.quantity <= 0 ? "out of stock" : `only ${formatQty(i.quantity, i.unit)} left`}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Tap an alert to record incoming stock.</p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input className={`${input} max-w-xs`} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {(["All", ...INVENTORY_CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${cat === c ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {items.isLoading && <p className="mt-8 text-muted-foreground">Loading inventory…</p>}
      {!items.isLoading && filtered.length === 0 && <p className="mt-8 text-muted-foreground">No items match this filter.</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((i) => {
          const st = stockStatus(i.quantity, i.min_stock_level);
          return (
            <div key={i.id} className="rounded-3xl border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.category}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stockBadge[st].className}`}>{stockBadge[st].label}</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-primary">{formatQty(i.quantity, i.unit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Minimum level: {formatQty(i.min_stock_level, i.unit)} · Updated {timeAgo(i.last_updated)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="hero" onClick={() => setModal({ mode: "movement", item: i, reason: "Incoming stock" })}>
                  <ArrowDownCircle className="h-4 w-4" /> Incoming
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModal({ mode: "movement", item: i, reason: "Stock used" })}>
                  <ArrowUpCircle className="h-4 w-4" /> Used
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", item: i })}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Recent stock activity</h2>
        <div className="mt-4 divide-y rounded-3xl border bg-card">
          {(logs.data ?? []).length === 0 && <p className="p-5 text-sm text-muted-foreground">No stock movements yet.</p>}
          {(logs.data ?? []).map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="font-medium">{l.inventory_items?.name ?? "Item"}</span>
              <span className={`font-semibold ${l.change >= 0 ? "text-success" : "text-destructive"}`}>
                {l.change >= 0 ? "+" : ""}{formatQty(l.change, l.inventory_items?.unit ?? "")}
              </span>
              <span className="text-muted-foreground">{l.reason}{l.order_number ? ` · ${l.order_number}` : ""}{l.note ? ` · ${l.note}` : ""}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(l.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {modal?.mode === "add" && <ItemForm onClose={() => setModal(null)} onSave={saveItem} />}
      {modal?.mode === "edit" && <ItemForm item={modal.item} onClose={() => setModal(null)} onSave={saveItem} />}
      {modal?.mode === "movement" && (
        <MovementForm item={modal.item} reason={modal.reason} onClose={() => setModal(null)} onSave={moveStock} />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemForm({
  item, onClose, onSave,
}: {
  item?: InventoryItem;
  onClose: () => void;
  onSave: (v: { name: string; category: string; unit: string; quantity: number; min: number }, editing: InventoryItem | null) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<string>(item?.category ?? INVENTORY_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [unit, setUnit] = useState<string>(item?.unit ?? "pieces");
  const [customUnit, setCustomUnit] = useState("");
  const [quantity, setQuantity] = useState(item ? "" : "0");
  const [min, setMin] = useState(item ? String(item.min_stock_level) : "5");
  const [busy, setBusy] = useState(false);

  const isCustomCategory = !INVENTORY_CATEGORIES.includes(category as (typeof INVENTORY_CATEGORIES)[number]);
  const isCustomUnit = !UNITS.includes(unit as (typeof UNITS)[number]);

  return (
    <ModalShell title={item ? `Edit ${item.name}` : "Add inventory item"} onClose={onClose}>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave(
            {
              name,
              category: isCustomCategory && customCategory.trim() ? customCategory.trim() : category,
              unit: isCustomUnit && customUnit.trim() ? customUnit.trim() : unit,
              quantity: Number(quantity) || 0,
              min: Number(min) || 0,
            },
            item ?? null,
          );
          setBusy(false);
        }}
      >
        <input className={input} required placeholder="Item name (e.g. Mozzarella Cheese)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} disabled={!!item}>
            {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="Other…">Other…</option>
          </select>
          <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value="Other…">Other…</option>
          </select>
        </div>
        {isCustomCategory && <input className={input} placeholder="Custom category" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />}
        {isCustomUnit && <input className={input} placeholder="Custom unit (e.g. crates)" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-muted-foreground">
            Quantity {item ? "(use Incoming / Used to change)" : ""}
            <input className={input} type="number" min={0} step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!!item} />
          </label>
          <label className="text-sm text-muted-foreground">
            Minimum stock level
            <input className={input} type="number" min={0} step="0.01" required value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
        </div>
        <Button type="submit" variant="hero" className="w-full" disabled={busy}>
          <PackageCheck className="h-4 w-4" /> {item ? "Save changes" : "Add item"}
        </Button>
      </form>
    </ModalShell>
  );
}

function MovementForm({
  item, reason, onClose, onSave,
}: {
  item: InventoryItem;
  reason: MovementReason;
  onClose: () => void;
  onSave: (item: InventoryItem, reason: MovementReason, amount: number, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const incoming = reason === "Incoming stock";
  return (
    <ModalShell title={incoming ? `Record incoming stock — ${item.name}` : `Record stock used — ${item.name}`} onClose={onClose}>
      <p className="mt-1 text-sm text-muted-foreground">Current: {formatQty(item.quantity, item.unit)}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave(item, reason, Number(amount), note);
        }}
      >
        <label className="text-sm text-muted-foreground">
          Amount ({item.unit})
          <input className={input} type="number" min={0} step="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <input className={input} placeholder="Note (optional — supplier, waste reason…)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" variant="hero" className="w-full">
          {incoming ? `Add ${amount || "…"} ${item.unit}` : `Deduct ${amount || "…"} ${item.unit}`}
        </Button>
      </form>
    </ModalShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/OrderSummaryCard";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES, menuQuery, type OrderStatus } from "@/lib/api";
import { formatPrice } from "@/lib/cart-logic";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Kitchen Dashboard — Verdant Table" },
      { name: "description", content: "Staff dashboard to manage orders and menu availability." },
      { property: "og:title", content: "Kitchen Dashboard — Verdant Table" },
      { property: "og:description", content: "Manage orders and menu availability." },
    ],
  }),
  component: AdminPage,
});

const field = "h-11 w-full rounded-2xl border bg-card px-4 outline-none focus:border-accent";

function AdminPage() {
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
        <p className="mt-2 text-muted-foreground">This account is not a kitchen admin.</p>
        <Button className="mt-4" variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    );
  return <Dashboard />;
}

function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/admin" } });
    if (error) toast.error(error.message);
    else if (mode === "up") toast.success("Check your email to confirm your account.");
  }
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-3xl font-semibold">Kitchen staff {mode === "in" ? "sign in" : "sign up"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">The first account created becomes the kitchen admin.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className={field} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="hero" className="w-full">{mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
      <button className="mt-4 text-sm font-semibold text-accent" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}

type AdminOrder = {
  id: string; order_number: string; customer_name: string; contact: string; notes: string | null;
  total: number; status: OrderStatus; created_at: string;
  order_items: { item_name: string; quantity: number }[];
};

function Dashboard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "All">("All");
  const [tab, setTab] = useState<"orders" | "menu">("orders");
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(item_name, quantity)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AdminOrder[];
    },
    refetchInterval: 10000,
  });
  const menu = useQuery(menuQuery);

  useEffect(() => {
    const ch = supabase.channel("orders-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => qc.invalidateQueries({ queryKey: ["admin-orders"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function setStatus(id: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Status set to ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  }
  async function toggle(id: string, is_available: boolean) {
    const { error } = await supabase.from("menu_items").update({ is_available }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["menu"] });
  }

  const list = (orders.data ?? []).filter((o) => filter === "All" || o.status === filter);
  const counts = (s: OrderStatus) => (orders.data ?? []).filter((o) => o.status === s).length;

  return (
    <div className="container-page py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold">Kitchen Dashboard</h1>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant={tab === "orders" ? "default" : "outline"} onClick={() => setTab("orders")}>Orders</Button>
        <Button variant={tab === "menu" ? "default" : "outline"} onClick={() => setTab("menu")}>Menu availability</Button>
      </div>

      {tab === "orders" ? (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {(["All", ...STATUSES] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${filter === s ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
                {s} {s !== "All" && `(${counts(s)})`}
              </button>
            ))}
          </div>
          {orders.isLoading && <p className="mt-6 text-muted-foreground">Loading orders…</p>}
          {!orders.isLoading && list.length === 0 && <p className="mt-6 text-muted-foreground">No orders.</p>}
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((o) => (
              <div key={o.id} className="rounded-3xl border bg-card p-5 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-primary">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-3 text-sm"><b>{o.customer_name}</b> · {o.contact}</p>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {o.order_items.map((i, k) => <li key={k}>{i.quantity} × {i.item_name}</li>)}
                </ul>
                {o.notes && <p className="mt-2 text-sm">Note: {o.notes}</p>}
                <p className="mt-2 font-bold text-accent">{formatPrice(Number(o.total))}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant={o.status === s ? "default" : "outline"} onClick={() => setStatus(o.id, s)}>{s}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6 divide-y rounded-3xl border bg-card">
          {(menu.data ?? []).map((m) => (
            <label key={m.id} className="flex items-center justify-between gap-3 p-4">
              <span><b>{m.name}</b> <span className="text-sm text-muted-foreground">· {m.category}</span></span>
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={m.is_available} onChange={(e) => toggle(m.id, e.target.checked)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

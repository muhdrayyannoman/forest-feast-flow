import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/OrderSummaryCard";
import { getMyOrders } from "@/lib/cart";
import { fetchOrder } from "@/lib/api";
import { formatPrice } from "@/lib/cart-logic";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Track Your Order — Verdant Table" },
      { name: "description", content: "Look up an order by its number and see your order history." },
      { property: "og:title", content: "Track Your Order — Verdant Table" },
      { property: "og:description", content: "Look up an order and see your history." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const navigate = useNavigate();
  const [num, setNum] = useState("");
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => setMine(getMyOrders()), []);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["my-orders", mine],
    enabled: mine.length > 0,
    queryFn: async () => (await Promise.all(mine.map((n) => fetchOrder(n).catch(() => null)))).filter(Boolean),
    refetchInterval: 10000,
  });

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-4xl font-semibold">Track your order</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (num.trim()) navigate({ to: "/order/$orderNumber", params: { orderNumber: num.trim().toUpperCase() } });
        }}
        className="mt-6 flex gap-2"
      >
        <label className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. EF-261013-A1B2C"
            className="h-12 w-full rounded-full border bg-card pl-11 pr-4 uppercase outline-none focus:border-accent" />
        </label>
        <Button type="submit" variant="hero" size="lg">Track</Button>
      </form>

      <h2 className="mt-12 text-2xl font-semibold">Order history on this device</h2>
      {mine.length === 0 && (
        <p className="mt-3 text-muted-foreground">No orders yet. <Link to="/menu" className="font-semibold text-accent">Browse the menu</Link></p>
      )}
      {isLoading && <p className="mt-3 text-muted-foreground">Loading…</p>}
      <div className="mt-4 space-y-3">
        {history.map((o) => o && (
          <Link key={o.order_number} to="/order/$orderNumber" params={{ orderNumber: o.order_number }}
            className="flex items-center justify-between gap-3 rounded-3xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <div>
              <p className="font-semibold text-primary">{o.order_number}</p>
              <p className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleString()} · {o.items.length} item(s)</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={o.status} />
              <span className="text-sm font-bold">{formatPrice(Number(o.total))}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

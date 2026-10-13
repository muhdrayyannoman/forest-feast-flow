import { Check } from "lucide-react";
import { formatPrice } from "@/lib/cart-logic";
import { statusStyles, type OrderSummary } from "@/lib/api";

const STEPS = ["Received", "Preparing", "Ready", "Completed"] as const;

export function StatusBadge({ status }: { status: OrderSummary["status"] }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>{status}</span>;
}

export function OrderSummaryCard({ order }: { order: OrderSummary }) {
  const idx = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  return (
    <div className="rounded-3xl border bg-card p-6 shadow-soft md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Order number</p>
          <p className="font-display text-3xl font-semibold text-primary">{order.order_number}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.customer_name} · {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === "Cancelled" ? (
        <p className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">This order was cancelled by the restaurant.</p>
      ) : (
        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center text-center">
              <span className={`grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-bold transition ${i <= idx ? "border-accent bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}>
                {i <= idx ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`mt-2 text-xs font-medium ${i <= idx ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      <ul className="mt-8 divide-y text-sm">
        {order.items.map((i, k) => (
          <li key={k} className="flex justify-between py-2">
            <span>{i.quantity} × {i.name}</span>
            <span>{formatPrice(Number(i.unit_price) * i.quantity)}</span>
          </li>
        ))}
      </ul>
      {order.notes && <p className="mt-3 text-sm text-muted-foreground">Note: {order.notes}</p>}
      <div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold">
        <span>Total</span><span className="text-accent">{formatPrice(Number(order.total))}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Payment: {order.payment_method === "cash" ? "Pay at counter" : "Simulated online payment (paid)"}
      </p>
    </div>
  );
}

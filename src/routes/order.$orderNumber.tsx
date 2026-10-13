import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { OrderSummaryCard } from "@/components/OrderSummaryCard";
import { fetchOrder } from "@/lib/api";

export const Route = createFileRoute("/order/$orderNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.orderNumber} — Verdant Table` },
      { name: "description", content: "Live status and summary of your restaurant order." },
      { property: "og:title", content: "Order status — Verdant Table" },
      { property: "og:description", content: "Live status and summary of your order." },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { orderNumber } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["order", orderNumber],
    queryFn: () => fetchOrder(orderNumber),
    refetchInterval: 5000, // auto-refresh status every 5 seconds
  });

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-4xl font-semibold">Order status</h1>
      <p className="mt-2 text-muted-foreground">This page updates automatically. Save your order number to track it later.</p>
      <div className="mt-8">
        {isLoading ? (
          <p className="text-muted-foreground">Loading order…</p>
        ) : data ? (
          <OrderSummaryCard order={data} />
        ) : (
          <p className="rounded-2xl bg-destructive/10 p-4 text-destructive">No order found with number {orderNumber}.</p>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="hero"><Link to="/menu">Order more</Link></Button>
        <Button asChild variant="outline"><Link to="/orders">My orders</Link></Button>
      </div>
    </div>
  );
}

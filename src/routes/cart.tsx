import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/cart-logic";
import fallback from "@/assets/fallback-dish.jpg";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Verdant Table" },
      { name: "description", content: "Review your selected dishes and adjust quantities before checkout." },
      { property: "og:title", content: "Your Cart — Verdant Table" },
      { property: "og:description", content: "Review your order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, total, count, setQty, clear } = useCart();

  if (lines.length === 0)
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-secondary text-accent"><ShoppingBag className="h-8 w-8" /></span>
        <h1 className="mt-6 text-3xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add a few dishes from the menu to get started.</p>
        <Button asChild variant="hero" size="lg" className="mt-6"><Link to="/menu">Browse menu</Link></Button>
      </div>
    );

  return (
    <div className="container-page py-12">
      <h1 className="text-4xl font-semibold">Your Cart</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-4 rounded-3xl border bg-card p-4 shadow-soft">
              <img src={l.image_url || fallback} alt={l.name} loading="lazy" width={96} height={96} className="h-20 w-20 rounded-2xl object-cover sm:h-24 sm:w-24" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{l.name}</h3>
                <p className="text-sm text-muted-foreground">{formatPrice(l.price)} each</p>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQty(l.id, l.quantity - 1)} aria-label="Decrease"><Minus /></Button>
                  <span className="w-8 text-center font-semibold">{l.quantity}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(l.id, l.quantity + 1)} aria-label="Increase"><Plus /></Button>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-bold text-accent">{formatPrice(l.price * l.quantity)}</span>
                <Button size="icon" variant="ghost" onClick={() => setQty(l.id, 0)} aria-label="Remove"><Trash2 /></Button>
              </div>
            </div>
          ))}
          <Button variant="ghost" onClick={clear}><Trash2 /> Clear cart</Button>
        </div>
        <aside className="h-fit rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift">
          <h2 className="text-2xl font-semibold">Summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-primary-foreground/70">Items</span><span>{count}</span></div>
            <div className="flex justify-between"><span className="text-primary-foreground/70">Subtotal</span><span>{formatPrice(total)}</span></div>
            <div className="flex justify-between"><span className="text-primary-foreground/70">Service</span><span>Free</span></div>
          </div>
          <div className="mt-4 flex justify-between border-t border-primary-foreground/20 pt-4 text-lg font-bold">
            <span>Total</span><span>{formatPrice(total)}</span>
          </div>
          <Button asChild variant="hero" size="lg" className="mt-6 w-full"><Link to="/checkout">Proceed to checkout</Link></Button>
        </aside>
      </div>
    </div>
  );
}

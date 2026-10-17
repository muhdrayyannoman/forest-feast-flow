import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatPrice, type MenuItem } from "@/lib/cart-logic";
import fallback from "@/assets/fallback-dish.jpg";

export function FoodCard({ item, index = 0 }: { item: MenuItem; index?: number }) {
  const { lines, add, setQty } = useCart();
  const inCart = lines.find((l) => l.id === item.id);
  return (
    <article
      className="animate-card-in group flex flex-col overflow-hidden rounded-3xl border bg-card shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={item.image_url || fallback}
          onError={(e) => ((e.currentTarget as HTMLImageElement).src = fallback)}
          alt={item.name}
          loading="lazy"
          width={800}
          height={600}
          className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${item.is_available ? "" : "grayscale"}`}
        />
        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
          {item.category}
        </span>
        {!item.is_available && (
          <span className="absolute right-3 top-3 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground">
            Unavailable
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug">{item.name}</h3>
          <span className="whitespace-nowrap font-bold text-accent">{formatPrice(item.price)}</span>
        </div>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.description}</p>
        <div className="mt-4">
          {!item.is_available ? (
            <Button disabled variant="secondary" className="w-full">Currently unavailable</Button>
          ) : inCart ? (
            <div className="flex items-center justify-between rounded-full bg-secondary p-1">
              <Button size="icon" variant="ghost" onClick={() => setQty(item.id, inCart.quantity - 1)} aria-label="Decrease">
                <Minus />
              </Button>
              <span className="font-semibold">{inCart.quantity} in cart</span>
              <Button size="icon" variant="ghost" onClick={() => setQty(item.id, inCart.quantity + 1)} aria-label="Increase">
                <Plus />
              </Button>
            </div>
          ) : (
            <Button
              variant="hero"
              className="w-full"
              onClick={() => {
                add(item);
                toast.success(`${item.name} added to cart`);
              }}
            >
              <Plus /> Add to cart
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

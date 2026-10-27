import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu as MenuIcon, X, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/orders", label: "Track Order" },
  { to: "/admin", label: "Kitchen" },
] as const;

export function SiteHeader() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-primary-foreground/10 bg-primary text-primary-foreground">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <span className="font-display text-xl font-semibold tracking-wide">Verdant Table</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="rounded-full px-4 py-2 text-sm font-medium text-primary-foreground/80 transition hover:text-primary-foreground [&.active]:bg-primary-foreground/10 [&.active]:text-primary-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/cart"
            className="relative flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:-translate-y-0.5"
            aria-label="Cart"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-foreground px-1 text-xs text-primary">
                {count}
              </span>
            )}
          </Link>
          <button className="p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="container-page flex flex-col gap-1 pb-4 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: l.to === "/" }}
              className="rounded-xl px-4 py-3 text-primary-foreground/80 [&.active]:bg-primary-foreground/10 [&.active]:text-primary-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-primary text-primary-foreground">
      <div className="container-page grid gap-10 py-14 md:grid-cols-3">
        <div>
          <h3 className="text-2xl font-semibold">Verdant Table</h3>
          <p className="mt-3 max-w-xs text-sm text-primary-foreground/70">
            Seasonal plates, slow-cooked classics and honest ingredients — ordered online, ready when you are.
          </p>
        </div>
        <div className="text-sm">
          <h4 className="mb-3 text-lg font-semibold">Visit</h4>
          <p className="text-primary-foreground/70">12 Garden Road, Karachi</p>
          <p className="text-primary-foreground/70">Open daily · 12:00 – 23:00</p>
        </div>
        <div className="text-sm">
          <h4 className="mb-3 text-lg font-semibold">Explore</h4>
          <div className="flex flex-col gap-2 text-primary-foreground/70">
            <Link to="/menu" className="hover:text-accent">Full menu</Link>
            <Link to="/orders" className="hover:text-accent">Track your order</Link>
            <Link to="/admin" className="hover:text-accent">Kitchen dashboard</Link>
            <Link to="/inventory" className="hover:text-accent">Kitchen inventory</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 py-5 text-center text-xs text-primary-foreground/60">
        © 2026 Verdant Table · EF101-P14 Online Restaurant Ordering System
      </div>
    </footer>
  );
}

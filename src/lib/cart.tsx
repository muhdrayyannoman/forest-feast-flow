import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { addToCart, cartCount, cartTotal, setQuantity, type CartLine, type MenuItem } from "./cart-logic";

type CartCtx = {
  lines: CartLine[];
  count: number;
  total: number;
  add: (item: MenuItem) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "ef-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, loaded]);

  const value: CartCtx = {
    lines,
    count: cartCount(lines),
    total: cartTotal(lines),
    add: (item) => setLines((c) => addToCart(c, item)),
    setQty: (id, qty) => setLines((c) => setQuantity(c, id, qty)),
    clear: () => setLines([]),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be inside CartProvider");
  return c;
}

// Order history stored on this device (order numbers only; details come from the database)
const ORDERS_KEY = "ef-my-orders";
export function rememberOrder(num: string) {
  const list = getMyOrders().filter((n) => n !== num);
  localStorage.setItem(ORDERS_KEY, JSON.stringify([num, ...list].slice(0, 30)));
}
export function getMyOrders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
  } catch {
    return [];
  }
}

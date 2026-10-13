// Pure cart helpers (no React) so they are easy to test and explain.
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
};

export type CartLine = { id: string; name: string; price: number; image_url: string | null; quantity: number };

export const MAX_QTY = 50;

export function addToCart(cart: CartLine[], item: MenuItem, qty = 1): CartLine[] {
  if (!item.is_available) return cart; // unavailable items can never be added
  const existing = cart.find((l) => l.id === item.id);
  if (existing) {
    return cart.map((l) =>
      l.id === item.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + qty) } : l,
    );
  }
  return [
    ...cart,
    { id: item.id, name: item.name, price: Number(item.price), image_url: item.image_url, quantity: Math.min(MAX_QTY, qty) },
  ];
}

export function setQuantity(cart: CartLine[], id: string, qty: number): CartLine[] {
  if (qty <= 0) return cart.filter((l) => l.id !== id);
  return cart.map((l) => (l.id === id ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l));
}

export function cartCount(cart: CartLine[]) {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

export function cartTotal(cart: CartLine[]) {
  return Math.round(cart.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100;
}

export function formatPrice(n: number) {
  return `Rs ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

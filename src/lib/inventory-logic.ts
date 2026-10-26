// Pure inventory helpers (no React) so they are easy to test and explain.

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_stock_level: number;
  last_updated: string;
};

export type StockStatus = "ok" | "low" | "out";

export const INVENTORY_CATEGORIES = [
  "Burger Ingredients",
  "Pizza Ingredients",
  "Cooking Supplies",
  "Drinks & Frozen",
  "Packaging",
  "Kitchen Essentials",
] as const;

export const UNITS = [
  "pieces", "kg", "grams", "litres", "bottles", "packets",
  "boxes", "bags", "jars", "cans", "tubs",
] as const;

/** An item is out when nothing is left, low when at or below its minimum level. */
export function stockStatus(quantity: number, minStockLevel: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= minStockLevel) return "low";
  return "ok";
}

export function formatQty(quantity: number, unit: string): string {
  const n = Math.round(Number(quantity) * 100) / 100;
  return `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} hr ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)} day${days >= 2 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString();
}

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MenuItem } from "./cart-logic";

export const STATUSES = ["Received", "Preparing", "Ready", "Completed", "Cancelled"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export const CATEGORIES = ["Starters", "Main Course", "Pizza & Burgers", "Pasta", "Desserts", "Drinks"];

export const menuQuery = queryOptions({
  queryKey: ["menu"],
  queryFn: async (): Promise<MenuItem[]> => {
    const { data, error } = await supabase.from("menu_items").select("*").order("category").order("name");
    if (error) throw error;
    return (data ?? []).map((d) => ({ ...d, price: Number(d.price) }));
  },
});

export type OrderSummary = {
  order_number: string;
  customer_name: string;
  status: OrderStatus;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: { name: string; unit_price: number; quantity: number }[];
};

export async function fetchOrder(num: string): Promise<OrderSummary | null> {
  const { data, error } = await supabase.rpc("get_order", { p_order_number: num });
  if (error) throw error;
  return (data as unknown as OrderSummary) ?? null;
}

export const statusStyles: Record<OrderStatus, string> = {
  Received: "bg-info/15 text-info",
  Preparing: "bg-warning/20 text-foreground",
  Ready: "bg-accent/15 text-accent",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-destructive/15 text-destructive",
};

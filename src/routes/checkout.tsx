import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCart, rememberOrder } from "@/lib/cart";
import { formatPrice } from "@/lib/cart-logic";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Verdant Table" },
      { name: "description", content: "Enter your name and contact to place your order." },
      { property: "og:title", content: "Checkout — Verdant Table" },
      { property: "og:description", content: "Place your restaurant order." },
    ],
  }),
  component: Checkout,
});

const field = "mt-1 h-12 w-full rounded-2xl border bg-card px-4 outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";

function Checkout() {
  const { lines, total, clear } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<"cash" | "simulated_card">("cash");
  const [busy, setBusy] = useState(false);

  if (lines.length === 0)
    return (
      <div className="container-page py-24 text-center">
        <h1 className="text-3xl font-semibold">Nothing to check out</h1>
        <Button asChild variant="hero" className="mt-6"><Link to="/menu">Go to menu</Link></Button>
      </div>
    );

  async function submit(e: React.FormEvent): Promise<unknown> {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Please enter your name");
    if (contact.trim().length < 5) return toast.error("Please enter a phone number or email");
    setBusy(true);
    if (payment === "simulated_card") await new Promise((r) => setTimeout(r, 1200)); // simulated payment
    const { data, error } = await supabase.rpc("place_order", {
      p_name: name,
      p_contact: contact,
      p_items: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
      p_notes: notes,
      p_payment: payment,
    });
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not place order");
    rememberOrder(data);
    clear();
    toast.success(`Order ${data} placed!`);
    navigate({ to: "/order/$orderNumber", params: { orderNumber: data } });
  }

  return (
    <div className="container-page py-12">
      <h1 className="text-4xl font-semibold">Checkout</h1>
      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5 rounded-3xl border bg-card p-6 shadow-soft">
          <label className="block text-sm font-medium">Full name *
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="Ayesha Khan" />
          </label>
          <label className="block text-sm font-medium">Phone or email *
            <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} required placeholder="0300 1234567" />
          </label>
          <label className="block text-sm font-medium">Special instructions
            <textarea className={`${field} h-24 py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Less spicy, no onions…" />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Payment (simulated — no card details needed)</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {[
                { v: "cash", t: "Pay at counter", d: "Cash on pickup" },
                { v: "simulated_card", t: "Simulated online payment", d: "Demo only, nothing charged" },
              ].map((o) => (
                <label key={o.v} className={`cursor-pointer rounded-2xl border p-4 transition ${payment === o.v ? "border-accent bg-accent/10" : "hover:border-accent/50"}`}>
                  <input type="radio" name="pay" className="sr-only" checked={payment === o.v} onChange={() => setPayment(o.v as typeof payment)} />
                  <span className="block font-semibold">{o.t}</span>
                  <span className="text-sm text-muted-foreground">{o.d}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <aside className="h-fit rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift">
          <h2 className="text-2xl font-semibold">Order summary</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="text-primary-foreground/80">{l.quantity} × {l.name}</span>
                <span>{formatPrice(l.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-primary-foreground/20 pt-4 text-lg font-bold">
            <span>Total</span><span>{formatPrice(total)}</span>
          </div>
          <Button type="submit" variant="hero" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? <><Loader2 className="animate-spin" /> Placing order…</> : "Place order"}
          </Button>
        </aside>
      </form>
    </div>
  );
}

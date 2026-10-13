import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FoodCard } from "@/components/FoodCard";
import { menuQuery, CATEGORIES } from "@/lib/api";

export const Route = createFileRoute("/menu")({
  validateSearch: (s: Record<string, unknown>): { category?: string | undefined } => ({
    category: typeof s["category"] === "string" ? (s["category"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Menu — Verdant Table" },
      { name: "description", content: "Search and filter our full menu of starters, mains, pizza, pasta, desserts and drinks." },
      { property: "og:title", content: "Menu — Verdant Table" },
      { property: "og:description", content: "Search and filter our full menu." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { category = "All" } = Route.useSearch();
  const navigate = useNavigate({ from: "/menu" });
  const [q, setQ] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const { data: menu = [], isLoading, error } = useQuery(menuQuery);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return menu.filter(
      (m) =>
        (category === "All" || m.category === category) &&
        (!onlyAvailable || m.is_available) &&
        (!term || m.name.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)),
    );
  }, [menu, q, category, onlyAvailable]);

  return (
    <div className="container-page py-12">
      <h1 className="text-4xl font-semibold md:text-5xl">Our Menu</h1>
      <p className="mt-2 text-muted-foreground">{menu.length} dishes across {CATEGORIES.length} categories.</p>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes, e.g. biryani, pizza…"
            className="h-12 w-full rounded-full border bg-card pl-11 pr-4 outline-none focus:border-accent focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="h-4 w-4 accent-accent" />
          Available only
        </label>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => navigate({ search: { category: c === "All" ? undefined : c } })}
            className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition ${
              c === category ? "bg-primary text-primary-foreground" : "border bg-card hover:border-accent hover:text-accent"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="mt-10 text-destructive">Could not load the menu. Please refresh.</p>}
      {isLoading && <p className="mt-10 text-muted-foreground">Loading menu…</p>}
      {!isLoading && items.length === 0 && <p className="mt-10 text-muted-foreground">No dishes match your search.</p>}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <FoodCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

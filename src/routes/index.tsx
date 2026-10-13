import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Leaf, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoodCard } from "@/components/FoodCard";
import { menuQuery, CATEGORIES } from "@/lib/api";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Verdant Table — Order Fine Food Online" },
      { name: "description", content: "Browse 30+ dishes, order online and track your meal from kitchen to counter." },
      { property: "og:title", content: "Verdant Table — Order Fine Food Online" },
      { property: "og:description", content: "Browse 30+ dishes, order online and track your meal live." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: menu = [] } = useQuery(menuQuery);
  const featured = menu.filter((m) => m.is_available).slice(0, 6);
  return (
    <>
      <section className="relative overflow-hidden">
        <img src={hero} alt="Elegant plated dishes" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="container-page relative py-24 text-primary-foreground md:py-36">
          <p className="mb-4 inline-block rounded-full bg-accent/90 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-accent-foreground">
            Now taking online orders
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight md:text-6xl">
            Seasonal cooking, <em className="text-accent">delivered to your table.</em>
          </h1>
          <p className="mt-5 max-w-lg text-primary-foreground/80 md:text-lg">
            Pick from our kitchen's favourites, place your order in seconds and watch it move from the pass to your plate.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="hero" size="lg">
              <Link to="/menu">Order now <ArrowRight /></Link>
            </Button>
            <Button asChild variant="cream" size="lg">
              <Link to="/orders">Track an order</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container-page -mt-10 relative grid gap-4 md:grid-cols-3">
        {[
          { icon: Leaf, t: "Fresh daily", d: "Ingredients sourced every morning." },
          { icon: ChefHat, t: "Chef crafted", d: "Classic recipes, modern technique." },
          { icon: Clock, t: "Live tracking", d: "Know exactly when it's ready." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="flex items-center gap-4 rounded-3xl border bg-card p-5 shadow-soft">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-accent"><Icon className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold">{t}</h3>
              <p className="text-sm text-muted-foreground">{d}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="container-page mt-20">
        <h2 className="text-3xl font-semibold md:text-4xl">Explore categories</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              to="/menu"
              search={{ category: c }}
              className="rounded-full border bg-card px-5 py-2.5 text-sm font-medium transition hover:border-accent hover:bg-accent hover:text-accent-foreground"
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Chef's picks</p>
            <h2 className="text-3xl font-semibold md:text-4xl">Popular tonight</h2>
          </div>
          <Link to="/menu" className="hidden items-center gap-1 text-sm font-semibold text-primary hover:text-accent sm:flex">
            View full menu <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => <FoodCard key={item.id} item={item} />)}
        </div>
      </section>
    </>
  );
}

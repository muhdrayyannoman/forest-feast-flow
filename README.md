# Verdant Table — Online Restaurant Ordering System (EF101-P14)

A complete online restaurant ordering system built with a beginner-friendly, modern stack:

- **Frontend:** React 19 + TanStack Start (routing, server functions) + Tailwind CSS v4
- **Backend & database:** Lovable Cloud (managed Postgres database with row-level security)
- **Payments:** Simulated only — cash or "simulated card". No real card details are collected anywhere.

## Run it

1. Open the project in Lovable and use the live preview, or publish it for a public URL.
2. Staff/admin access: go to `/admin`. **The first staff account registered becomes the kitchen admin**; later accounts are normal users (there are no customer accounts — customers order without signing in).
3. Inventory: go to `/inventory` (also linked from the kitchen dashboard). Same admin account signs in there.

No local setup is required; if you clone the repo, `npm i && npm run dev` runs it against the connected Lovable Cloud backend.

## Features

### Customer side (no login needed)
- Homepage with hero, featured dishes, category shortcuts
- Menu with **30+ items across 6 categories**, images, descriptions, prices, availability
- Search + category filters, "available only" toggle
- Cart with quantity controls and automatic totals
- Checkout (name, contact, notes, cash or simulated card)
- **Unique order number** generated server-side (`EF-YYMMDD-XXXXX`)
- Order tracking page that live-refreshes every 5 seconds, plus order history on the device

### Kitchen dashboard (`/admin`)
- Staff sign in / sign up
- Live order cards with status buttons: Received → Preparing → Ready → Completed / Cancelled
- Status filter tabs with counts, auto-refresh via realtime updates
- Menu availability toggle (unavailable items can't be ordered — blocked in the UI **and** in the database)

### Kitchen Inventory Management (`/inventory`)
- **48 pre-loaded items** in 6 categories: Burger Ingredients, Pizza Ingredients, Cooking Supplies, Drinks & Frozen, Packaging, Kitchen Essentials — buns, patties, cheese, dough, mozzarella, oil, flour, spices, soft drinks, ice cubes (bags), packaging boxes, sachets, gloves, cleaning supplies, etc.
- Every item shows **name, available quantity, unit, minimum stock level, last updated time**
- **Add any new item** (custom categories and units supported), edit item details, record **incoming stock** and **stock used**
- **Automatic deduction:** each menu dish is linked to its ingredients (recipes), so placing an order deducts burger buns, patties, dough, cheese, ice, etc. server-side — no manual entry needed
- **Low-stock alerts and out-of-stock warnings** in a dedicated alert panel and per-item badges (In stock / Low stock / Out of stock)
- Dashboard stats: items tracked, low-stock count, out-of-stock count, categories
- **Stock activity log:** every incoming delivery, order deduction and manual usage is recorded with quantity, reason and timestamp

## Database schema (overview)

| Table | Purpose |
|---|---|
| `menu_items` | Dishes: name, description, category, price, image, availability |
| `orders` | Order header: order number, customer, contact, payment method, total, status |
| `order_items` | Ordered dishes per order: name, unit price, quantity |
| `user_roles` | Staff roles (admin/user) — first signup becomes admin |
| `inventory_items` | Stock: name, category, quantity, unit, minimum level, last updated |
| `inventory_logs` | Stock movements: incoming/used, reason, note, order number, time |
| `recipe_items` | Links each dish to the inventory items it consumes, with quantity per serving |

Business rules are enforced **in the database itself** (server-side functions): order totals are computed server-side, order numbers are collision-safe, unavailable dishes are rejected, and ingredient deduction happens in the same transaction as the order. Row-level security restricts order and inventory management to admin accounts; customers can only read the menu and their own order via its number.

## Code structure

- `src/routes/` — one file per page (home, menu, cart, checkout, order tracking, admin, inventory)
- `src/lib/` — pure logic (cart, inventory status rules) and API helpers, all unit-tested in `src/test/`
- `src/components/` — shared UI (header/footer, food cards, order summary)
- `drizzle/migrations/` — database schema history

## Notes for the presentation

- The demo flow to show: order a burger on the menu → checkout → order tracking number → admin dashboard sets status → inventory page shows buns/patties/cheese quantities reduced automatically.
- Toggle a menu item off in the dashboard → it becomes un-orderable on the menu.
- Show the inventory alert panel: items at/below minimum are flagged; recording an incoming delivery clears the alert and writes to the activity log.

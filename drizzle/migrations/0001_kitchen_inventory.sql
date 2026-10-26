CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL,
  min_stock_level numeric(12,2) NOT NULL DEFAULT 5 CHECK (min_stock_level >= 0),
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  change numeric(12,2) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('Incoming stock','Stock used','Manual adjustment')),
  note text,
  order_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_per_unit numeric(12,3) NOT NULL CHECK (quantity_per_unit > 0),
  UNIQUE (menu_item_id, inventory_item_id)
);

CREATE INDEX inventory_logs_item_idx ON public.inventory_logs (item_id, created_at DESC);
CREATE INDEX recipe_items_menu_idx ON public.recipe_items (menu_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
GRANT SELECT, INSERT ON public.inventory_logs TO authenticated;
GRANT ALL ON public.inventory_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_items TO authenticated;
GRANT ALL ON public.recipe_items TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory items"
  ON public.inventory_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view stock logs"
  ON public.inventory_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert stock logs"
  ON public.inventory_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage recipes"
  ON public.recipe_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_inventory() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_touch BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.touch_inventory();

CREATE OR REPLACE FUNCTION public.record_stock_movement(p_item_id uuid, p_change numeric, p_reason text, p_note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF p_reason NOT IN ('Incoming stock','Stock used','Manual adjustment') THEN
    RAISE EXCEPTION 'Invalid movement reason';
  END IF;
  UPDATE public.inventory_items
  SET quantity = GREATEST(0, quantity + p_change)
  WHERE id = p_item_id
  RETURNING quantity INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  INSERT INTO public.inventory_logs (item_id, change, reason, note)
  VALUES (p_item_id, p_change, p_reason, nullif(trim(p_note), ''));
  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_order(p_name text, p_contact text, p_items jsonb, p_notes text DEFAULT NULL::text, p_payment text DEFAULT 'cash'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_number text;
  v_total numeric := 0;
  v_item jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_qty int;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) < 2 OR length(p_name) > 80 THEN RAISE EXCEPTION 'Please enter a valid name'; END IF;
  IF p_contact IS NULL OR length(trim(p_contact)) < 5 OR length(p_contact) > 80 THEN RAISE EXCEPTION 'Please enter a valid contact'; END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 300 THEN RAISE EXCEPTION 'Notes too long'; END IF;
  IF p_payment NOT IN ('cash','simulated_card') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  LOOP
    v_number := 'EF-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_number);
  END LOOP;

  INSERT INTO public.orders (order_number, customer_name, contact, notes, payment_method, total)
  VALUES (v_number, trim(p_name), trim(p_contact), nullif(trim(p_notes), ''), p_payment, 0)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_menu FROM public.menu_items WHERE id = (v_item->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF NOT v_menu.is_available THEN RAISE EXCEPTION '% is currently unavailable', v_menu.name; END IF;
    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price, quantity)
    VALUES (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty);
    v_total := v_total + v_menu.price * v_qty;
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;

  WITH usage AS (
    SELECT ri.inventory_item_id, SUM(ri.quantity_per_unit * oi.quantity) AS amount
    FROM public.order_items oi
    JOIN public.recipe_items ri ON ri.menu_item_id = oi.menu_item_id
    WHERE oi.order_id = v_order_id
    GROUP BY ri.inventory_item_id
  ),
  logged AS (
    INSERT INTO public.inventory_logs (item_id, change, reason, note)
    SELECT inventory_item_id, -amount, 'Stock used', 'Auto-deducted for order ' || v_number
    FROM usage
  )
  UPDATE public.inventory_items inv
  SET quantity = GREATEST(0, inv.quantity - u.amount)
  FROM usage u
  WHERE inv.id = u.inventory_item_id;

  RETURN v_number;
END $function$;

INSERT INTO public.inventory_items (name, category, quantity, unit, min_stock_level) VALUES
  ('Burger Buns','Burger Ingredients',150,'pieces',30),
  ('Beef Patties','Burger Ingredients',90,'pieces',20),
  ('Chicken Patties','Burger Ingredients',70,'pieces',20),
  ('Cheese Slices','Burger Ingredients',220,'pieces',50),
  ('Lettuce','Burger Ingredients',2.5,'kg',3),
  ('Tomatoes','Burger Ingredients',12,'kg',4),
  ('Onions','Burger Ingredients',14,'kg',4),
  ('Pickles','Burger Ingredients',1,'jars',3),
  ('Mayonnaise','Burger Ingredients',8,'bottles',2),
  ('Burger Sauce','Burger Ingredients',9,'bottles',2),
  ('Ketchup','Burger Ingredients',11,'bottles',3),
  ('Pizza Dough','Pizza Ingredients',16,'kg',4),
  ('Flour','Pizza Ingredients',12,'bags',3),
  ('Mozzarella Cheese','Pizza Ingredients',13,'kg',4),
  ('Pizza Sauce','Pizza Ingredients',14,'bottles',4),
  ('Mushrooms','Pizza Ingredients',0,'kg',2),
  ('Olives','Pizza Ingredients',1,'jars',2),
  ('Bell Peppers','Pizza Ingredients',7,'kg',2),
  ('Chicken Topping','Pizza Ingredients',7,'kg',2),
  ('Beef Topping','Pizza Ingredients',6,'kg',2),
  ('Sweet Corn','Pizza Ingredients',10,'cans',3),
  ('Cooking Oil Packets','Cooking Supplies',22,'packets',6),
  ('Oil Bottles','Cooking Supplies',16,'bottles',4),
  ('Sugar','Cooking Supplies',12,'kg',3),
  ('Salt','Cooking Supplies',9,'kg',2),
  ('Mixed Spices','Cooking Supplies',24,'packets',6),
  ('Butter','Cooking Supplies',1,'kg',2),
  ('Garlic','Cooking Supplies',5,'kg',1),
  ('Soft Drinks','Drinks & Frozen',96,'bottles',24),
  ('Water Bottles','Drinks & Frozen',120,'bottles',30),
  ('Ice Cubes','Drinks & Frozen',26,'bags',6),
  ('Ice Cream','Drinks & Frozen',2,'tubs',3),
  ('Frozen Fries','Drinks & Frozen',14,'packets',4),
  ('Frozen Fish Fillets','Drinks & Frozen',6,'packets',2),
  ('Milk','Drinks & Frozen',18,'litres',5),
  ('Burger Boxes','Packaging',32,'boxes',8),
  ('Pizza Boxes','Packaging',28,'boxes',8),
  ('Food Wrappers','Packaging',20,'packets',5),
  ('Paper Bags','Packaging',16,'packets',4),
  ('Cups','Packaging',12,'packets',3),
  ('Cup Lids','Packaging',12,'packets',3),
  ('Straws','Packaging',14,'packets',3),
  ('Tissues','Packaging',16,'boxes',4),
  ('Takeaway Containers','Packaging',18,'packets',4),
  ('Ketchup Sachets','Kitchen Essentials',26,'packets',6),
  ('Mayonnaise Sachets','Kitchen Essentials',26,'packets',6),
  ('Gloves','Kitchen Essentials',11,'boxes',3),
  ('Cleaning Supplies','Kitchen Essentials',9,'bottles',2),
  ('Trash Bags','Kitchen Essentials',10,'packets',2);

INSERT INTO public.recipe_items (menu_item_id, inventory_item_id, quantity_per_unit)
SELECT m.id, i.id, v.qty
FROM (VALUES
  ('Classic Beef Burger','Burger Buns',1.0),
  ('Classic Beef Burger','Beef Patties',1.0),
  ('Classic Beef Burger','Cheese Slices',1.0),
  ('Classic Beef Burger','Lettuce',0.03),
  ('Classic Beef Burger','Tomatoes',0.04),
  ('Classic Beef Burger','Onions',0.02),
  ('Classic Beef Burger','Pickles',0.02),
  ('Classic Beef Burger','Burger Sauce',0.02),
  ('Classic Beef Burger','Mayonnaise',0.01),
  ('Crispy Chicken Burger','Burger Buns',1.0),
  ('Crispy Chicken Burger','Chicken Patties',1.0),
  ('Crispy Chicken Burger','Cheese Slices',1.0),
  ('Crispy Chicken Burger','Lettuce',0.03),
  ('Crispy Chicken Burger','Mayonnaise',0.02),
  ('Crispy Chicken Burger','Burger Sauce',0.02),
  ('Double Smash Burger','Burger Buns',1.0),
  ('Double Smash Burger','Beef Patties',2.0),
  ('Double Smash Burger','Cheese Slices',2.0),
  ('Double Smash Burger','Onions',0.03),
  ('Double Smash Burger','Pickles',0.02),
  ('Double Smash Burger','Burger Sauce',0.03),
  ('Margherita Pizza','Pizza Dough',0.3),
  ('Margherita Pizza','Mozzarella Cheese',0.15),
  ('Margherita Pizza','Pizza Sauce',0.08),
  ('Pepperoni Pizza','Pizza Dough',0.3),
  ('Pepperoni Pizza','Mozzarella Cheese',0.15),
  ('Pepperoni Pizza','Pizza Sauce',0.08),
  ('Pepperoni Pizza','Beef Topping',0.08),
  ('BBQ Chicken Pizza','Pizza Dough',0.3),
  ('BBQ Chicken Pizza','Mozzarella Cheese',0.15),
  ('BBQ Chicken Pizza','Pizza Sauce',0.06),
  ('BBQ Chicken Pizza','Chicken Topping',0.12),
  ('Garlic Bread','Pizza Dough',0.15),
  ('Garlic Bread','Butter',0.03),
  ('Garlic Bread','Garlic',0.01),
  ('Caesar Salad','Lettuce',0.15),
  ('Caesar Salad','Mozzarella Cheese',0.03),
  ('Caesar Salad','Mayonnaise',0.03),
  ('Crispy Chicken Wings','Chicken Topping',0.25),
  ('Crispy Chicken Wings','Mixed Spices',0.01),
  ('Loaded Nachos','Sweet Corn',0.05),
  ('Loaded Nachos','Mozzarella Cheese',0.08),
  ('Vegetable Samosas','Flour',0.05),
  ('Vegetable Samosas','Mixed Spices',0.01),
  ('Tomato Basil Soup','Tomatoes',0.2),
  ('Tomato Basil Soup','Butter',0.02),
  ('Spaghetti Bolognese','Flour',0.15),
  ('Spaghetti Bolognese','Beef Topping',0.12),
  ('Spaghetti Bolognese','Tomatoes',0.1),
  ('Penne Arrabbiata','Flour',0.15),
  ('Penne Arrabbiata','Tomatoes',0.12),
  ('Penne Arrabbiata','Mixed Spices',0.01),
  ('Fettuccine Alfredo','Flour',0.15),
  ('Fettuccine Alfredo','Milk',0.15),
  ('Fettuccine Alfredo','Butter',0.04),
  ('Chicken Biryani','Chicken Topping',0.3),
  ('Chicken Biryani','Mixed Spices',0.02),
  ('Herb Roast Chicken','Chicken Topping',0.4),
  ('Herb Roast Chicken','Mixed Spices',0.02),
  ('Herb Roast Chicken','Butter',0.03),
  ('Butter Chicken','Chicken Topping',0.3),
  ('Butter Chicken','Butter',0.05),
  ('Butter Chicken','Mixed Spices',0.02),
  ('Chicken Fried Rice','Chicken Topping',0.2),
  ('Chicken Fried Rice','Oil Bottles',0.02),
  ('Grilled Ribeye Steak','Beef Topping',0.3),
  ('Grilled Salmon','Frozen Fish Fillets',1.0),
  ('Ice Cream Sundae','Ice Cream',0.15),
  ('Chocolate Lava Cake','Flour',0.08),
  ('Chocolate Lava Cake','Sugar',0.05),
  ('Chocolate Lava Cake','Butter',0.04),
  ('Gulab Jamun','Milk',0.1),
  ('Gulab Jamun','Sugar',0.05),
  ('Gulab Jamun','Flour',0.05),
  ('New York Cheesecake','Milk',0.1),
  ('New York Cheesecake','Sugar',0.08),
  ('New York Cheesecake','Butter',0.05),
  ('Tiramisu','Milk',0.1),
  ('Tiramisu','Sugar',0.05),
  ('Chocolate Milkshake','Milk',0.25),
  ('Chocolate Milkshake','Ice Cream',0.1),
  ('Fresh Lemonade','Sugar',0.04),
  ('Fresh Lemonade','Ice Cubes',0.1),
  ('Fresh Lemonade','Water Bottles',0.3),
  ('Iced Caramel Latte','Milk',0.2),
  ('Iced Caramel Latte','Ice Cubes',0.1),
  ('Mango Smoothie','Milk',0.2),
  ('Mango Smoothie','Ice Cream',0.08),
  ('Masala Chai','Milk',0.15),
  ('Masala Chai','Mixed Spices',0.005),
  ('Masala Chai','Sugar',0.02),
  ('Mint Margarita','Ice Cubes',0.1),
  ('Mint Margarita','Sugar',0.03)
) AS v(menu_name, inv_name, qty)
JOIN public.menu_items m ON m.name = v.menu_name
JOIN public.inventory_items i ON i.name = v.inv_name;
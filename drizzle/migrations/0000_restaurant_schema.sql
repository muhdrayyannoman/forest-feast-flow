
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- First registered account becomes the kitchen admin
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_role AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT UPDATE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view menu" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update menu" ON public.menu_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  contact text NOT NULL,
  notes text,
  payment_method text NOT NULL DEFAULT 'cash',
  total numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'Received' CHECK (status IN ('Received','Preparing','Ready','Completed','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0)
);
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view order items" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Place order: validates items & availability, computes total on the server
CREATE OR REPLACE FUNCTION public.place_order(p_name text, p_contact text, p_items jsonb, p_notes text DEFAULT NULL, p_payment text DEFAULT 'cash')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  RETURN v_number;
END $$;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb, text, text) TO anon, authenticated;

-- Track order by its unique number
CREATE OR REPLACE FUNCTION public.get_order(p_order_number text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'customer_name', o.customer_name, 'status', o.status,
    'total', o.total, 'payment_method', o.payment_method, 'notes', o.notes,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', i.item_name, 'unit_price', i.unit_price, 'quantity', i.quantity))
                       FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o WHERE o.order_number = upper(trim(p_order_number))
$$;
GRANT EXECUTE ON FUNCTION public.get_order(text) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

INSERT INTO public.menu_items (name, description, category, price, image_url, is_available) VALUES
('Crispy Chicken Wings','Six wings tossed in smoky honey-chilli glaze with ranch dip.','Starters',850,'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=800&q=80',true),
('Loaded Nachos','Tortilla chips, melted cheddar, jalapeños, salsa and sour cream.','Starters',750,'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=800&q=80',true),
('Vegetable Samosas','Four golden pastries stuffed with spiced potato and peas.','Starters',350,'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80',true),
('Garlic Bread','Toasted baguette with herb garlic butter and mozzarella.','Starters',450,'https://images.unsplash.com/photo-1573140401552-3fab0b24306f?w=800&q=80',true),
('Caesar Salad','Romaine, parmesan, croutons and our house Caesar dressing.','Starters',690,'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&q=80',true),
('Tomato Basil Soup','Slow-roasted tomatoes blended with basil and a swirl of cream.','Starters',490,'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=80',false),
('Chicken Biryani','Fragrant basmati layered with spiced chicken, saffron and fried onions.','Main Course',1150,'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80',true),
('Butter Chicken','Tender chicken in a velvety tomato-butter gravy, served with naan.','Main Course',1350,'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80',true),
('Grilled Ribeye Steak','300g ribeye with peppercorn sauce, mash and greens.','Main Course',3200,'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&q=80',true),
('Herb Roast Chicken','Half chicken roasted with rosemary, lemon and garlic potatoes.','Main Course',1650,'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800&q=80',true),
('Grilled Salmon','Atlantic salmon fillet, lemon butter, quinoa and asparagus.','Main Course',2900,'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80',false),
('Chicken Fried Rice','Wok-tossed rice with chicken, egg and fresh vegetables.','Main Course',950,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&q=80',true),
('Margherita Pizza','San Marzano tomato, fresh mozzarella and basil on a thin crust.','Pizza & Burgers',1200,'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80',true),
('Pepperoni Pizza','Loaded with spicy pepperoni and a three-cheese blend.','Pizza & Burgers',1450,'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80',true),
('BBQ Chicken Pizza','Smoky BBQ sauce, grilled chicken, red onion and coriander.','Pizza & Burgers',1500,'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',true),
('Classic Beef Burger','Juicy beef patty, cheddar, lettuce, tomato and house sauce.','Pizza & Burgers',1100,'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',true),
('Crispy Chicken Burger','Buttermilk fried chicken, slaw and spicy mayo.','Pizza & Burgers',990,'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',true),
('Double Smash Burger','Two smashed patties, caramelised onions and American cheese.','Pizza & Burgers',1390,'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=800&q=80',false),
('Penne Arrabbiata','Penne in a fiery garlic-tomato sauce with fresh parsley.','Pasta',950,'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&q=80',true),
('Fettuccine Alfredo','Silky parmesan cream sauce with grilled chicken.','Pasta',1250,'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=800&q=80',true),
('Spaghetti Bolognese','Slow-cooked beef ragù over spaghetti with parmesan.','Pasta',1150,'https://images.unsplash.com/photo-1622973536968-3ead9e780960?w=800&q=80',true),
('Chocolate Lava Cake','Warm molten chocolate cake with vanilla ice cream.','Desserts',650,'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80',true),
('New York Cheesecake','Creamy baked cheesecake with a berry compote.','Desserts',700,'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&q=80',true),
('Tiramisu','Espresso-soaked ladyfingers layered with mascarpone cream.','Desserts',750,'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&q=80',true),
('Gulab Jamun','Three warm milk dumplings in rose-cardamom syrup.','Desserts',400,'https://images.unsplash.com/photo-1666190092159-3171cf0fbb12?w=800&q=80',true),
('Ice Cream Sundae','Three scoops, hot fudge, nuts and a cherry on top.','Desserts',550,'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&q=80',false),
('Fresh Lemonade','Freshly squeezed lemons with mint and a hint of honey.','Drinks',300,'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=800&q=80',true),
('Mango Smoothie','Ripe mangoes blended with yoghurt and ice.','Drinks',450,'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=800&q=80',true),
('Iced Caramel Latte','Double espresso, milk and caramel over ice.','Drinks',550,'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80',true),
('Chocolate Milkshake','Thick shake made with chocolate ice cream and whipped cream.','Drinks',600,'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80',true),
('Masala Chai','Black tea brewed with milk, ginger and cardamom.','Drinks',250,'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=800&q=80',true),
('Mint Margarita','Refreshing blend of lemon, fresh mint and soda.','Drinks',350,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80',true);

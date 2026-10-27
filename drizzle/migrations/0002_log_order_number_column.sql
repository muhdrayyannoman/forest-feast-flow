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
    INSERT INTO public.inventory_logs (item_id, change, reason, order_number, note)
    SELECT inventory_item_id, -amount, 'Stock used', v_number, 'Auto-deducted for order ' || v_number
    FROM usage
  )
  UPDATE public.inventory_items inv
  SET quantity = GREATEST(0, inv.quantity - u.amount)
  FROM usage u
  WHERE inv.id = u.inventory_item_id;

  RETURN v_number;
END $function$;
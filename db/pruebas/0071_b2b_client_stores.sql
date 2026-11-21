CREATE TABLE public.b2b_client_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  recipient text,
  phone text,
  line1 text,
  city text,
  department text,
  country text NOT NULL DEFAULT 'CO',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_client_stores TO authenticated;
GRANT ALL ON public.b2b_client_stores TO service_role;
ALTER TABLE public.b2b_client_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage b2b stores" ON public.b2b_client_stores FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS b2b_store_id uuid REFERENCES public.b2b_client_stores(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_preventa_order_qty(_customer_id uuid, _variant_id uuid, _qty integer, _store_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order uuid; _item uuid; _price int; _name text; _label text; _loc uuid;
  prof RECORD; st RECORD; _email text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.is_b2b(_customer_id) THEN RAISE EXCEPTION 'cliente no es B2B'; END IF;
  _qty := GREATEST(0, COALESCE(_qty,0));
  IF _store_id IS NOT NULL THEN
    SELECT * INTO st FROM public.b2b_client_stores WHERE id = _store_id AND customer_id = _customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La tienda no pertenece a este cliente'; END IF;
  END IF;

  SELECT id INTO _order FROM public.orders
    WHERE customer_id = _customer_id AND source = 'assisted' AND status = 'draft'
      AND notes LIKE '[PREVENTA]%' AND b2b_store_id IS NOT DISTINCT FROM _store_id
    ORDER BY created_at DESC LIMIT 1;

  IF _order IS NULL THEN
    IF _qty = 0 THEN RETURN NULL; END IF;
    SELECT full_name, company_name, phone, document_id INTO prof FROM public.profiles WHERE id = _customer_id;
    IF _store_id IS NULL THEN
      INSERT INTO public.orders (customer_id, source, status, notes, contact_name, contact_phone)
      VALUES (_customer_id, 'assisted', 'draft', '[PREVENTA] Pedido de preventa B2B',
              COALESCE(prof.company_name, prof.full_name), prof.phone)
      RETURNING id INTO _order;
    ELSE
      SELECT email::text INTO _email FROM auth.users WHERE id = _customer_id;
      INSERT INTO public.orders (customer_id, source, status, notes, contact_name, contact_phone, contact_email, b2b_store_id, ship_to)
      VALUES (_customer_id, 'assisted', 'draft', '[PREVENTA] Pedido de preventa B2B · Tienda ' || st.name,
              COALESCE(prof.company_name, prof.full_name), COALESCE(st.phone, prof.phone), _email, _store_id,
              jsonb_build_object('store_name', st.name,
                'recipient', COALESCE(st.recipient, st.name), 'phone', COALESCE(st.phone, prof.phone),
                'email', _email, 'identification', prof.document_id, 'line1', st.line1,
                'city', st.city, 'department', st.department, 'country', st.country))
      RETURNING id INTO _order;
    END IF;
  END IF;

  SELECT oi.id INTO _item FROM public.order_items oi WHERE oi.order_id = _order AND oi.variant_id = _variant_id LIMIT 1;

  IF _qty = 0 THEN
    DELETE FROM public.preventa_allocations WHERE order_item_id = _item;
    DELETE FROM public.order_items WHERE id = _item;
  ELSIF _item IS NULL THEN
    SELECT public.b2b_variant_price_cop(v.id), p.name,
           NULLIF(concat_ws(' / ', v.color, v.size), '')
      INTO _price, _name, _label
      FROM public.product_variants v JOIN public.products p ON p.id = v.product_id WHERE v.id = _variant_id;
    INSERT INTO public.order_items (order_id, variant_id, qty, unit_price_cop, product_name, variant_label)
    VALUES (_order, _variant_id, _qty, COALESCE(_price,0), COALESCE(_name,'Referencia'), _label)
    RETURNING id INTO _item;
    SELECT id INTO _loc FROM public.locations WHERE allow_preventa = true ORDER BY priority DESC LIMIT 1;
    IF _loc IS NOT NULL THEN
      INSERT INTO public.preventa_allocations (order_id, order_item_id, location_id, variant_id, qty)
      VALUES (_order, _item, _loc, _variant_id, _qty);
    END IF;
  ELSE
    UPDATE public.order_items SET qty = _qty WHERE id = _item;
    UPDATE public.preventa_allocations SET qty = _qty, updated_at = now() WHERE order_item_id = _item;
  END IF;

  UPDATE public.orders o SET
    subtotal_cop = s.t, total_cop = s.t
    FROM (SELECT COALESCE(sum(qty * unit_price_cop),0)::int t FROM public.order_items WHERE order_id = _order) s
    WHERE o.id = _order;
  RETURN _order;
END; $function$;

DROP FUNCTION IF EXISTS public.set_preventa_order_qty(uuid, uuid, integer);
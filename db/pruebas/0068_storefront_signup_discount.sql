CREATE POLICY "Public signup popup settings" ON public.app_settings FOR SELECT TO anon,authenticated USING (key='signup_discount');
CREATE TABLE public.signup_discount_subscribers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE, promotion_id uuid NOT NULL REFERENCES public.promotions(id), consent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.signup_discount_subscribers TO authenticated;
GRANT ALL ON public.signup_discount_subscribers TO service_role;
ALTER TABLE public.signup_discount_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read signup subscribers" ON public.signup_discount_subscribers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.subscribe_signup_discount(_name text,_email text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE cfg jsonb; pct integer; pid uuid; coupon text;
BEGIN
 IF length(trim(_name)) NOT BETWEEN 2 AND 100 OR length(_email)>255 OR trim(_email) !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$' THEN RAISE EXCEPTION 'Escribe tu nombre y un correo válido'; END IF;
 SELECT value INTO cfg FROM public.app_settings WHERE key='signup_discount';
 IF NOT COALESCE((cfg->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'La inscripción no está disponible en este momento'; END IF;
 pct:=COALESCE((cfg->>'discountPct')::integer,10);
 IF pct NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'El descuento no es válido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lower(trim(_email)),0));
 SELECT p.code INTO coupon FROM public.signup_discount_subscribers s JOIN public.promotions p ON p.id=s.promotion_id WHERE s.email=lower(trim(_email));
 IF coupon IS NOT NULL THEN RETURN coupon; END IF;
 coupon:='BIENVENIDA-'||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.promotions(name,code,kind,value,channels) VALUES('Inscripción Zierra Leona',coupon,'percent',pct,ARRAY['ecom_nacional','ecom_intl']) RETURNING id INTO pid;
 INSERT INTO public.signup_discount_subscribers(name,email,promotion_id) VALUES(trim(_name),lower(trim(_email)),pid);
 RETURN coupon;
END; $fn$;
REVOKE ALL ON FUNCTION public.subscribe_signup_discount(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_signup_discount(text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.apply_order_usd_code(_order_id uuid,_code text) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE o public.orders%ROWTYPE; p public.promotions%ROWTYPE; sub numeric; disc numeric:=0; cop bigint; intl boolean;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF auth.role()<>'service_role' AND (auth.uid() IS NULL OR (o.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_staff(auth.uid()))) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF o.promotion_code IS NOT NULL THEN
  IF o.promotion_code=upper(trim(_code)) THEN RETURN o.discount_usd; END IF;
  RAISE EXCEPTION 'Ya se aplicó otro código';
 END IF;
 IF o.status<>'draft' OR o.source<>'ecom' OR COALESCE(o.points_redeemed,0)>0 THEN RAISE EXCEPTION 'Ese código no aplica en esta compra'; END IF;
 intl:=o.currency='USD';
 SELECT * INTO p FROM public.promotions WHERE upper(code)=upper(trim(_code));
 IF NOT FOUND OR NOT p.active OR NOT ((CASE WHEN intl THEN 'ecom_intl' ELSE 'ecom_nacional' END)=ANY(p.channels)) OR (p.starts_at IS NOT NULL AND p.starts_at>now()) OR (p.ends_at IS NOT NULL AND p.ends_at<=now()) OR o.subtotal_cop<COALESCE(p.min_subtotal_cop,0) THEN RAISE EXCEPTION 'Ese código no está vigente o no aplica en esta compra'; END IF;
 SELECT sum(unit_price_usd*qty) INTO sub FROM public.order_items WHERE order_id=o.id;
 IF intl AND COALESCE(sub,0)<=0 THEN RAISE EXCEPTION 'Faltan los precios en dólares'; END IF;
 IF p.kind='percent' AND p.value BETWEEN 1 AND 100 THEN
  cop:=LEAST(o.subtotal_cop,round(o.subtotal_cop*p.value::numeric/100)::bigint);
  IF intl THEN disc:=LEAST(sub,round(sub*p.value::numeric/100,2)); END IF;
 ELSIF intl AND p.kind='amount' AND p.amount_currency='USD' AND COALESCE(p.amount_usd,0)>0 THEN
  disc:=LEAST(p.amount_usd,sub); cop:=LEAST(o.subtotal_cop,round(o.subtotal_cop*disc/sub)::bigint);
 ELSE RAISE EXCEPTION 'Ese código no aplica en esta compra'; END IF;
 UPDATE public.orders SET promotion_code=upper(trim(_code)),discount_usd=disc,discount_cop=COALESCE(discount_cop,0)+cop,total_cop=GREATEST(total_cop-cop,shipping_cop),total_usd_exact=CASE WHEN intl THEN GREATEST(COALESCE(total_usd_exact,total_usd)-disc,0) ELSE total_usd_exact END WHERE id=o.id;
 RETURN disc;
END; $fn$;
REVOKE ALL ON FUNCTION public.apply_order_usd_code(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_order_usd_code(uuid,text) TO authenticated,service_role;
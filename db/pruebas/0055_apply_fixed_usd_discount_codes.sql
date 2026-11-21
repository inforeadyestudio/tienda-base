ALTER TABLE public.orders ADD COLUMN promotion_code text;
ALTER TABLE public.orders ADD COLUMN discount_usd numeric(12,2) NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.apply_order_usd_code(_order_id uuid, _code text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE o public.orders%ROWTYPE; p public.promotions%ROWTYPE; sub numeric; disc numeric; rate numeric; cop bigint;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF auth.role()<>'service_role' AND (auth.uid() IS NULL OR (o.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_staff(auth.uid()))) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF o.promotion_code IS NOT NULL THEN
  IF o.promotion_code=upper(trim(_code)) THEN RETURN o.discount_usd; END IF;
  RAISE EXCEPTION 'Ya se aplicó otro código';
 END IF;
 IF o.status<>'draft' OR o.currency<>'USD' OR o.source<>'ecom' OR COALESCE(o.points_redeemed,0)>0 THEN RAISE EXCEPTION 'Ese código no aplica en esta compra'; END IF;
 SELECT * INTO p FROM public.promotions WHERE upper(code)=upper(trim(_code));
 IF NOT FOUND OR NOT p.active OR p.kind<>'amount' OR p.amount_currency<>'USD' OR COALESCE(p.amount_usd,0)<=0 OR NOT ('ecom_intl'=ANY(p.channels)) OR (p.starts_at IS NOT NULL AND p.starts_at>now()) OR (p.ends_at IS NOT NULL AND p.ends_at<=now()) OR o.subtotal_cop<COALESCE(p.min_subtotal_cop,0) THEN RAISE EXCEPTION 'Ese código no está vigente o no aplica en esta compra'; END IF;
 SELECT sum(unit_price_usd*qty) INTO sub FROM public.order_items WHERE order_id=o.id;
 IF COALESCE(sub,0)<=0 THEN RAISE EXCEPTION 'Faltan los precios en dólares'; END IF;
 disc:=LEAST(p.amount_usd,sub);
 SELECT NULLIF((value->>'usdRate')::numeric,0) INTO rate FROM public.app_settings WHERE key='international_settings';
 rate:=COALESCE(rate,4000);
 cop:=LEAST(o.subtotal_cop,round(o.subtotal_cop*disc/sub)::bigint);
 UPDATE public.orders SET promotion_code=upper(trim(_code)),discount_usd=disc,discount_cop=COALESCE(discount_cop,0)+cop,total_cop=GREATEST(total_cop-cop,shipping_cop),total_usd_exact=GREATEST(COALESCE(total_usd_exact,total_usd)-disc,0) WHERE id=o.id;
 RETURN disc;
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_order_usd_code(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_order_usd_code(uuid,text) TO authenticated,service_role;
DO $patch$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.prepare_checkout_retry(uuid,jsonb,jsonb,jsonb,integer,text,text,numeric,text)'::regprocedure) INTO def;
 IF position('public.apply_order_usd_code' in def)=0 THEN
  def:=replace(def,'IF _points>0 THEN PERFORM public.apply_order_points(o.id,_points); END IF;','IF _snapshot->''draft''->>''promotionCode'' IS NOT NULL THEN PERFORM public.apply_order_usd_code(o.id,_snapshot->''draft''->>''promotionCode''); END IF; IF _points>0 THEN IF _snapshot->''draft''->>''promotionCode'' IS NOT NULL THEN RAISE EXCEPTION ''Usa puntos o código, no ambos''; END IF; PERFORM public.apply_order_points(o.id,_points); END IF;');
  IF position('public.apply_order_usd_code' in def)=0 THEN RAISE EXCEPTION 'No se encontró el punto seguro de aplicación'; END IF;
  EXECUTE def;
 END IF;
END;
$patch$;
CREATE TABLE public.points_code_exceptions (
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 code text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 claimed_order_id uuid REFERENCES public.orders(id),
 used_order_id uuid REFERENCES public.orders(id),
 PRIMARY KEY(customer_id,code)
);
GRANT SELECT ON public.points_code_exceptions TO authenticated;
GRANT ALL ON public.points_code_exceptions TO service_role;
ALTER TABLE public.points_code_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY points_code_exception_owner_read ON public.points_code_exceptions FOR SELECT TO authenticated USING(customer_id=auth.uid());
CREATE FUNCTION public.can_combine_points_code(_customer_id uuid,_code text,_order_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.points_code_exceptions e WHERE e.customer_id=_customer_id AND e.code=upper(trim(_code)) AND e.active AND e.used_order_id IS NULL AND (e.claimed_order_id IS NULL OR e.claimed_order_id=_order_id) AND (auth.role()='service_role' OR auth.uid()=_customer_id OR public.is_staff(auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.can_combine_points_code(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_combine_points_code(uuid,text,uuid) TO authenticated,service_role;
CREATE FUNCTION public.guard_points_code_exception() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.points_code_exceptions;
BEGIN
 IF NEW.promotion_code IS NOT NULL AND COALESCE(NEW.points_redeemed,0)>0 AND (TG_OP='INSERT' OR OLD.promotion_code IS DISTINCT FROM NEW.promotion_code OR COALESCE(OLD.points_redeemed,0)=0) THEN
  SELECT * INTO e FROM public.points_code_exceptions WHERE customer_id=NEW.customer_id AND code=upper(trim(NEW.promotion_code)) FOR UPDATE;
  IF NOT FOUND OR NOT e.active OR e.used_order_id IS NOT NULL OR (e.claimed_order_id IS NOT NULL AND e.claimed_order_id<>NEW.id) OR NEW.source<>'ecom' OR NEW.currency<>'USD' THEN RAISE EXCEPTION 'Usa puntos o código, no ambos'; END IF;
  UPDATE public.points_code_exceptions SET claimed_order_id=NEW.id WHERE customer_id=e.customer_id AND code=e.code;
 END IF;
 IF NEW.payment_status='paid' AND NEW.promotion_code IS NOT NULL AND COALESCE(NEW.points_redeemed,0)>0 THEN
  UPDATE public.points_code_exceptions SET used_order_id=NEW.id,active=false WHERE customer_id=NEW.customer_id AND code=upper(trim(NEW.promotion_code)) AND claimed_order_id=NEW.id AND used_order_id IS NULL;
 ELSIF NEW.status='cancelled' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
  UPDATE public.points_code_exceptions SET claimed_order_id=NULL WHERE claimed_order_id=NEW.id AND used_order_id IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_points_code_exception BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_points_code_exception();
DO $patch$
DECLARE def text; old_text text; new_text text;
BEGIN
 SELECT pg_get_functiondef('public.apply_order_points(uuid,integer)'::regprocedure) INTO def;
 old_text:='IF o.points_redeemed > 0 THEN RAISE EXCEPTION ''Ya se usaron puntos en este pedido''; END IF;';
 new_text:=old_text || ' IF o.promotion_code IS NOT NULL AND NOT public.can_combine_points_code(o.customer_id,o.promotion_code,o.id) THEN RAISE EXCEPTION ''Usa puntos o código, no ambos''; END IF;';
 IF position(old_text in def)=0 THEN RAISE EXCEPTION 'Missing points guard'; END IF;
 def:=replace(def,old_text,new_text);
 old_text:='IF _points > max_pts THEN';
 new_text:='IF o.promotion_code IS NOT NULL THEN max_pts:=LEAST(max_pts,floor(GREATEST(o.subtotal_cop-COALESCE(o.discount_cop,0),0)/pv)::int); SELECT NULLIF((value->>''usdRate'')::numeric,0) INTO rate FROM public.app_settings WHERE key=''international_settings''; rate:=COALESCE(rate,4000); max_pts:=LEAST(max_pts,floor(GREATEST(COALESCE(o.total_usd_exact,o.total_usd)-o.shipping_cop/rate,0)*rate/pv)::int); END IF; IF _points > max_pts THEN';
 IF position(old_text in def)=0 THEN RAISE EXCEPTION 'Missing points cap'; END IF;
 EXECUTE replace(def,old_text,new_text);
 SELECT pg_get_functiondef('public.prepare_checkout_retry(uuid,jsonb,jsonb,jsonb,integer,text,text,numeric,text)'::regprocedure) INTO def;
 old_text:='IF _snapshot->''draft''->>''promotionCode'' IS NOT NULL THEN RAISE EXCEPTION ''Usa puntos o código, no ambos''; END IF;';
 IF position(old_text in def)=0 THEN RAISE EXCEPTION 'Missing retry code guard'; END IF;
 EXECUTE replace(def,old_text,'');
END $patch$;
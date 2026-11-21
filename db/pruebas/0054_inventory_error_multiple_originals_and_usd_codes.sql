ALTER TABLE public.promotions ADD COLUMN amount_currency text NOT NULL DEFAULT 'COP';
ALTER TABLE public.promotions ADD COLUMN amount_usd numeric(12,2);
ALTER TABLE public.promotions ADD CONSTRAINT promotions_amount_currency_valid CHECK (amount_currency IN ('COP','USD'));
ALTER TABLE public.promotions ADD CONSTRAINT promotions_usd_amount_valid CHECK (amount_currency <> 'USD' OR (kind = 'amount' AND amount_usd > 0 AND channels = ARRAY['ecom_intl']::text[]));
CREATE OR REPLACE FUNCTION public.swap_order_items_inventory_error_many(_order_item_ids uuid[], _replacements jsonb, _request_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
 o public.orders%ROWTYPE; it public.order_items%ROWTYPE; r record;
 _ret uuid; _oid uuid; _anchor uuid; _count int; _left int; _take int; _actual int;
 _cop bigint := 0; _usd numeric := 0; _has_usd boolean := false;
 _originals jsonb := '[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Falta identificar el cambio'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,0));
 SELECT id INTO _ret FROM public.returns WHERE inventory_swap_request_id=_request_id;
 IF FOUND THEN RETURN _ret; END IF;
 IF COALESCE(cardinality(_order_item_ids),0)=0 OR array_position(_order_item_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Escoge las prendas que no había'; END IF;
 SELECT count(DISTINCT x) INTO _count FROM unnest(_order_item_ids) x;
 IF _count<>cardinality(_order_item_ids) THEN RAISE EXCEPTION 'Hay prendas originales repetidas'; END IF;
 _anchor:=_order_item_ids[1];
 SELECT order_id INTO _oid FROM public.order_items WHERE id=_anchor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Línea de pedido no encontrada'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_oid FOR UPDATE;
 IF o.status IN ('shipped','delivered','cancelled','refunded') THEN RAISE EXCEPTION 'El pedido ya fue despachado o cerrado; usa un cambio normal'; END IF;
 PERFORM 1 FROM public.order_items WHERE id=ANY(_order_item_ids) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO _count FROM public.order_items WHERE id=ANY(_order_item_ids) AND order_id=o.id;
 IF _count<>cardinality(_order_item_ids) THEN RAISE EXCEPTION 'Las prendas deben pertenecer al mismo pedido; vuelve a cargarlo'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_items WHERE id=ANY(_order_item_ids) AND COALESCE(shipped_qty,0)>0) THEN RAISE EXCEPTION 'Una prenda ya fue despachada; usa un cambio normal'; END IF;
 IF _replacements IS NULL OR jsonb_typeof(_replacements)<>'array' OR jsonb_array_length(_replacements)=0 THEN RAISE EXCEPTION 'Escoge las prendas nuevas'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_replacements) x JOIN public.order_items oi ON oi.variant_id=(x->>'variant_id')::uuid WHERE oi.id=ANY(_order_item_ids)) THEN RAISE EXCEPTION 'Elige prendas distintas a las que no había'; END IF;
 -- Lock original and replacement inventory together before releasing missing units.
 PERFORM 1 FROM public.inventory_levels il WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(_replacements) x WHERE (x->>'variant_id')::uuid=il.variant_id AND (x->>'location_id')::uuid=il.location_id)
 OR EXISTS(SELECT 1 FROM public.reservations rs JOIN public.order_items oi ON oi.order_id=rs.order_id AND oi.variant_id=rs.variant_id WHERE oi.id=ANY(_order_item_ids) AND rs.status='active' AND (rs.order_item_id=oi.id OR rs.order_item_id IS NULL) AND rs.variant_id=il.variant_id AND rs.location_id=il.location_id)
 ORDER BY il.variant_id,il.location_id FOR UPDATE;
 FOR it IN SELECT * FROM public.order_items WHERE id=ANY(_order_item_ids) ORDER BY id LOOP
  _cop:=_cop+it.unit_price_cop::bigint*it.qty;
  _usd:=_usd+round(COALESCE(it.unit_price_usd,0)*100)*it.qty;
  _has_usd:=_has_usd OR it.unit_price_usd IS NOT NULL;
  _originals:=_originals||jsonb_build_array(jsonb_build_object('order_item_id',it.id,'variant_id',it.variant_id,'name',it.product_name,'product_name',it.product_name,'variant_label',it.variant_label,'qty',it.qty,'unit_price_cop',it.unit_price_cop,'unit_price_usd',it.unit_price_usd));
  _left:=it.qty;
  FOR r IN SELECT * FROM public.reservations WHERE order_id=o.id AND variant_id=it.variant_id AND status='active' AND (order_item_id=it.id OR order_item_id IS NULL) ORDER BY (order_item_id IS NULL),created_at,id FOR UPDATE LOOP
   EXIT WHEN _left<=0;
   _take:=LEAST(_left,r.qty);
   SELECT LEAST(_take,GREATEST(0,COALESCE(on_hand,0))) INTO _actual FROM public.inventory_levels WHERE variant_id=r.variant_id AND location_id=r.location_id;
   IF _actual IS NULL THEN RAISE EXCEPTION 'Falta el inventario de la reserva original'; END IF;
   UPDATE public.inventory_levels SET reserved=GREATEST(0,reserved-_take),on_hand=on_hand-_actual,updated_at=now() WHERE variant_id=r.variant_id AND location_id=r.location_id;
   IF _take=r.qty THEN UPDATE public.reservations SET status='released' WHERE id=r.id;
   ELSE UPDATE public.reservations SET qty=qty-_take WHERE id=r.id; END IF;
   IF _actual>0 THEN INSERT INTO public.inventory_movements(variant_id,location_id,kind,qty,ref_type,ref_id,actor_id,note) VALUES(r.variant_id,r.location_id,'adjustment',-_actual,'order',o.id,auth.uid(),'Cambio por error de inventario: prenda inexistente retirada'); END IF;
   _left:=_left-_take;
  END LOOP;
 END LOOP;
 -- Reuse the established replacement allocator and stock consumer within this same transaction.
 UPDATE public.order_items SET qty=1,unit_price_cop=_cop::int,unit_price_usd=CASE WHEN _has_usd THEN _usd/100 ELSE NULL END WHERE id=_anchor;
 DELETE FROM public.order_items WHERE id=ANY(_order_item_ids) AND id<>_anchor AND order_id=o.id;
 SELECT public.swap_order_item_inventory_error_many(_anchor,_replacements,_request_id,_reason) INTO _ret;
 UPDATE public.returns SET items=_originals WHERE id=_ret;
 UPDATE public.orders SET subtotal_cop=o.subtotal_cop,total_cop=o.total_cop,total_usd_exact=o.total_usd_exact,total_usd=o.total_usd,updated_at=now() WHERE id=o.id;
 INSERT INTO public.audit_log(actor_id,action,entity,entity_id,diff) VALUES(auth.uid(),'inventory_error_swap_originals','orders',o.id,jsonb_build_object('originals',_originals,'return_id',_ret,'request_id',_request_id,'total_cop',_cop,'total_usd',_usd/100));
 RETURN _ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.swap_order_items_inventory_error_many(uuid[],jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.swap_order_items_inventory_error_many(uuid[],jsonb,uuid,text) TO authenticated;
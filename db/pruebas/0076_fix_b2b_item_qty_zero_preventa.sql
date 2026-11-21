CREATE OR REPLACE FUNCTION public.set_b2b_item_qty(_order_id uuid, _item_id uuid, _qty integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE _item public.order_items%ROWTYPE; _delta integer; _loc uuid; _available integer; _rule_max integer; _other_used integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _qty < 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=_order_id AND status IN ('draft','reserved','paid','preparing') FOR UPDATE) THEN
    RAISE EXCEPTION 'Pedido B2B no editable';
  END IF;
  SELECT * INTO _item FROM public.order_items WHERE id=_item_id AND order_id=_order_id FOR UPDATE;
  IF _item.id IS NULL THEN RAISE EXCEPTION 'Línea B2B no encontrada'; END IF;
  _delta := _qty - _item.qty;
  IF _delta = 0 THEN RETURN; END IF;

  IF _item.b2b_source IS NULL THEN
    -- Línea sin origen (pedido directo): no reserva stock ni cupo, solo cambia cantidad.
    IF EXISTS (SELECT 1 FROM public.reservations WHERE order_item_id=_item_id AND status='active')
       OR EXISTS (SELECT 1 FROM public.preventa_allocations WHERE order_item_id=_item_id) THEN
      RAISE EXCEPTION 'Línea B2B sin origen con reservas; asigna bodega o cupo';
    END IF;
  ELSIF _item.b2b_source = 'restock' THEN
    _loc := _item.fulfill_location_id;
    IF _loc IS NULL THEN RAISE EXCEPTION 'La talla no tiene bodega asignada'; END IF;
    IF _delta > 0 THEN
      SELECT COALESCE(on_hand,0)-COALESCE(reserved,0) INTO _available FROM public.inventory_levels
      WHERE variant_id=_item.variant_id AND location_id=_loc FOR UPDATE;
      IF COALESCE(_available,0) < _delta THEN RAISE EXCEPTION 'Solo hay % unidades más disponibles', GREATEST(COALESCE(_available,0),0); END IF;
    END IF;
    UPDATE public.inventory_levels SET reserved=GREATEST(0,reserved+_delta), updated_at=now()
    WHERE variant_id=_item.variant_id AND location_id=_loc;
    DELETE FROM public.reservations WHERE order_item_id=_item_id AND status='active' AND qty+_delta<=0;
    UPDATE public.reservations SET qty=qty+_delta
    WHERE order_item_id=_item_id AND status='active';
    INSERT INTO public.inventory_movements(variant_id,location_id,kind,qty,ref_type,ref_id,actor_id,note)
    VALUES (_item.variant_id,_loc,CASE WHEN _delta>0 THEN 'reservation' ELSE 'release' END::public.inventory_movement_kind,
      abs(_delta),'order',_order_id,auth.uid(),'Ajuste origen Restock B2B');
  ELSE
    SELECT location_id INTO _loc FROM public.preventa_allocations WHERE order_item_id=_item_id LIMIT 1 FOR UPDATE;
    IF _delta > 0 THEN
      SELECT max_qty INTO _rule_max FROM public.preventa_rules WHERE variant_id=_item.variant_id AND location_id=_loc AND active=true
        AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now());
      SELECT COALESCE(sum(qty),0)::integer INTO _other_used FROM public.preventa_allocations
      WHERE variant_id=_item.variant_id AND location_id=_loc AND status IN ('pending','covered') AND order_item_id IS DISTINCT FROM _item_id;
      IF _rule_max IS NULL OR _rule_max-_other_used < _qty THEN RAISE EXCEPTION 'Solo quedan % unidades de cupo', GREATEST(COALESCE(_rule_max,0)-_other_used,0); END IF;
    END IF;
    -- En 0 la asignación de cupo se elimina abajo; actualizarla a 0 violaría qty > 0.
    IF _qty > 0 THEN
      UPDATE public.preventa_allocations SET qty=_qty, updated_at=now() WHERE order_item_id=_item_id;
    END IF;
  END IF;

  IF _qty=0 THEN
    DELETE FROM public.reservations WHERE order_item_id=_item_id;
    DELETE FROM public.preventa_allocations WHERE order_item_id=_item_id;
    DELETE FROM public.order_items WHERE id=_item_id;
  ELSE
    UPDATE public.order_items SET qty=_qty WHERE id=_item_id;
  END IF;
  UPDATE public.orders o SET subtotal_cop=t.amount,total_cop=t.amount+COALESCE(o.shipping_cop,0)-COALESCE(o.discount_cop,0)
  FROM (SELECT COALESCE(sum(qty::bigint*unit_price_cop),0)::integer amount FROM public.order_items WHERE order_id=_order_id) t WHERE o.id=_order_id;
  PERFORM public.log_b2b_order_event(_order_id,'cantidad',jsonb_build_object('referencia',_item.product_name,'from',_item.qty,'to',_qty,'origen',COALESCE(_item.b2b_source,'directo')));
END;
$function$;
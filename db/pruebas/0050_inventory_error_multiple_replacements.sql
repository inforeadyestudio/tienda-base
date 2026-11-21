ALTER TABLE public.returns ADD COLUMN inventory_swap_request_id uuid;
CREATE UNIQUE INDEX returns_inventory_swap_request_idx ON public.returns(inventory_swap_request_id) WHERE inventory_swap_request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.swap_order_item_inventory_error_many(_order_item_id uuid, _replacements jsonb, _request_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
 it public.order_items%ROWTYPE; o public.orders%ROWTYPE; e jsonb; v record; r record; g record;
 _ret uuid; _oid uuid; _newid uuid; _avail int; _take int; _left int; _actual int;
 _cop bigint; _usd bigint; _weight numeric := 0; _cum numeric := 0; _endcop bigint; _endusd bigint;
 _prevcop bigint := 0; _prevusd bigint := 0; _i int := 0; _totalqty int := 0;
 _detail jsonb := '[]'::jsonb; _desired text := ''; _w numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Falta identificar el cambio'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,0));
 SELECT id INTO _ret FROM public.returns WHERE inventory_swap_request_id=_request_id;
 IF FOUND THEN RETURN _ret; END IF;
 IF _replacements IS NULL OR jsonb_typeof(_replacements) <> 'array' OR jsonb_array_length(_replacements)=0 THEN RAISE EXCEPTION 'Escoge las prendas nuevas'; END IF;
 SELECT order_id INTO _oid FROM public.order_items WHERE id=_order_item_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Línea de pedido no encontrada'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_oid FOR UPDATE;
 SELECT * INTO it FROM public.order_items WHERE id=_order_item_id AND order_id=o.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'La línea cambió; vuelve a cargar el pedido'; END IF;
 IF o.status IN ('shipped','delivered','cancelled','refunded') OR COALESCE(it.shipped_qty,0)>0 THEN RAISE EXCEPTION 'El pedido ya fue despachado o cerrado; usa un cambio normal'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_replacements) LOOP
  IF jsonb_typeof(e)<>'object' OR e->>'variant_id' IS NULL OR e->>'location_id' IS NULL OR COALESCE(e->>'qty','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Prenda, bodega o cantidad inválida'; END IF;
  _totalqty := _totalqty + (e->>'qty')::int;
  SELECT pv.*, p.name AS pname INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=(e->>'variant_id')::uuid AND pv.active IS DISTINCT FROM false AND p.status<>'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'Variante no disponible'; END IF;
  IF v.id=it.variant_id THEN RAISE EXCEPTION 'Elige prendas distintas a la que no había'; END IF;
  PERFORM 1 FROM public.locations WHERE id=(e->>'location_id')::uuid AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bodega no disponible'; END IF;
  _w := CASE WHEN o.currency='USD' THEN COALESCE(v.price_usd*100,v.price_cop,0) ELSE COALESCE(v.price_cop,0) END;
  _weight := _weight + GREATEST(_w,0)*(e->>'qty')::int;
 END LOOP;
 -- Lock all affected inventory rows in a stable order. Validate combined demand, not each selection separately.
 PERFORM 1 FROM public.inventory_levels il WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(_replacements) x WHERE (x->>'variant_id')::uuid=il.variant_id AND (x->>'location_id')::uuid=il.location_id)
 OR EXISTS(SELECT 1 FROM public.reservations rs WHERE rs.order_id=o.id AND rs.variant_id=it.variant_id AND rs.status='active' AND (rs.order_item_id=it.id OR rs.order_item_id IS NULL) AND rs.variant_id=il.variant_id AND rs.location_id=il.location_id)
 ORDER BY il.variant_id,il.location_id FOR UPDATE;
 FOR g IN SELECT (x->>'variant_id')::uuid vid,(x->>'location_id')::uuid lid,sum((x->>'qty')::int)::int qty FROM jsonb_array_elements(_replacements) x GROUP BY 1,2 LOOP
  SELECT COALESCE(on_hand,0)-COALESCE(reserved,0) INTO _avail FROM public.inventory_levels WHERE variant_id=g.vid AND location_id=g.lid;
  IF COALESCE(_avail,0)<g.qty THEN RAISE EXCEPTION 'No hay stock libre suficiente para todas las prendas en la bodega elegida'; END IF;
 END LOOP;
 -- Remove only this line's missing active units. Consumed stock is not returned or deducted again.
 _left := it.qty;
 FOR r IN SELECT * FROM public.reservations WHERE order_id=o.id AND variant_id=it.variant_id AND status='active' AND (order_item_id=it.id OR order_item_id IS NULL) ORDER BY (order_item_id IS NULL),created_at,id FOR UPDATE LOOP
  EXIT WHEN _left<=0;
  _take := LEAST(_left,r.qty);
  SELECT LEAST(_take,GREATEST(0,COALESCE(on_hand,0))) INTO _actual FROM public.inventory_levels WHERE variant_id=r.variant_id AND location_id=r.location_id;
  IF _actual IS NULL THEN RAISE EXCEPTION 'Falta el inventario de la reserva original'; END IF;
  UPDATE public.inventory_levels SET reserved=GREATEST(0,reserved-_take),on_hand=on_hand-_actual,updated_at=now() WHERE variant_id=r.variant_id AND location_id=r.location_id;
  IF _take=r.qty THEN UPDATE public.reservations SET status='released' WHERE id=r.id;
  ELSE UPDATE public.reservations SET qty=qty-_take WHERE id=r.id; END IF;
  IF _actual>0 THEN INSERT INTO public.inventory_movements(variant_id,location_id,kind,qty,ref_type,ref_id,actor_id,note) VALUES(r.variant_id,r.location_id,'adjustment',-_actual,'order',o.id,auth.uid(),'Cambio por error de inventario: prenda inexistente retirada'); END IF;
  _left := _left-_take;
 END LOOP;
 _cop := it.unit_price_cop::bigint*it.qty;
 _usd := round(COALESCE(it.unit_price_usd,0)*100)::bigint*it.qty;
 IF _weight<=0 THEN _weight:=_totalqty; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_replacements) LOOP
  SELECT pv.*,p.name AS pname INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=(e->>'variant_id')::uuid;
  _w := GREATEST(CASE WHEN o.currency='USD' THEN COALESCE(v.price_usd*100,v.price_cop,0) ELSE COALESCE(v.price_cop,0) END,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_replacements) x JOIN public.product_variants pv ON pv.id=(x->>'variant_id')::uuid WHERE CASE WHEN o.currency='USD' THEN COALESCE(pv.price_usd*100,pv.price_cop,0) ELSE COALESCE(pv.price_cop,0) END>0) THEN _w:=1; END IF;
  FOR _take IN 1..(e->>'qty')::int LOOP
   _i:=_i+1; _cum:=_cum+_w;
   _endcop := CASE WHEN _i=_totalqty THEN _cop ELSE floor(_cop*_cum/_weight)::bigint END;
   _endusd := CASE WHEN _i=_totalqty THEN _usd ELSE floor(_usd*_cum/_weight)::bigint END;
   IF _i=1 THEN
    _newid:=it.id;
    UPDATE public.order_items SET variant_id=v.id,qty=1,unit_price_cop=(_endcop-_prevcop)::int,unit_price_usd=CASE WHEN it.unit_price_usd IS NULL THEN NULL ELSE (_endusd-_prevusd)::numeric/100 END,product_name=v.pname,variant_label=NULLIF(concat_ws(' / ',v.color,v.size),''),fulfill_location_id=(e->>'location_id')::uuid,list_price_cop=v.price_cop,hs_code=v.tariff_code,picked_at=NULL,picked_by=NULL,b2b_source=CASE WHEN it.b2b_source IS NULL THEN NULL ELSE 'restock' END WHERE id=it.id;
   ELSE
    INSERT INTO public.order_items(order_id,variant_id,qty,unit_price_cop,unit_price_usd,product_name,variant_label,fulfill_location_id,list_price_cop,hs_code,b2b_source)
    VALUES(o.id,v.id,1,(_endcop-_prevcop)::int,CASE WHEN it.unit_price_usd IS NULL THEN NULL ELSE (_endusd-_prevusd)::numeric/100 END,v.pname,NULLIF(concat_ws(' / ',v.color,v.size),''),(e->>'location_id')::uuid,v.price_cop,v.tariff_code,CASE WHEN it.b2b_source IS NULL THEN NULL ELSE 'restock' END) RETURNING id INTO _newid;
   END IF;
   INSERT INTO public.reservations(variant_id,location_id,qty,status,order_id,order_item_id,expires_at,committed_at) VALUES(v.id,(e->>'location_id')::uuid,1,'consumed',o.id,_newid,now()+interval '365 days',now());
   UPDATE public.inventory_levels SET on_hand=on_hand-1,updated_at=now() WHERE variant_id=v.id AND location_id=(e->>'location_id')::uuid;
   INSERT INTO public.inventory_movements(variant_id,location_id,kind,qty,ref_type,ref_id,actor_id,note) VALUES(v.id,(e->>'location_id')::uuid,'sale',1,'order',o.id,auth.uid(),'Prenda de reemplazo por error de inventario');
   INSERT INTO public.order_fulfillments(order_id,location_id) VALUES(o.id,(e->>'location_id')::uuid) ON CONFLICT DO NOTHING;
   _detail:=_detail||jsonb_build_array(jsonb_build_object('order_item_id',_newid,'variant_id',v.id,'location_id',e->>'location_id','product_name',v.pname,'variant_label',v.size,'qty',1,'unit_price_cop',_endcop-_prevcop,'unit_price_usd',(_endusd-_prevusd)::numeric/100));
   _prevcop:=_endcop; _prevusd:=_endusd;
  END LOOP;
  _desired := concat_ws('; ',NULLIF(_desired,''),v.pname||' · '||COALESCE(v.size,'')||' × '||(e->>'qty'));
 END LOOP;
 -- Item triggers may recalculate B2B totals; preserve all originally agreed monetary totals.
 UPDATE public.orders SET subtotal_cop=o.subtotal_cop,total_cop=o.total_cop,total_usd_exact=o.total_usd_exact, total_usd=o.total_usd,updated_at=now() WHERE id=o.id;
 INSERT INTO public.returns(order_id,location_id,source,kind,status,reason,notes,created_by,resolved_by,resolved_at,items,desired,desired_qty,resolution,inventory_swap_request_id)
 VALUES(o.id,(_replacements->0->>'location_id')::uuid,o.source,'cambio','completado','Error de inventario',_reason,auth.uid(),auth.uid(),now(),jsonb_build_array(jsonb_build_object('order_item_id',it.id,'variant_id',it.variant_id,'name',it.product_name,'product_name',it.product_name,'variant_label',it.variant_label,'qty',it.qty,'unit_price_cop',it.unit_price_cop)),_desired,_totalqty,'error_inventario',_request_id) RETURNING id INTO _ret;
 INSERT INTO public.audit_log(actor_id,action,entity,entity_id,diff) VALUES(auth.uid(),'inventory_error_swap','orders',o.id,jsonb_build_object('from',it.product_name||' '||COALESCE(it.variant_label,''),'qty',it.qty,'to',_desired,'replacements',_detail,'reason',_reason,'request_id',_request_id,'total_cop',_cop,'total_usd',_usd::numeric/100));
 RETURN _ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.swap_order_item_inventory_error_many(uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.swap_order_item_inventory_error_many(uuid,jsonb,uuid,text) TO authenticated;
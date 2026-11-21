CREATE OR REPLACE FUNCTION public.prepare_bold_guest_checkout(_reference uuid,_draft jsonb,_order jsonb,_items jsonb,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; a public.payment_attempts; line jsonb; exp timestamptz; token uuid:=(_draft->>'holdToken')::uuid; curr text:=_draft->>'currency';
BEGIN
 IF curr NOT IN ('COP','USD') OR _amount<=0 OR jsonb_array_length(_items) NOT BETWEEN 1 AND 20 OR token IS NULL THEN RAISE EXCEPTION 'Compra inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(token::text,0));
 SELECT * INTO a FROM public.payment_attempts WHERE reference=_reference::text FOR UPDATE;
 IF a.id IS NOT NULL THEN
 IF a.provider<>'bold' OR a.currency<>curr OR a.amount<>_amount OR (a.draft-'preparedOrderId') IS DISTINCT FROM _draft THEN RAISE EXCEPTION 'El intento anterior tiene otros datos'; END IF;
 RETURN jsonb_build_object('reference',a.reference,'draft',a.draft);
 END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE hold_token=token) THEN RAISE EXCEPTION 'Retoma el intento anterior antes de cambiar la compra'; END IF;
 exp:=now()+interval '18 minutes';
 FOR line IN SELECT * FROM jsonb_array_elements(_items) LOOP
 IF (line->>'qty')::int NOT BETWEEN 1 AND 10 OR coalesce((SELECT sum(qty) FROM public.reservations WHERE hold_token=token AND order_id IS NULL AND status='active' AND expires_at>now() AND variant_id=(line->>'variant_id')::uuid),0)<>(line->>'qty')::int THEN RAISE EXCEPTION 'Tus prendas ya no están apartadas'; END IF;
 END LOOP;
 INSERT INTO public.orders(customer_id,hold_token,source,status,subtotal_cop,shipping_cop,total_cop,currency,total_usd_exact,buyer_country,ship_to,contact_email,contact_name,contact_phone,payment_status,payment_method,payment_reference,reserved_at,analytics_session_id)
 VALUES(NULL,token,'ecom','draft',(_order->>'subtotal_cop')::bigint,(_order->>'shipping_cop')::bigint,(_order->>'total_cop')::bigint,curr,(_order->>'total_usd')::numeric,_order->>'buyer_country',_order->'ship_to',_order->>'contact_email',_order->>'contact_name',_order->>'contact_phone','pending','bold',_reference::text,now(),(_draft->>'analyticsSessionId')::uuid) RETURNING * INTO o;
 FOR line IN SELECT * FROM jsonb_array_elements(_items) LOOP
 INSERT INTO public.order_items(order_id,variant_id,product_name,variant_label,qty,unit_price_cop,unit_price_usd) VALUES(o.id,(line->>'variant_id')::uuid,line->>'product_name',line->>'variant_label',(line->>'qty')::int,(line->>'unit_price_cop')::bigint,(line->>'unit_price_usd')::numeric);
 END LOOP;
 IF _draft->>'promotionCode' IS NOT NULL THEN PERFORM public.apply_order_usd_code(o.id,_draft->>'promotionCode'); END IF;
 IF abs(_amount-(CASE WHEN curr='COP' THEN (SELECT total_cop FROM public.orders WHERE id=o.id) ELSE (SELECT total_usd_exact FROM public.orders WHERE id=o.id) END))>0.01 THEN RAISE EXCEPTION 'El total no coincide con el pedido'; END IF;
 -- Codes apply only to drafts; reserve only after their server-validated total matches the payment.
 UPDATE public.orders SET status='reserved' WHERE id=o.id;
 UPDATE public.reservations SET order_id=o.id,expires_at=exp WHERE hold_token=token AND order_id IS NULL AND status='active';
 UPDATE public.order_items i SET fulfill_location_id=(SELECT location_id FROM public.reservations WHERE order_id=o.id AND variant_id=i.variant_id AND status='active' ORDER BY created_at LIMIT 1) WHERE i.order_id=o.id;
 INSERT INTO public.payment_attempts(reference,provider,currency,amount,status,draft) VALUES(_reference::text,'bold',curr,_amount,'pending',_draft||jsonb_build_object('preparedOrderId',o.id));
 RETURN jsonb_build_object('reference',_reference::text,'draft',_draft||jsonb_build_object('preparedOrderId',o.id));
END $$;
REVOKE ALL ON FUNCTION public.prepare_bold_guest_checkout(uuid,jsonb,jsonb,jsonb,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_bold_guest_checkout(uuid,jsonb,jsonb,jsonb,numeric) TO service_role;
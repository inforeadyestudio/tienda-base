
-- Cancelar un traslado: devuelve el inventario según el estado en que estaba.
CREATE OR REPLACE FUNCTION public.cancel_transfer(_transfer_id uuid, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t RECORD;
  ti RECORD;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer not found';
  END IF;
  IF t.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'order-linked transfers must be changed from the order';
  END IF;
  IF t.status NOT IN ('requested', 'approved', 'in_transit') THEN
    RAISE EXCEPTION 'cannot cancel in state %', t.status;
  END IF;

  IF t.status = 'approved' THEN
    -- Las unidades solo estaban apartadas en el origen: se liberan.
    FOR ti IN SELECT variant_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
      UPDATE public.inventory_levels
        SET reserved = GREATEST(0, reserved - ti.qty), updated_at = now()
        WHERE variant_id = ti.variant_id AND location_id = t.from_location_id;
      INSERT INTO public.inventory_movements (variant_id, location_id, kind, qty, ref_type, ref_id, actor_id)
      VALUES (ti.variant_id, t.from_location_id, 'release', ti.qty, 'transfer', _transfer_id, auth.uid());
    END LOOP;
  ELSIF t.status = 'in_transit' AND NOT COALESCE(t.handoff, false) THEN
    -- Las unidades ya salieron del origen: regresan al origen.
    FOR ti IN SELECT variant_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
      INSERT INTO public.inventory_levels (variant_id, location_id, on_hand, reserved, updated_at)
      VALUES (ti.variant_id, t.from_location_id, ti.qty, 0, now())
      ON CONFLICT (variant_id, location_id)
      DO UPDATE SET on_hand = public.inventory_levels.on_hand + EXCLUDED.on_hand, updated_at = now();
      INSERT INTO public.inventory_movements (variant_id, location_id, kind, qty, ref_type, ref_id, actor_id)
      VALUES (ti.variant_id, t.from_location_id, 'transfer_in', ti.qty, 'transfer', _transfer_id, auth.uid());
    END LOOP;
  END IF;

  UPDATE public.transfers
    SET status = 'cancelled', rejected_reason = COALESCE(_reason, rejected_reason)
    WHERE id = _transfer_id;
END;
$function$;

-- Editar las unidades de un traslado que aún no se ha despachado.
CREATE OR REPLACE FUNCTION public.edit_transfer_items(_transfer_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t RECORD;
  itm jsonb;
  ti RECORD;
  v uuid;
  q int;
  old_qty int;
  available int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer not found';
  END IF;
  IF t.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'order-linked transfers must be changed from the order';
  END IF;
  IF t.status NOT IN ('requested', 'approved') THEN
    RAISE EXCEPTION 'cannot edit in state %', t.status;
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array';
  END IF;

  -- Actualizar o agregar líneas (qty <= 0 significa quitar la línea).
  FOR itm IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v := (itm ->> 'variant_id')::uuid;
    q := COALESCE((itm ->> 'qty')::int, 0);
    SELECT qty INTO old_qty FROM public.transfer_items
      WHERE transfer_id = _transfer_id AND variant_id = v;
    old_qty := COALESCE(old_qty, 0);

    IF q > 0 AND q <> old_qty AND t.status = 'approved' THEN
      IF q > old_qty THEN
        SELECT (on_hand - reserved) INTO available
          FROM public.inventory_levels
          WHERE variant_id = v AND location_id = t.from_location_id
          FOR UPDATE;
        IF COALESCE(available, 0) < (q - old_qty) THEN
          RAISE EXCEPTION 'insufficient stock for variant % at origin', v;
        END IF;
        UPDATE public.inventory_levels
          SET reserved = reserved + (q - old_qty), updated_at = now()
          WHERE variant_id = v AND location_id = t.from_location_id;
        INSERT INTO public.inventory_movements (variant_id, location_id, kind, qty, ref_type, ref_id, actor_id)
        VALUES (v, t.from_location_id, 'reservation', q - old_qty, 'transfer', _transfer_id, auth.uid());
      ELSE
        UPDATE public.inventory_levels
          SET reserved = GREATEST(0, reserved - (old_qty - q)), updated_at = now()
          WHERE variant_id = v AND location_id = t.from_location_id;
        INSERT INTO public.inventory_movements (variant_id, location_id, kind, qty, ref_type, ref_id, actor_id)
        VALUES (v, t.from_location_id, 'release', old_qty - q, 'transfer', _transfer_id, auth.uid());
      END IF;
    END IF;

    IF q > 0 THEN
      IF old_qty = 0 THEN
        INSERT INTO public.transfer_items (transfer_id, variant_id, qty) VALUES (_transfer_id, v, q);
      ELSE
        UPDATE public.transfer_items SET qty = q WHERE transfer_id = _transfer_id AND variant_id = v;
      END IF;
    END IF;
  END LOOP;

  -- Quitar las líneas que ya no vienen en la lista (o vienen en 0).
  FOR ti IN
    SELECT ti2.variant_id, ti2.qty
    FROM public.transfer_items ti2
    WHERE ti2.transfer_id = _transfer_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_items) e
        WHERE (e ->> 'variant_id')::uuid = ti2.variant_id
          AND COALESCE((e ->> 'qty')::int, 0) > 0
      )
  LOOP
    IF t.status = 'approved' THEN
      UPDATE public.inventory_levels
        SET reserved = GREATEST(0, reserved - ti.qty), updated_at = now()
        WHERE variant_id = ti.variant_id AND location_id = t.from_location_id;
      INSERT INTO public.inventory_movements (variant_id, location_id, kind, qty, ref_type, ref_id, actor_id)
      VALUES (ti.variant_id, t.from_location_id, 'release', ti.qty, 'transfer', _transfer_id, auth.uid());
    END IF;
    DELETE FROM public.transfer_items
      WHERE transfer_id = _transfer_id AND variant_id = ti.variant_id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.transfer_items WHERE transfer_id = _transfer_id) THEN
    RAISE EXCEPTION 'transfer must keep at least one item';
  END IF;
END;
$function$;

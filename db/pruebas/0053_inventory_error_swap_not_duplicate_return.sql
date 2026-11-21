CREATE OR REPLACE FUNCTION public.prevent_duplicate_return()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Inventory-error swaps are internal corrections: they never block nor are blocked by customer returns.
  IF coalesce(NEW.resolution,'') = 'error_inventario' THEN
    RETURN NEW;
  END IF;
  IF NEW.order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.returns r WHERE r.order_id = NEW.order_id AND r.id <> NEW.id
      AND coalesce(r.status,'') <> 'rechazado'
      AND coalesce(r.resolution,'') <> 'error_inventario'
  ) THEN
    RAISE EXCEPTION 'Este pedido ya tiene una devolución registrada';
  END IF;
  RETURN NEW;
END $function$;
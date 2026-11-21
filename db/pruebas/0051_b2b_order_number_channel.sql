CREATE OR REPLACE FUNCTION public.assign_channel_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _prefix text; _n int; _loc text;
BEGIN
  IF NEW.source = 'pos' THEN
    SELECT lower(name) INTO _loc FROM public.locations WHERE id = NEW.sold_by_location_id;
    _prefix := CASE WHEN _loc LIKE '%bogot%' THEN 'LU-POS-BOG'
                    WHEN _loc LIKE '%cali%' THEN 'LU-POS-CALI'
                    ELSE 'LU-POS' END;
  ELSIF NEW.source = 'assisted' OR NEW.b2b_mode IN ('consignment', 'restock') THEN
    _prefix := 'B2B';
  ELSIF coalesce(NEW.is_manual, false) THEN
    _prefix := 'LU-MANUAL';
  ELSE
    _prefix := 'LU-WEB';
  END IF;
  INSERT INTO public.order_counters(channel, last_value) VALUES (_prefix, 1)
  ON CONFLICT (channel) DO UPDATE SET last_value = public.order_counters.last_value + 1
  RETURNING last_value INTO _n;
  NEW.number := _prefix || '-' || CASE WHEN _n < 10 THEN lpad(_n::text, 2, '0') ELSE _n::text END;
  RETURN NEW;
END $function$;
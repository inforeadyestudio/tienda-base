CREATE OR REPLACE FUNCTION public.can_skip_packing_verification()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.is_admin(auth.uid()), false)
    OR (auth.uid() = '45e2276a-f1e5-4667-9401-f10fc27b1283'::uuid
        AND public.has_role(auth.uid(), 'bodega'::public.app_role));
$$;
REVOKE ALL ON FUNCTION public.can_skip_packing_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_skip_packing_verification() TO authenticated;
COMMENT ON FUNCTION public.can_skip_packing_verification() IS 'Packing bypass restricted to administrators and the explicitly authorized warehouse chief; always validates the authenticated account and current role.';
CREATE OR REPLACE FUNCTION public.record_packing_verification(_order_id uuid, _scope text, _skipped boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _skipped AND NOT public.can_skip_packing_verification() THEN RAISE EXCEPTION 'No tienes permiso para generar sin verificar'; END IF;
  INSERT INTO public.packing_verifications(order_id, scope, skipped, verified_by, verified_at)
  VALUES (_order_id, _scope, _skipped, auth.uid(), now())
  ON CONFLICT (order_id, scope) DO UPDATE SET skipped = EXCLUDED.skipped, verified_by = EXCLUDED.verified_by, verified_at = now();
END $$;
REVOKE ALL ON FUNCTION public.record_packing_verification(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_packing_verification(uuid, text, boolean) TO authenticated;
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const featuredProductsQuery = () =>
  queryOptions({
    queryKey: ["storefront", "featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, hero_image_url, product_variants(price_cop)")
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

export const collectionsListQuery = () =>
  queryOptions({
    queryKey: ["storefront", "collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, title, subtitle, cover_url, board_shape")
        .eq("status", "published")
        .eq("is_page", false)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

/** Piezas para el marquee "Una pieza más" del sidebar de selección. */
export const quickAddProductsQuery = () =>
  queryOptions({
    queryKey: ["storefront", "quick-add"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name, hero_image_url, product_images(url, position), product_variants(id, size, color, color_hex, price_cop, price_usd, active, inventory_levels(on_hand, reserved, locations(kind, web_lending, web_safety_stock)))",
        )
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

export const productBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["storefront", "product", slug],
    // Revalida al entrar a la ficha si pasaron 15 s (stock/tallas frescos) sin pedirla dos veces.
    staleTime: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name, name_en, description, description_en, story, story_en, materials, care, hero_image_url, fit_spec, lookbook_enabled, lookbook_config, version_group, version_label, product_type, product_images(id,url,alt,position,color), product_videos(id,url,position), product_journey_blocks(id,position,kind,slot,title,subtitle,body,required,selectable,affects,media,config), product_variants(id, sku, size, color, color_hex, price_cop, price_usd, compare_at_cop, compare_at_usd, active, inventory_levels(location_id, on_hand, reserved, locations(name, kind, city, web_lending, web_safety_stock)))"
        )
        .eq("slug", slug)
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Otras versiones del mismo modelo (mismo `version_group`), publicadas y a la venta. */
export const productVersionsQuery = (group: string | null | undefined) =>
  queryOptions({
    queryKey: ["storefront", "versions", group ?? "none"],
    enabled: Boolean(group),
    staleTime: 60_000,
    queryFn: async () => {
      if (!group) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, version_label, product_type, product_variants(color, active)")
        .eq("version_group", group)
        .eq("status", "published")
        .or("available_national.eq.true,available_international.eq.true");
      // Las versiones son un extra: si fallan, la ficha se muestra sin selector.
      if (error) return [];
      return data ?? [];
    },
  });

export const relatedProductsQuery = (productId: string | undefined) =>
  queryOptions({
    queryKey: ["storefront", "related", productId ?? "none"],
    enabled: Boolean(productId),
    queryFn: async () => {
      if (!productId) return { kind: "related" as const, items: [] as any[] };
      const SEL = "id, slug, name, hero_image_url, status, product_type, available_national, available_international, product_variants(price_cop, price_usd, compare_at_cop, compare_at_usd)";
      const visible = (p: any) => p && p.id !== productId && p.status === "published" && (p.available_national || p.available_international);
      const uniq = (arr: any[]) => { const s = new Set<string>(); return arr.filter((p) => visible(p) && !s.has(p.id) && s.add(p.id)); };

      // 1) Piezas con las que se combina en los looks de la edición del producto.
      const { data: looks } = await supabase
        .from("product_looks")
        .select(`id, active, product_look_items(position, products:product_id(${SEL}))`)
        .eq("product_id", productId);
      const fromLooks = uniq(
        ((looks ?? []) as any[])
          .filter((l) => l.active !== false)
          .flatMap((l) => ((l.product_look_items ?? []) as any[]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((i) => i.products)),
      );
      if (fromLooks.length) return { kind: "cross_sell" as const, items: fromLooks };

      // 2) Sin looks: productos de su colección con un tipo de prenda opuesto.
      const group = (t: string | null | undefined): "top" | "bottom" | "full" | "acc" | null => {
        const s = (t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!s) return null;
        if (/(pantalon|jean|falda|short|bermuda)/.test(s)) return "bottom";
        if (/(vestido|enterizo|jumpsuit)/.test(s)) return "full";
        if (/(cinturon|bolso|accesorio|gorra|arete|collar|perfume|colonia)/.test(s)) return "acc";
        if (/(top|body|camis|blusa|t-shirt|corset|chaqueta|saco|blazer|superior)/.test(s)) return "top";
        return null;
      };
      const { data: me } = await supabase.from("products").select("product_type").eq("id", productId).maybeSingle();
      const mine = group(me?.product_type);
      const wanted: Record<string, string[]> = { top: ["bottom", "acc"], bottom: ["top", "acc"], full: ["acc", "top"], acc: ["top", "bottom", "full"] };
      const opposite = (p: any) => {
        const g = group(p.product_type);
        return mine ? g !== null && wanted[mine].includes(g) : g !== null;
      };
      const rank = (p: any) => { const g = group(p.product_type); return mine ? wanted[mine].indexOf(g as string) : 0; };
      const { data: cols } = await supabase.from("collection_products").select("collection_id").eq("product_id", productId);
      const colIds = (cols ?? []).map((c: any) => c.collection_id);
      let pool: any[] = [];
      if (colIds.length) {
        const { data: siblings } = await supabase
          .from("collection_products")
          .select(`products:product_id(${SEL})`)
          .in("collection_id", colIds);
        pool = uniq((siblings ?? []).map((r: any) => r.products)).filter(opposite);
      }
      if (pool.length < 4) {
        const { data: extra } = await supabase
          .from("products").select(SEL)
          .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
          .neq("id", productId).limit(60);
        pool = uniq([...pool, ...((extra ?? []) as any[]).filter(opposite).sort(() => Math.random() - 0.5)]);
      }
      pool.sort((a, b) => rank(a) - rank(b));
      return { kind: "related" as const, items: pool.slice(0, 4) };
    },
  });

export const productLooksQuery = (productId: string | undefined) =>
  queryOptions({
    queryKey: ["storefront", "looks", productId ?? "none"],
    enabled: Boolean(productId),
    queryFn: async () => {
      if (!productId) return [] as any[];
      const { data, error } = await supabase
        .from("product_looks")
        .select(
           "id, title, image_url, position, discount_pct, special_price_cop, starts_at, ends_at, colors, active, board, product_look_items(id, position, combo_image_url, cutout_url, slot, transform, generic_label, generic_type, products:product_id(id, slug, name, hero_image_url, status, available_national, available_international, product_variants(id, sku, size, color, color_hex, price_cop, active, inventory_levels(on_hand, reserved, locations(kind, web_lending, web_safety_stock))))), product_look_matches(id, label, position, product_look_match_items(item_id))"
        )
        .eq("product_id", productId)
        .eq("active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter((l: any) => {
        const startsOk = !l.starts_at || new Date(l.starts_at).getTime() <= now;
        const endsOk = !l.ends_at || new Date(l.ends_at).getTime() >= now;
        return startsOk && endsOk;
      }).map((l: any) => ({
        ...l,
        product_look_items: (l.product_look_items ?? []).filter((item: any) =>
          !item.products || (item.products.status === "published" && (item.products.available_national || item.products.available_international))),
      }));
    },
  });

/** Productos ya comprados por la clienta (pedidos pagados / entregados). */
export const myClosetQuery = () =>
  queryOptions({
    queryKey: ["storefront", "closet"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return [] as string[];
      const { data, error } = await supabase
        .from("order_items")
        .select("product_variants(product_id), orders!inner(status, customer_id)")
        .in("orders.status", ["paid", "preparing", "shipped", "delivered"])
        .eq("orders.customer_id", session.session.user.id);
      if (error) return [] as string[];
      return Array.from(
        new Set(((data ?? []) as any[]).map((r) => r.product_variants?.product_id).filter(Boolean)),
      ) as string[];
    },
  });

export const collectionBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["storefront", "collection", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select(
          "id, slug, title, subtitle, cover_url, collection_blocks(id,position,kind,data), collection_products(position, products(id, slug, name, hero_image_url, product_variants(id, size, active, price_cop, price_usd, compare_at_cop, compare_at_usd)))"
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Historial de tallas compradas por la clienta (para "Encuentra tu talla"). */
export const myFitHistoryQuery = () =>
  queryOptions({
    queryKey: ["storefront", "fit-history"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return [] as { name: string; size: string | null }[];
      const { data, error } = await supabase
        .from("order_items")
        .select("created_at, product_variants(size, products(name)), orders!inner(status, customer_id, created_at)")
        .in("orders.status", ["paid", "preparing", "shipped", "delivered"])
        .eq("orders.customer_id", session.session.user.id)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) return [] as { name: string; size: string | null }[];
      return ((data ?? []) as any[])
        .map((r) => ({ name: r.product_variants?.products?.name ?? "Pieza Tu Marca", size: r.product_variants?.size ?? null }))
        .filter((r) => r.size);
    },
  });

/** Perfil de medidas guardado de la clienta. */
export const myFitProfileQuery = () =>
  queryOptions({
    queryKey: ["storefront", "fit-profile"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return null;
      const { data } = await (supabase as any)
        .from("fit_profiles")
        .select("height_cm, weight_kg, bust_cm, waist_cm, hip_cm, fit_preference, usual_size, usual_brand")
        .eq("user_id", session.session.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

/** Piezas publicadas del catálogo con su PNG de look (para combinar en el modal de looks). */
export const shopPiecesQuery = () =>
  queryOptions({
    queryKey: ["storefront", "shop-pieces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name, product_type, hero_image_url, product_looks(board), product_variants(id, size, color, price_cop, active, inventory_levels(on_hand, reserved, locations(kind, web_lending, web_safety_stock)))",
        )
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

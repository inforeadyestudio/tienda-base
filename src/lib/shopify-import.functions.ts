import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const variantSchema = z.object({
  sku: z.string().min(1).max(160),
  size: z.string().max(80).nullable(),
  color: z.string().max(100).nullable(),
  priceCop: z.number().nonnegative(),
  compareAtCop: z.number().nonnegative().nullable(),
  costCop: z.number().nonnegative().nullable(),
  barcode: z.string().max(160).nullable(),
  weightGrams: z.number().nonnegative().nullable(),
  active: z.boolean(),
});

const productSchema = z.object({
  handle: z.string().min(1).max(240).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(300),
  description: z.string().max(100_000).nullable(),
  productType: z.string().max(160).nullable(),
  tags: z.array(z.string().max(160)).max(100),
  status: z.enum(["draft", "published", "archived"]),
  availableNational: z.boolean(),
  images: z.array(z.object({ url: z.string().url().max(2_000), alt: z.string().max(500).nullable(), position: z.number().int().nonnegative() })).max(100),
  variants: z.array(variantSchema).min(1).max(300),
});

const importSchema = z.object({ products: z.array(productSchema).min(1).max(20) });

export type ShopifyImportProduct = z.infer<typeof productSchema>;

export type ShopifyImportResult = {
  created: number;
  updated: number;
  variantsCreated: number;
  variantsUpdated: number;
  imagesCreated: number;
  skipped: string[];
};

export const importShopifyProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data, context }): Promise<ShopifyImportResult> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (roleError || !isAdmin) throw new Error("Solo administradores pueden importar productos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ShopifyImportResult = {
      created: 0,
      updated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      imagesCreated: 0,
      skipped: [],
    };

    for (const product of data.products) {
      const { data: slugMatch, error: slugError } = await supabaseAdmin
        .from("products")
        .select("id, slug, name")
        .eq("slug", product.handle)
        .maybeSingle();
      if (slugError) throw slugError;

      let existing = slugMatch;
      if (!existing) {
        const { data: nameMatches, error: nameError } = await supabaseAdmin
          .from("products")
          .select("id, slug, name")
          .ilike("name", product.title)
          .limit(2);
        if (nameError) throw nameError;
        if (nameMatches?.length === 1) existing = nameMatches[0];
      }

      const productPatch = {
        slug: product.handle,
        name: product.title,
        description: product.description,
        product_type: product.productType,
        tags: product.tags,
        status: product.status,
        available_national: product.availableNational,
        hero_image_url: product.images[0]?.url ?? null,
      };

      let productId: string;
      if (existing) {
        const { error } = await supabaseAdmin.from("products").update(productPatch).eq("id", existing.id);
        if (error) {
          result.skipped.push(`${product.handle}: ${error.message}`);
          continue;
        }
        productId = existing.id;
        result.updated += 1;
      } else {
        const { data: inserted, error } = await supabaseAdmin
          .from("products")
          .insert(productPatch)
          .select("id")
          .single();
        if (error || !inserted) {
          result.skipped.push(`${product.handle}: ${error?.message ?? "no se pudo crear"}`);
          continue;
        }
        productId = inserted.id;
        result.created += 1;
      }

      const skus = product.variants.map((variant) => variant.sku);
      const { data: existingVariants, error: variantsError } = await supabaseAdmin
        .from("product_variants")
        .select("id, sku, product_id, price_cop, compare_at_cop")
        .in("sku", skus);
      if (variantsError) throw variantsError;
      const variantsBySku = new Map((existingVariants ?? []).map((variant) => [variant.sku, variant]));

      for (const variant of product.variants) {
        const found = variantsBySku.get(variant.sku);
        if (found && found.product_id !== productId) {
          result.skipped.push(`${product.handle}: el SKU ${variant.sku} ya pertenece a otro producto`);
          continue;
        }
        const keepManualPrice = !!found && Number(found.price_cop ?? 0) > 0;
        const price = keepManualPrice ? Number(found!.price_cop) : Math.round(variant.priceCop);
        const importedCompare = variant.compareAtCop == null ? null : Math.round(variant.compareAtCop);
        const compare = keepManualPrice
          ? (found!.compare_at_cop ?? null)
          : importedCompare != null && importedCompare > price ? importedCompare : null;
        const variantPatch = {
          product_id: productId,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          price_cop: price,
          compare_at_cop: compare,
          cost_cop: variant.costCop == null ? null : Math.round(variant.costCop),
          barcode: variant.barcode,
          weight_grams: variant.weightGrams,
          active: variant.active,
        };
        if (found) {
          const { error } = await supabaseAdmin.from("product_variants").update(variantPatch).eq("id", found.id);
          if (error) result.skipped.push(`${product.handle}/${variant.sku}: ${error.message}`);
          else result.variantsUpdated += 1;
        } else {
          const { error } = await supabaseAdmin.from("product_variants").insert(variantPatch);
          if (error) result.skipped.push(`${product.handle}/${variant.sku}: ${error.message}`);
          else result.variantsCreated += 1;
        }
      }

      if (product.images.length) {
        const { data: existingImages, error: imagesError } = await supabaseAdmin
          .from("product_images")
          .select("url")
          .eq("product_id", productId);
        if (imagesError) throw imagesError;
        const known = new Set((existingImages ?? []).map((image) => image.url));
        const missing = product.images
          .filter((image) => !known.has(image.url))
          .map((image) => ({ product_id: productId, url: image.url, alt: image.alt, position: image.position }));
        if (missing.length) {
          const { error } = await supabaseAdmin.from("product_images").insert(missing);
          if (error) result.skipped.push(`${product.handle}/imágenes: ${error.message}`);
          else result.imagesCreated += missing.length;
        }
      }
    }

    return result;
  });
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { promotionDiscount } from './promotions';

export const previewUsdCode = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ code:z.string().trim().min(1).max(80), currency:z.enum(['COP','USD']), items:z.array(z.object({variantId:z.string().uuid(),qty:z.number().int().min(1).max(10)})).min(1).max(20) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const [{data:promo,error},{data:variants,error:ve}] = await Promise.all([
      supabaseAdmin.from('promotions').select('kind,value,amount_currency,amount_usd,active,channels,starts_at,ends_at,min_subtotal_cop').eq('code',data.code.toUpperCase()).maybeSingle(),
      supabaseAdmin.from('product_variants').select('id,price_cop,price_usd').in('id',data.items.map(i=>i.variantId)),
    ]);
    if(error || ve) throw new Error('No pudimos validar el código. Intenta de nuevo.');
    if(!promo || variants?.length !== new Set(data.items.map(i=>i.variantId)).size) throw new Error('Ese código no aplica en esta compra.');
    const cop=data.items.reduce((s,i)=>s+Number(variants.find(v=>v.id===i.variantId)?.price_cop)*i.qty,0);
    const usd=data.items.reduce((s,i)=>s+Number(variants.find(v=>v.id===i.variantId)?.price_usd)*i.qty,0);
    return { code:data.code.toUpperCase(),...promotionDiscount(promo,data.currency,cop,usd),subtotalUsd:usd,subtotalCop:cop };
  });
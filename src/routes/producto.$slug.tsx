import { createFileRoute } from "@tanstack/react-router";
import { productBySlugQuery } from "@/lib/queries";
import { useProductPage } from "@/logic/product/use-product-page";
import { ProductPageView } from "@/design/product/product-page-view";
import { seoHead, SEO_DEFAULT_DESCRIPTION, seoProductScript, seoTypeLine } from "@/lib/seo";

export const Route = createFileRoute("/producto/$slug")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productBySlugQuery(params.slug)),
  head: ({ params, loaderData }) => {
    const p = loaderData as any;
    if (!p) return seoHead({ title: "Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: `/producto/${params.slug}` });
    const base = seoHead({
      title: `${p.name} | Tu Marca`,
      description: `${p.description ? `${p.description} ` : ""}${seoTypeLine(p.product_type)} Envíos a toda Colombia.`,
      path: `/producto/${params.slug}`,
      image: p.hero_image_url,
      type: "product",
    });
    return { ...base, scripts: [seoProductScript({ ...p, slug: params.slug })] };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  return <ProductContent key={slug} slug={slug} />;
}

function ProductContent({ slug }: { slug: string }) {
  const vm = useProductPage(slug);
  return <ProductPageView vm={vm} />;
}

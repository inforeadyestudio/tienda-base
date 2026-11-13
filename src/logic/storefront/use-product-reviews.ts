// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { productReviewsQuery, communityMediaQuery } from "@/lib/community-queries";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { approvedReviewMedia } from "@/lib/review-media.functions";

export type Media = {
  id: string;
  kind: string;
  media_url: string;
  poster_url: string | null;
  author_name: string | null;
  city: string | null;
  caption: string | null;
};

export function useProductReviews({ productId, className = "" }: { productId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const { data: reviews = [] } = useQuery(productReviewsQuery(productId));

  const { data: submittedMedia = [] } = useQuery({
    queryKey: ["product-review-uploads-strip", productId, reviews.map((review: any) => review.id).join(",")],
    enabled: reviews.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const uploads = await approvedReviewMedia({ data: { productId } });
      return uploads.flatMap((upload, index) => {
        const review = reviews.find((row: any) => row.id === upload.reviewId);
        return review ? [{
          id: `review-${review.id}-${index}`,
          kind: upload.kind,
          media_url: upload.url,
          poster_url: null,
          author_name: review.author_name,
          city: review.city,
          caption: review.body,
        }] : [];
      }) as Media[];
    },
  });

  const { data: media = [] } = useQuery(communityMediaQuery(productId)) as { data: Media[] };

  const average = reviews.length
    ? reviews.reduce((sum, r: any) => sum + (r.rating ?? 0), 0) / reviews.length
    : 4;
  const shown = Math.round(average * 10) / 10;
  const allMedia = [...media, ...submittedMedia];
  const current = allMedia[index];
  const hasContent = reviews.length > 0 || allMedia.length > 0;

  const step = (delta: number) => {
    if (!allMedia.length) return;
    setIndex((i) => (i + delta + allMedia.length) % allMedia.length);
  };


  return { productId, className, open, setOpen, index, setIndex, reviews, submittedMedia, media, average, shown, allMedia, current, hasContent, step };
}

export type ProductReviewsVM = ReturnType<typeof useProductReviews>;

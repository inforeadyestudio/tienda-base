import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "./index";
import { seoHead, SEO_DEFAULT_TITLE, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

export const Route = createFileRoute("/home")({
  head: () => seoHead({ title: SEO_DEFAULT_TITLE, description: SEO_DEFAULT_DESCRIPTION, path: "/" }),
  component: HomePage,
});
import { createFileRoute, redirect } from "@tanstack/react-router";

// Tu Marca no tiene tiendas físicas: la antigua página "Our Stores" lleva a la tienda online.
export const Route = createFileRoute("/our-stores")({
  beforeLoad: () => {
    throw redirect({ to: "/tienda", statusCode: 301 });
  },
});

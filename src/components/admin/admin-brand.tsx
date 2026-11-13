import { AdminBrandView, type AdminBrandViewProps } from "@/design/admin/admin-brand-view";

/** Logo del panel (logo → isotipo al plegar el menú), diseñado en src/design. */
export function AdminBrand(props: AdminBrandViewProps) {
  return <AdminBrandView {...props} />;
}

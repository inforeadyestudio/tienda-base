import { useCartDrawer } from "@/logic/storefront/use-cart-drawer";
import { CartDrawerView } from "@/design/storefront/cart-drawer-view";
export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const vm = useCartDrawer({ open, onOpenChange });
  return <CartDrawerView vm={vm} />;
}

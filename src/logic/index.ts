// Capa de lógica (contratos). Claude NO modifica esta carpeta.
// El diseño importa desde aquí los datos y acciones ya listos;
// precios, stock, pagos y puntos se calculan aquí, nunca en el diseño.
export { formatCOP, formatUSD, formatDate } from "@/lib/format";
export { useCart, addToCart, setCartQty, removeFromCart, type CartItem } from "@/lib/cart";
export { useProductPage, sizeAvailability, computeAvailability, type ProductPageVM } from "./product/use-product-page";
export { useShopPage, type ShopPageVM } from "./shop/use-shop-page";
export { useAccountHome, type AccountHomeVM } from "./account/use-account-home";
export { useOrdersPage, type OrdersPageVM } from "./account/use-orders-page";
export { useProfilePage, type ProfilePageVM } from "./account/use-profile-page";

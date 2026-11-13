import { expect, it } from "vitest";
import { orderCustomerDetails } from "./order-customer-details";

it("muestra identificación antigua y conserva la dirección del pedido", () => {
 const result = orderCustomerDetails({identification:"12345678",line1:"Dirección del pedido"},[{purpose:"shipping",line1:"Nueva dirección",city:"Cali"}],"99999");
 expect(result.document).toBe("12345678");
 expect(result.shipping.line1).toBe("Dirección del pedido");
 expect(result.shipping.city).toBe("Cali");
});
it("recupera identificación del perfil si falta en el pedido", () => {
 expect(orderCustomerDetails({},[],"987654321").document).toBe("987654321");
});
it("no confunde dirección de facturación con despacho", () => {
 expect(orderCustomerDetails({},[{purpose:"billing",line1:"Solo facturación"}]).shipping.line1).toBe("");
});
it("identificación del pedido tiene prioridad sobre perfil y facturación", () => {
 expect(orderCustomerDetails({document_id:"PP12345",billing:{document_id:"77777"}},[],"88888").document).toBe("PP12345");
});
/** JSON body accepted by POST /orders. */
export interface CreateOrderRequest {
  orderId: string;
  customerEmail: string;
}

/** Successful POST /orders response. */
export interface CreateOrderResponse {
  orderId: string;
  status: "accepted";
}

export function isCreateOrderRequest(
  value: unknown,
): value is CreateOrderRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    typeof request.orderId === "string" &&
    request.orderId.length > 0 &&
    typeof request.customerEmail === "string" &&
    request.customerEmail.includes("@")
  );
}

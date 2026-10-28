export const ORDER_ACCEPTED_EVENT_TYPE = "order.accepted" as const;

/** The event contract shared by the orders API and notification worker. */
export interface OrderAcceptedEvent {
  eventId: string;
  type: typeof ORDER_ACCEPTED_EVENT_TYPE;
  schemaVersion: 1;
  occurredAt: string;
  orderId: string;
  customerEmail: string;
}

export function isOrderAcceptedEvent(
  value: unknown,
): value is OrderAcceptedEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.eventId === "string" &&
    event.type === ORDER_ACCEPTED_EVENT_TYPE &&
    event.schemaVersion === 1 &&
    typeof event.occurredAt === "string" &&
    typeof event.orderId === "string" &&
    typeof event.customerEmail === "string"
  );
}

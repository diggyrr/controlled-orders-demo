import type { OrderAcceptedEvent } from "./event-schema.js";

declare const queueReceiptBrand: unique symbol;

/** Opaque capability returned only by a queue delivery. */
export type QueueReceipt = string & {
  readonly [queueReceiptBrand]: "QueueReceipt";
};

export interface QueuedOrderEvent {
  receipt: QueueReceipt;
  event: OrderAcceptedEvent;
}

/**
 * Delivery contract between the two runtime services.
 *
 * A received event remains in flight until acknowledged. Releasing it makes it
 * available for a later delivery. An empty queue returns undefined immediately.
 */
export interface OrderEventQueue {
  publish(event: OrderAcceptedEvent): Promise<void>;
  receive(): Promise<QueuedOrderEvent | undefined>;
  acknowledge(receipt: QueueReceipt): Promise<void>;
  release(receipt: QueueReceipt): Promise<void>;
}

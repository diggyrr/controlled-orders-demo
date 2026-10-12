import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import type { Notification } from "../src/notification-worker/contracts.js";
import { NotificationWorker } from "../src/notification-worker/notification-worker.js";
import { OrdersApi } from "../src/orders-api/orders-api.js";
import { FileOrderEventQueue } from "../src/shared/file-order-event-queue.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

test("accepted orders produce an email notification", async () => {
  const queueDirectory = await mkdtemp(join(tmpdir(), "orders-demo-test-"));
  const queue = new FileOrderEventQueue(queueDirectory);
  const notifications: Notification[] = [];
  const worker = new NotificationWorker(
    queue,
    {
      record: async (notification) => {
        notifications.push(notification);
      },
    },
    { pollIntervalMs: 5 },
  );
  const api = new OrdersApi(queue, { host: "127.0.0.1", port: 0 });

  cleanups.push(async () => {
    await api.stop();
    await worker.stop();
    await rm(queueDirectory, { recursive: true, force: true });
  });

  worker.start();
  const address = await api.start();
  const response = await fetch(`${address}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: "order-123",
      customerEmail: "buyer@example.test",
      priority: "normal",
    }),
  });
  const body: unknown = await response.json();

  await waitFor(() => notifications.length === 1);

  assert.deepEqual(
    { status: response.status, body, notifications },
    {
      status: 202,
      body: { orderId: "order-123", status: "accepted" },
      notifications: [
        {
          orderId: "order-123",
          channel: "email",
          recipient: "buyer@example.test",
          message: "Order order-123 was accepted",
        },
      ],
    },
  );
});

test("orders require a JSON request", async () => {
  const queueDirectory = await mkdtemp(join(tmpdir(), "orders-demo-test-"));
  const queue = new FileOrderEventQueue(queueDirectory);
  const api = new OrdersApi(queue, { host: "127.0.0.1", port: 0 });

  cleanups.push(async () => {
    await api.stop();
    await rm(queueDirectory, { recursive: true, force: true });
  });

  const address = await api.start();
  const response = await fetch(`${address}/orders`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({
      orderId: "order-123",
      customerEmail: "buyer@example.test",
      priority: "normal",
    }),
  });

  assert.deepEqual(
    { status: response.status, body: await response.json() },
    { status: 415, body: { error: "unsupported_media_type" } },
  );
});

test("urgent orders are delivered before normal orders", async () => {
  const queueDirectory = await mkdtemp(join(tmpdir(), "orders-demo-test-"));
  const queue = new FileOrderEventQueue(queueDirectory);

  cleanups.push(async () => {
    await rm(queueDirectory, { recursive: true, force: true });
  });

  await queue.publish({
    eventId: "normal-event",
    type: "order.accepted",
    schemaVersion: 1,
    occurredAt: "2026-10-10T12:00:00.000Z",
    orderId: "normal-order",
    customerEmail: "normal@example.test",
    priority: "normal",
  });
  await queue.publish({
    eventId: "urgent-event",
    type: "order.accepted",
    schemaVersion: 1,
    occurredAt: "2026-10-10T12:00:01.000Z",
    orderId: "urgent-order",
    customerEmail: "urgent@example.test",
    priority: "urgent",
  });

  const first = await queue.receive();
  assert.equal(first?.event.orderId, "urgent-order");
  await queue.acknowledge(first!.receipt);

  const second = await queue.receive();
  assert.equal(second?.event.orderId, "normal-order");
  await queue.acknowledge(second!.receipt);
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the notification worker");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

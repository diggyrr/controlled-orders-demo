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
    }),
  });

  assert.deepEqual(
    { status: response.status, body: await response.json() },
    { status: 415, body: { error: "unsupported_media_type" } },
  );
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

import { ConsoleNotificationSink } from "./console-notification-sink.js";
import { NotificationWorker } from "./notification-worker.js";
import { loadNotificationWorkerConfig } from "../shared/config.js";
import { FileOrderEventQueue } from "../shared/file-order-event-queue.js";

const config = loadNotificationWorkerConfig();
const queue = new FileOrderEventQueue(config.queueDirectory);
const worker = new NotificationWorker(queue, new ConsoleNotificationSink(), {
  pollIntervalMs: config.pollIntervalMs,
});

worker.start();
console.log(
  JSON.stringify({ service: "notification-worker", status: "started" }),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void worker.stop().then(() => process.exit(0));
  });
}

import { OrdersApi } from "./orders-api.js";
import { loadOrdersApiConfig } from "../shared/config.js";
import { FileOrderEventQueue } from "../shared/file-order-event-queue.js";

const config = loadOrdersApiConfig();
const queue = new FileOrderEventQueue(config.queueDirectory);
const api = new OrdersApi(queue, { host: config.host, port: config.port });
const address = await api.start();

console.log(JSON.stringify({ service: "orders-api", address }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void api.stop().then(() => process.exit(0));
  });
}

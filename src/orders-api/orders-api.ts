import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { isCreateOrderRequest, type CreateOrderResponse } from "./contracts.js";
import { ORDER_ACCEPTED_EVENT_TYPE } from "../shared/event-schema.js";
import type { OrderEventQueue } from "../shared/order-event-queue.js";

export interface OrdersApiOptions {
  host: string;
  port: number;
}

/** HTTP runtime service that validates orders and publishes accepted events. */
export class OrdersApi {
  readonly #queue: OrderEventQueue;
  readonly #options: OrdersApiOptions;
  #server: Server | undefined;

  public constructor(queue: OrderEventQueue, options: OrdersApiOptions) {
    this.#queue = queue;
    this.#options = options;
  }

  public async start(): Promise<string> {
    if (this.#server !== undefined) {
      throw new Error("Orders API is already running");
    }

    const server = createServer((request, response) => {
      void this.#handle(request, response).catch((error: unknown) => {
        console.error("orders-api request failed", error);
        writeJson(response, 500, { error: "internal_error" });
      });
    });
    this.#server = server;

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.#options.port, this.#options.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      this.#server = undefined;
      throw error;
    }

    const address = server.address() as AddressInfo;
    return `http://${this.#options.host}:${address.port}`;
  }

  public async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;

    if (server === undefined) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }

  async #handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/orders") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    const contentType = request.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "application/json") {
      writeJson(response, 415, { error: "unsupported_media_type" });
      return;
    }

    const body = await readJsonBody(request);

    if (!isCreateOrderRequest(body)) {
      writeJson(response, 400, { error: "invalid_order" });
      return;
    }

    await this.#queue.publish({
      eventId: randomUUID(),
      type: ORDER_ACCEPTED_EVENT_TYPE,
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      orderId: body.orderId,
      customerEmail: body.customerEmail,
      priority: body.priority,
    });

    const result: CreateOrderResponse = {
      orderId: body.orderId,
      status: "accepted",
    };
    writeJson(response, 202, result);
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  if (response.headersSent) {
    return;
  }

  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

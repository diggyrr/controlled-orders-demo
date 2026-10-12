import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  isOrderAcceptedEvent,
  type OrderAcceptedEvent,
} from "./event-schema.js";
import type {
  OrderEventQueue,
  QueuedOrderEvent,
  QueueReceipt,
} from "./order-event-queue.js";

export class FileOrderEventQueue implements OrderEventQueue {
  readonly #readyDirectory: string;
  readonly #inFlightDirectory: string;

  public constructor(queueDirectory: string) {
    this.#readyDirectory = join(queueDirectory, "ready");
    this.#inFlightDirectory = join(queueDirectory, "in-flight");
  }

  public async publish(event: OrderAcceptedEvent): Promise<void> {
    await this.#ensureDirectories();

    const priorityRank = event.priority === "urgent" ? "0" : "1";
    const receipt = `${priorityRank}-${Date.now().toString().padStart(13, "0")}-${event.eventId}.json`;
    const temporaryPath = join(this.#readyDirectory, `.${randomUUID()}.tmp`);

    await writeFile(temporaryPath, `${JSON.stringify(event)}\n`, {
      flag: "wx",
    });
    await rename(temporaryPath, join(this.#readyDirectory, receipt));
  }

  public async receive(): Promise<QueuedOrderEvent | undefined> {
    await this.#ensureDirectories();

    const receipts = (await readdir(this.#readyDirectory))
      .filter((entry) => entry.endsWith(".json"))
      .sort();

    for (const entry of receipts) {
      const receipt = entry as QueueReceipt;
      const readyPath = join(this.#readyDirectory, receipt);
      const inFlightPath = join(this.#inFlightDirectory, receipt);

      try {
        await rename(readyPath, inFlightPath);
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }

        throw error;
      }

      const value: unknown = JSON.parse(await readFile(inFlightPath, "utf8"));

      if (!isOrderAcceptedEvent(value)) {
        await this.release(receipt);
        throw new Error(
          `Queue entry ${receipt} does not match the shared event contract`,
        );
      }

      return { receipt, event: value };
    }

    return undefined;
  }

  public async acknowledge(receipt: QueueReceipt): Promise<void> {
    await unlink(join(this.#inFlightDirectory, receipt));
  }

  public async release(receipt: QueueReceipt): Promise<void> {
    await rename(
      join(this.#inFlightDirectory, receipt),
      join(this.#readyDirectory, receipt),
    );
  }

  async #ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.#readyDirectory, { recursive: true }),
      mkdir(this.#inFlightDirectory, { recursive: true }),
    ]);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

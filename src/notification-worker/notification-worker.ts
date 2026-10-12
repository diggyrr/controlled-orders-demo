import type {
  Notification,
  NotificationSink,
  NotificationWorkerOptions,
} from "./contracts.js";
import type { OrderEventQueue } from "../shared/order-event-queue.js";

/** Background runtime service that turns accepted-order events into notifications. */
export class NotificationWorker {
  readonly #queue: OrderEventQueue;
  readonly #sink: NotificationSink;
  readonly #options: NotificationWorkerOptions;
  #timer: NodeJS.Timeout | undefined;
  #activeRun: Promise<void> = Promise.resolve();

  public constructor(
    queue: OrderEventQueue,
    sink: NotificationSink,
    options: NotificationWorkerOptions,
  ) {
    this.#queue = queue;
    this.#sink = sink;
    this.#options = options;
  }

  public start(): void {
    if (this.#timer !== undefined) {
      throw new Error("Notification worker is already running");
    }

    this.#scheduleRun();
    this.#timer = setInterval(
      () => this.#scheduleRun(),
      this.#options.pollIntervalMs,
    );
  }

  public async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }

    await this.#activeRun;
  }

  #scheduleRun(): void {
    this.#activeRun = this.#activeRun
      .then(() => this.#processOne())
      .catch((error: unknown) => {
        console.error("notification-worker poll failed", error);
      });
  }

  async #processOne(): Promise<void> {
    const queued = await this.#queue.receive();

    if (queued === undefined) {
      return;
    }

    const notification: Notification = {
      orderId: queued.event.orderId,
      channel: "email",
      recipient: queued.event.customerEmail,
      message: `Order ${queued.event.orderId} was accepted`,
    };

    try {
      await this.#sink.record(notification);
      await this.#queue.acknowledge(queued.receipt);
    } catch (error) {
      await this.#queue.release(queued.receipt);
      throw error;
    }
  }
}

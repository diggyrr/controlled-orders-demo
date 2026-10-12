import type { Notification, NotificationSink } from "./contracts.js";

/** Records notifications as one structured JSON line on standard output. */
export class ConsoleNotificationSink implements NotificationSink {
  public async record(notification: Notification): Promise<void> {
    console.log(
      JSON.stringify({ service: "notification-worker", notification }),
    );
  }
}

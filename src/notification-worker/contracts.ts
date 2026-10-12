export interface Notification {
  orderId: string;
  channel: "email";
  recipient: string;
  message: string;
}

/** Output seam used by the worker after it handles an accepted order. */
export interface NotificationSink {
  record(notification: Notification): Promise<void>;
}

export interface NotificationWorkerOptions {
  pollIntervalMs: number;
}

export interface QueueConfig {
  queueDirectory: string;
}

export interface OrdersApiConfig extends QueueConfig {
  host: string;
  port: number;
}

export interface NotificationWorkerConfig extends QueueConfig {
  pollIntervalMs: number;
}

/** Loads every externally configurable value used by the orders API. */
export function loadOrdersApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OrdersApiConfig {
  return {
    host: environment.ORDERS_API_HOST ?? "127.0.0.1",
    port: readInteger(environment, "ORDERS_API_PORT", 3_000, 1, 65_535),
    queueDirectory: environment.QUEUE_DIRECTORY ?? ".data/queue",
  };
}

/** Loads every externally configurable value used by the notification worker. */
export function loadNotificationWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): NotificationWorkerConfig {
  return {
    queueDirectory: environment.QUEUE_DIRECTORY ?? ".data/queue",
    pollIntervalMs: readInteger(
      environment,
      "WORKER_POLL_INTERVAL_MS",
      250,
      1,
      60_000,
    ),
  };
}

function readInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = environment[name];

  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }

  return value;
}

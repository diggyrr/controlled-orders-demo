# Controlled Orders Demo

This small TypeScript application accepts orders over HTTP and publishes an
`order.accepted` event to a file-backed queue. A separate notification worker
consumes each event and records an email notification as structured JSON.

## Local development

Requires Node.js 20 or later and npm. Docker Compose is optional.

```sh
npm ci
npm run typecheck
npm test
```

Configuration defaults are listed in `.env.example`. To override them for the
Node.js processes, export the values in each terminal before starting a service.

```sh
npm run dev:api
npm run dev:worker
```

Submit an order to `POST http://127.0.0.1:3000/orders`:

```sh
curl -i -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-123","customerEmail":"buyer@example.test"}'
```

Alternatively, copy `.env.example` to `.env` and run the complete two-service
topology with `docker compose up --build`. The shared queue is local file data;
no database, cloud service, authentication, or frontend is required.

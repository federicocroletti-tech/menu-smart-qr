import { createApp } from "./app";
import { createPool } from "./database";
import { expireExpiredHolds } from "./reservation-service";

const port = Number(process.env["PORT"] ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}

if (!process.env["IDEMPOTENCY_SECRET"] || process.env["IDEMPOTENCY_SECRET"].length < 32) {
  throw new Error("IDEMPOTENCY_SECRET must contain at least 32 characters");
}

const pool = createPool();
const app = createApp(pool);
const server = app.listen(port, () => {
  console.log(`Reservation API listening on port ${port}`);
});

const cleanupTimer = setInterval(() => {
  void expireExpiredHolds(pool).catch(() => {
    console.error("Expired reservation hold cleanup failed");
  });
}, 60_000);
cleanupTimer.unref();
void expireExpiredHolds(pool).catch(() => {
  console.error("Initial expired reservation hold cleanup failed");
});

function shutdown(): void {
  clearInterval(cleanupTimer);
  server.close(() => {
    void pool.end().finally(() => {
      process.exitCode = 0;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Pool } from "pg";
import { z } from "zod";

import {
  AvailabilityError,
  findAvailability,
  type AvailabilityRequest,
} from "./availability";
import {
  cancelReservation,
  confirmReservation,
  createReservationHold,
  hashConfirmationCode,
  ReservationError,
} from "./reservation-service";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const availabilitySchema = z.object({
  date: z.string().regex(localDatePattern),
  time: z.string().regex(localTimePattern),
  partySize: z.coerce.number().int().min(1).max(100),
});

const holdSchema = availabilitySchema.extend({
  allocationMode: z.enum(["guest_selected", "restaurant_assigned"]),
  tableIds: z.array(z.string().uuid()).max(12).optional(),
}).superRefine((request, context) => {
  if (
    request.allocationMode === "guest_selected" &&
    (!request.tableIds || request.tableIds.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "Choose an available table",
      path: ["tableIds"],
    });
  }
  if (
    request.tableIds &&
    new Set(request.tableIds).size !== request.tableIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Table identifiers must be unique",
      path: ["tableIds"],
    });
  }
  if (
    request.allocationMode === "restaurant_assigned" &&
    request.tableIds !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Table identifiers are not allowed for restaurant assignment",
      path: ["tableIds"],
    });
  }
});

const confirmationSchema = z.object({
  holdToken: z.string().min(32).max(128),
  guest: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(32),
    email: z.string().trim().email().max(254).optional(),
  }).strict(),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  marketingConsent: z.boolean().default(false),
}).strict();

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function getPathParameter(request: Request, name: string): string | null {
  const value = request.params[name];
  return typeof value === "string" ? value : null;
}

function toAvailabilityRequest(
  restaurantId: string,
  value: z.infer<typeof availabilitySchema>,
): AvailabilityRequest {
  const parsedDate = new Date(`${value.date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== value.date
  ) {
    throw new AvailabilityError(400, "Invalid reservation date");
  }

  return {
    restaurantId,
    date: value.date,
    time: value.time,
    partySize: value.partySize,
  };
}

export function createApp(pool: Pool): Express {
  const app = express();
  const allowedOrigins = new Set(
    (process.env["ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (process.env["TRUST_PROXY"] === "true") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use((request, response, next) => {
    const origin = request.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: "Origin is not allowed" });
      return;
    }

    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Idempotency-Key",
      );
    }

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(
    "/api/",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests" },
    }),
  );

  app.get(
    "/health/live",
    (_request, response) => response.status(200).json({ status: "ok" }),
  );
  app.get(
    "/health/ready",
    asyncHandler(async (_request, response) => {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ready" });
    }),
  );

  app.get(
    "/api/v1/restaurants/:restaurantId/availability",
    asyncHandler(async (request, response) => {
      const restaurantId = getPathParameter(request, "restaurantId");
      if (!restaurantId) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      const parsed = availabilitySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid availability request" });
        return;
      }

      const query = toAvailabilityRequest(
        restaurantId,
        parsed.data,
      );
      const result = await findAvailability(pool, query);
      response.status(200).json({
        date: query.date,
        time: query.time,
        partySize: query.partySize,
        durationMinutes: result.timing.durationMinutes,
        available: result.tableSets.length > 0,
        tableSets: result.tableSets,
      });
    }),
  );

  app.post(
    "/api/v1/restaurants/:restaurantId/reservation-holds",
    asyncHandler(async (request, response) => {
      const restaurantId = getPathParameter(request, "restaurantId");
      if (!restaurantId) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      const parsed = holdSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid reservation hold request" });
        return;
      }

      const idempotencyKey = request.get("Idempotency-Key");
      if (!idempotencyKey || !idempotencyKey.trim() || idempotencyKey.length > 128) {
        response.status(400).json({ error: "Idempotency-Key is required" });
        return;
      }

      const query = toAvailabilityRequest(
        restaurantId,
        parsed.data,
      );
      const result = await createReservationHold(pool, {
        ...query,
        allocationMode: parsed.data.allocationMode,
        tableIds: parsed.data.tableIds,
        idempotencyKey: idempotencyKey.trim(),
      });
      response.status(result.reused ? 200 : 201).json({
        holdToken: result.holdToken,
        expiresAt: result.expiresAt,
        tableIds: result.tableIds,
      });
    }),
  );

  app.post(
    "/api/v1/reservations",
    asyncHandler(async (request, response) => {
      const parsed = confirmationSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid reservation confirmation" });
        return;
      }

      const result = await confirmReservation(pool, parsed.data);
      response.status(200).json({
        confirmationCode: result.confirmationCode,
        status: result.status,
      });
    }),
  );

  app.get(
    "/api/v1/reservations/:confirmationCode",
    asyncHandler(async (request, response) => {
      const confirmationCode = getPathParameter(request, "confirmationCode");
      if (!confirmationCode || !/^[A-Za-z0-9_-]{20,32}$/.test(confirmationCode)) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }

      const result = await pool.query<{
        status: string;
        starts_at: Date;
        ends_at: Date;
        party_size_current: number;
        table_names: string[] | null;
      }>(
        `SELECT r.status,
                r.starts_at,
                r.ends_at,
                r.party_size_current,
                array_agg(t.name ORDER BY t.name)
                  FILTER (WHERE t.id IS NOT NULL) AS table_names
         FROM reservations r
         LEFT JOIN reservation_tables rt ON rt.reservation_id = r.id
         LEFT JOIN restaurant_tables t ON t.id = rt.table_id
         WHERE r.confirmation_code_hash = $1
         GROUP BY r.id`,
        [hashConfirmationCode(confirmationCode)],
      );
      const reservation = result.rows[0];
      if (!reservation) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }

      response.status(200).json({
        status: reservation.status,
        startsAt: reservation.starts_at,
        endsAt: reservation.ends_at,
        partySize: reservation.party_size_current,
        tables: reservation.table_names ?? [],
      });
    }),
  );

  app.post(
    "/api/v1/reservations/:confirmationCode/cancellation",
    asyncHandler(async (request, response) => {
      const confirmationCode = getPathParameter(request, "confirmationCode");
      if (!confirmationCode || !/^[A-Za-z0-9_-]{20,32}$/.test(confirmationCode)) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }
      const result = await cancelReservation(pool, confirmationCode);
      response.status(200).json(result);
    }),
  );

  const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof AvailabilityError || error instanceof ReservationError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }

    console.error("Reservation API request failed", {
      method: request.method,
      path: request.path,
    });
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}

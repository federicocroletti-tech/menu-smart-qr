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

import type { AccessTokenVerifier, AuthenticatedUser } from "./auth";
import type { RestaurantContentStore } from "./content-database";
import type { TenantStore } from "./tenant-database";
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
  modifyReservation,
  releaseReservationHold,
  ReservationError,
} from "./reservation-service";
import { reservationStatuses } from "./domain/reservations";
import { TenantStoreError } from "./tenant-database";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const restaurantIdSchema = z.string().min(1).max(128);
const uuidSchema = z.string().uuid();
const confirmationCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{20,32}$/);
const isoTimestampSchema = z.string().datetime({ offset: true });

function parseIfMatch(request: Request): number | null {
  const match = request.get("if-match")?.match(/^"([1-9]\d*)"$/);
  if (!match) {
    return null;
  }
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

function normalizeOrigin(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (url.protocol === "capacitor:") {
    return `${url.protocol}//${url.host}`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ALLOWED_ORIGINS entries must use HTTP or HTTPS");
  }
  return url.origin;
}

const availabilitySchema = z.object({
  date: z.string().regex(localDatePattern),
  time: z.string().regex(localTimePattern),
  partySize: z.coerce.number().int().min(1).max(100),
}).strict();

const adminReservationQuerySchema = z.object({
  date: z.string().regex(localDatePattern),
  status: z.enum(reservationStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();

const holdSchema = availabilitySchema.extend({
  allocationMode: z.enum(["guest_selected", "restaurant_assigned"]),
  tableIds: z.array(z.string().uuid()).max(12).optional(),
}).strict().superRefine((request, context) => {
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
    name: z.string().trim().min(2).max(120).refine(
      (name) => [...name.matchAll(/\p{L}/gu)].length >= 2,
      "Name must contain at least two letters",
    ),
    phone: z.string().trim().min(6).max(32)
      .regex(/^\+?[\d\s().-]+$/)
      .refine((phone) => phone.replace(/\D/g, "").length >= 6),
    email: z.string().trim().email().max(254).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).strict(),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  marketingConsent: z.boolean().default(false),
}).strict();

const modificationSchema = z.object({
  date: z.string().regex(localDatePattern),
  time: z.string().regex(localTimePattern),
  partySize: z.coerce.number().int().min(1).max(100),
}).strict();

const cancellationSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
}).strict().default({});

const staffReservationSchema = z.object({
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
  partySize: z.number().int().min(1).max(100),
  tableIds: z.array(uuidSchema).min(1).max(12),
  guest: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(32).regex(/^\+?[\d\s().-]+$/),
    email: z.string().trim().email().max(254).optional(),
  }).strict(),
  reason: z.string().trim().min(1).max(300),
}).strict().superRefine((request, context) => {
  if (new Date(request.startsAt) >= new Date(request.endsAt)) {
    context.addIssue({ code: "custom", message: "End must be after start", path: ["endsAt"] });
  }
  if (new Set(request.tableIds).size !== request.tableIds.length) {
    context.addIssue({ code: "custom", message: "Table identifiers must be unique", path: ["tableIds"] });
  }
});

const staffReservationUpdateSchema = z.object({
  status: z.enum(reservationStatuses).optional(),
  startsAt: isoTimestampSchema.optional(),
  endsAt: isoTimestampSchema.optional(),
  partySize: z.number().int().min(1).max(100).optional(),
  reason: z.string().trim().min(1).max(300),
}).strict().superRefine((request, context) => {
  if ((request.startsAt === undefined) !== (request.endsAt === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Both start and end timestamps are required to change the reservation time",
    });
  }
  if (request.startsAt && request.endsAt && new Date(request.startsAt) >= new Date(request.endsAt)) {
    context.addIssue({ code: "custom", message: "End must be after start", path: ["endsAt"] });
  }
  if (
    request.status === undefined &&
    request.startsAt === undefined &&
    request.partySize === undefined
  ) {
    context.addIssue({ code: "custom", message: "At least one reservation field must change" });
  }
});

const tableBlockSchema = z.object({
  tableId: uuidSchema,
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
  reason: z.string().trim().min(1).max(300),
}).strict().refine(
  (request) => new Date(request.startsAt) < new Date(request.endsAt),
  { message: "End must be after start", path: ["endsAt"] },
);

const availabilityRulesSchema = z.object({
  holdMinutes: z.number().int().min(5).max(10),
  maximumPartySize: z.number().int().min(1).max(100),
  onlineBookingEnabled: z.boolean(),
  cancellationNoticeMinutes: z.number().int().min(0).max(43_200).nullable(),
}).strict();

const availabilityExceptionSchema = z.object({
  date: z.string().regex(localDatePattern),
  closed: z.boolean(),
  opensAt: z.string().regex(localTimePattern).optional(),
  closesAt: z.string().regex(localTimePattern).optional(),
  reason: z.string().trim().min(1).max(300),
}).strict().superRefine((request, context) => {
  if (!isValidLocalDate(request.date)) {
    context.addIssue({ code: "custom", message: "Invalid calendar date", path: ["date"] });
  }
  if (
    (request.closed && (request.opensAt !== undefined || request.closesAt !== undefined)) ||
    (!request.closed &&
      (!request.opensAt || !request.closesAt || request.opensAt >= request.closesAt))
  ) {
    context.addIssue({ code: "custom", message: "Invalid exception hours" });
  }
});

const exportQuerySchema = z.object({
  from: z.string().regex(localDatePattern),
  to: z.string().regex(localDatePattern),
}).strict().superRefine((request, context) => {
  if (
    !isValidLocalDate(request.from) ||
    !isValidLocalDate(request.to) ||
    request.from > request.to ||
    Date.parse(`${request.to}T00:00:00Z`) -
      Date.parse(`${request.from}T00:00:00Z`) >
      31 * 24 * 60 * 60 * 1000
  ) {
    context.addIssue({ code: "custom", message: "Invalid date range" });
  }
});

const dateRangeQuerySchema = exportQuerySchema;

const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function requireAuthentication(
  tokenVerifier: AccessTokenVerifier,
): RequestHandler {
  return (request, response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    const accessToken = match?.[1];
    if (!accessToken) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    void tokenVerifier
      .verify(accessToken)
      .then((user) => {
        if (!user) {
          response.status(401).json({ error: "Invalid or expired access token" });
          return;
        }
        request.authenticatedUser = user;
        next();
      })
      .catch(next);
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
  if (!isValidLocalDate(value.date)) {
    throw new AvailabilityError(400, "Invalid reservation date");
  }

  return {
    restaurantId,
    date: value.date,
    time: value.time,
    partySize: value.partySize,
  };
}

function isValidLocalDate(value: string): boolean {
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

export function createApp(
  pool: Pool,
  tokenVerifier: AccessTokenVerifier,
  tenantStore: TenantStore,
  contentStore: RestaurantContentStore,
): Express {
  const app = express();
  const allowedOrigins = new Set([
    "capacitor://localhost",
    "http://localhost",
    ...(process.env["ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin),
  ]);

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
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Idempotency-Key, If-Match",
      );
      response.setHeader("Access-Control-Expose-Headers", "ETag, Content-Disposition");
    }

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  });

  const holdReleaseSchema = z.object({
    holdToken: z.string().min(32).max(128),
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
    "/api/v1/me/restaurants",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }

      const memberships = await tenantStore.listRestaurantsForUser(user.id);
      response.status(200).json({ restaurants: memberships });
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/reservations",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }

      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }

      const parsed = adminReservationQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid reservation list request" });
        return;
      }
      if (!isValidLocalDate(parsed.data.date)) {
        response.status(400).json({ error: "Invalid reservation list request" });
        return;
      }

      const result = await tenantStore.listReservationsForRestaurant(
        user.id,
        restaurantId.data,
        {
          date: parsed.data.date,
          status: parsed.data.status,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        },
      );
      if (!result) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }

      response.status(200).json({
        restaurantId: restaurantId.data,
        date: parsed.data.date,
        reservations: result.reservations,
        hasMore: result.hasMore,
      });
    }),
  );

  app.post(
    "/api/v1/admin/restaurants/:restaurantId/reservations",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = staffReservationSchema.safeParse(request.body);
      const idempotencyKey = request.get("Idempotency-Key")?.trim();
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid staff reservation request" });
        return;
      }
      if (!idempotencyKey || idempotencyKey.length > 128) {
        response.status(400).json({ error: "Idempotency-Key is required" });
        return;
      }
      const canManage = await tenantStore.canManageRestaurant(
        user.id,
        restaurantId.data,
      );
      if (!canManage) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      const result = await tenantStore.createStaffReservation(
        user.id,
        restaurantId.data,
        {
          startsAt: new Date(parsed.data.startsAt),
          endsAt: new Date(parsed.data.endsAt),
          partySize: parsed.data.partySize,
          tableIds: parsed.data.tableIds,
          guest: parsed.data.guest,
          reason: parsed.data.reason,
          idempotencyKey,
        },
      );
      if (!result) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(result.reused ? 200 : 201).json({
        id: result.id,
        status: result.status,
      });
    }),
  );

  app.patch(
    "/api/v1/admin/reservations/:reservationId",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const reservationId = uuidSchema.safeParse(
        getPathParameter(request, "reservationId"),
      );
      const parsed = staffReservationUpdateSchema.safeParse(request.body);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!reservationId.success) {
        response.status(400).json({ error: "Invalid reservation identifier" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid reservation update request" });
        return;
      }
      const expectedRevision = parseIfMatch(request);
      if (expectedRevision === null) {
        response.status(428).json({ error: "If-Match reservation revision is required" });
        return;
      }
      const result = await tenantStore.updateReservationForStaff(
        user.id,
        reservationId.data,
        {
          status: parsed.data.status,
          startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
          partySize: parsed.data.partySize,
          reason: parsed.data.reason,
          expectedRevision,
        },
      );
      if (!result) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }
      response
        .setHeader("ETag", `"${result.revision}"`)
        .status(200)
        .json({
          id: reservationId.data,
          status: result.status,
          revision: result.revision,
        });
    }),
  );

  app.post(
    "/api/v1/admin/restaurants/:restaurantId/table-blocks",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = tableBlockSchema.safeParse(request.body);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid table block request" });
        return;
      }
      const result = await tenantStore.createTableBlock(
        user.id,
        restaurantId.data,
        parsed.data.tableId,
        new Date(parsed.data.startsAt),
        new Date(parsed.data.endsAt),
        parsed.data.reason,
      );
      if (!result) {
        response.status(404).json({ error: "Restaurant or table not found" });
        return;
      }
      response.status(201).json({ id: result.id });
    }),
  );

  app.delete(
    "/api/v1/admin/restaurants/:restaurantId/table-blocks/:blockId",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const blockId = uuidSchema.safeParse(getPathParameter(request, "blockId"));
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success || !blockId.success) {
        response.status(400).json({ error: "Invalid table block identifier" });
        return;
      }
      const deleted = await tenantStore.deleteTableBlock(
        user.id,
        restaurantId.data,
        blockId.data,
      );
      if (!deleted) {
        response.status(404).json({ error: "Table block not found" });
        return;
      }
      response.status(204).end();
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/availability-rules",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      const rules = await tenantStore.getAvailabilityRules(
        user.id,
        restaurantId.data,
      );
      if (!rules) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json(rules);
    }),
  );

  app.put(
    "/api/v1/admin/restaurants/:restaurantId/availability-rules",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = availabilityRulesSchema.safeParse(request.body);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid availability rules" });
        return;
      }
      const updated = await tenantStore.updateAvailabilityRules(
        user.id,
        restaurantId.data,
        parsed.data,
      );
      if (!updated) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json({ status: "updated" });
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/availability-exceptions",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const range = dateRangeQuerySchema.safeParse(request.query);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success || !range.success) {
        response.status(400).json({ error: "Invalid availability exception query" });
        return;
      }
      const exceptions = await tenantStore.listAvailabilityExceptions(
        user.id,
        restaurantId.data,
        range.data.from,
        range.data.to,
      );
      if (!exceptions) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json({ exceptions });
    }),
  );

  app.put(
    "/api/v1/admin/restaurants/:restaurantId/availability-exceptions",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = availabilityExceptionSchema.safeParse(request.body);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid availability exception" });
        return;
      }
      const result = await tenantStore.upsertAvailabilityException(
        user.id,
        restaurantId.data,
        parsed.data,
      );
      if (!result) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json({ id: result.id });
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/table-blocks",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const range = dateRangeQuerySchema.safeParse(request.query);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success || !range.success) {
        response.status(400).json({ error: "Invalid table block query" });
        return;
      }
      const blocks = await tenantStore.listTableBlocks(
        user.id,
        restaurantId.data,
        range.data.from,
        range.data.to,
      );
      if (!blocks) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json({ blocks });
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/notifications",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = notificationQuerySchema.safeParse(request.query);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!restaurantId.success || !parsed.success) {
        response.status(400).json({ error: "Invalid notification request" });
        return;
      }
      const notifications = await tenantStore.listNotifications(
        user.id,
        restaurantId.data,
        parsed.data.limit,
      );
      if (!notifications) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      response.status(200).json({ notifications });
    }),
  );

  app.get(
    "/api/v1/admin/restaurants/:restaurantId/reservations/export",
    requireAuthentication(tokenVerifier),
    asyncHandler(async (request, response) => {
      const user = request.authenticatedUser;
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      const parsed = exportQuerySchema.safeParse(request.query);
      if (!user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (
        !restaurantId.success ||
        !parsed.success ||
        !isValidLocalDate(parsed.data.from) ||
        !isValidLocalDate(parsed.data.to) ||
        parsed.data.from > parsed.data.to ||
        Date.parse(`${parsed.data.to}T00:00:00Z`) -
          Date.parse(`${parsed.data.from}T00:00:00Z`) >
          31 * 24 * 60 * 60 * 1000
      ) {
        response.status(400).json({ error: "Invalid reservation export request" });
        return;
      }
      const canManage = await tenantStore.canManageRestaurant(
        user.id,
        restaurantId.data,
      );
      if (!canManage) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      const reservations = await tenantStore.exportReservations(
        user.id,
        restaurantId.data,
        parsed.data.from,
        parsed.data.to,
      );
      if (!reservations) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }
      const csvCell = (value: string | number) => {
        const safe = String(value).replace(/^[\u0000-\u0020]*[=+\-@]/, "'$&");
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const rows = [
        ["id", "status", "startsAt", "endsAt", "partySize", "guestName", "guestPhone", "tables"]
          .map(csvCell).join(","),
        ...reservations.map((reservation) => [
          reservation.id,
          reservation.status,
          reservation.startsAt.toISOString(),
          reservation.endsAt.toISOString(),
          reservation.partySize,
          reservation.guestName ?? "",
          reservation.guestPhone ?? "",
          reservation.tables.join("; "),
        ].map(csvCell).join(",")),
      ];
      response
        .status(200)
        .type("text/csv")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="reservations-${parsed.data.from}-${parsed.data.to}.csv"`,
        )
        .send(rows.join("\r\n"));
    }),
  );

  app.get(
    "/api/v1/restaurants/:restaurantId/content",
    asyncHandler(async (request, response) => {
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }

      const content = await contentStore.getRestaurantContent(restaurantId.data);
      if (!content) {
        response.status(404).json({ error: "Restaurant not found" });
        return;
      }

      response.status(200).json(content);
    }),
  );

  app.get(
    "/api/v1/restaurants/:restaurantId/availability",
    asyncHandler(async (request, response) => {
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      if (!restaurantId.success) {
        response.status(400).json({ error: "Invalid restaurant identifier" });
        return;
      }
      const parsed = availabilitySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid availability request" });
        return;
      }

      const query = toAvailabilityRequest(
        restaurantId.data,
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
      const restaurantId = restaurantIdSchema.safeParse(
        getPathParameter(request, "restaurantId"),
      );
      if (!restaurantId.success) {
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
        restaurantId.data,
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
        tableNames: result.tableNames,
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
      const parsedCode = confirmationCodeSchema.safeParse(
        getPathParameter(request, "confirmationCode"),
      );
      if (!parsedCode.success) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }
      const confirmationCode = parsedCode.data;

      const result = await pool.query<{
        status: string;
        starts_at: Date;
        ends_at: Date;
        party_size_current: number;
        table_names: string[] | null;
        revision: number;
      }>(
        `SELECT r.status,
                r.starts_at,
                r.ends_at,
                r.party_size_current,
                r.revision,
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

      response
        .setHeader("ETag", `"${reservation.revision}"`)
        .status(200)
        .json({
          status: reservation.status,
          startsAt: reservation.starts_at,
          endsAt: reservation.ends_at,
          partySize: reservation.party_size_current,
          tables: reservation.table_names ?? [],
          revision: reservation.revision,
        });
    }),
  );

  app.patch(
    "/api/v1/reservations/:confirmationCode",
    asyncHandler(async (request, response) => {
      const parsedCode = confirmationCodeSchema.safeParse(
        getPathParameter(request, "confirmationCode"),
      );
      const parsed = modificationSchema.safeParse(request.body);
      const idempotencyKey = request.get("Idempotency-Key")?.trim();
      if (!parsedCode.success) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid reservation modification" });
        return;
      }
      if (!idempotencyKey || idempotencyKey.length > 128) {
        response.status(400).json({ error: "Idempotency-Key is required" });
        return;
      }
      const expectedRevision = parseIfMatch(request);
      if (expectedRevision === null) {
        response.status(428).json({ error: "If-Match reservation revision is required" });
        return;
      }
      if (!isValidLocalDate(parsed.data.date)) {
        response.status(400).json({ error: "Invalid reservation modification" });
        return;
      }
      const result = await modifyReservation(
        pool,
        parsedCode.data,
        { ...parsed.data, idempotencyKey, expectedRevision },
      );
      response
        .setHeader("ETag", `"${result.revision}"`)
        .status(200)
        .json({
          status: result.status,
          startsAt: result.startsAt,
          endsAt: result.endsAt,
          partySize: result.partySize,
          revision: result.revision,
        });
    }),
  );

  app.post(
    "/api/v1/reservation-holds/release",
    asyncHandler(async (request, response) => {
      const parsed = holdReleaseSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(404).json({ error: "Reservation hold not found" });
        return;
      }

      const result = await releaseReservationHold(pool, parsed.data.holdToken);
      response.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/reservations/:confirmationCode/cancellation",
    asyncHandler(async (request, response) => {
      const parsedCode = confirmationCodeSchema.safeParse(
        getPathParameter(request, "confirmationCode"),
      );
      if (!parsedCode.success) {
        response.status(404).json({ error: "Reservation not found" });
        return;
      }
      const parsed = cancellationSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid cancellation request" });
        return;
      }
      const result = await cancelReservation(
        pool,
        parsedCode.data,
        parsed.data.reason,
      );
      response.status(200).json(result);
    }),
  );

  const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (
      error instanceof AvailabilityError ||
      error instanceof ReservationError ||
      error instanceof TenantStoreError
    ) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      response.status(400).json({ error: "Invalid JSON request body" });
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json({ error: "Request body is too large" });
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

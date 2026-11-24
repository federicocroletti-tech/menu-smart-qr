CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE reservation_status AS ENUM (
  'draft',
  'holding',
  'awaiting_guarantee',
  'confirmed',
  'seated',
  'completed',
  'cancelled_by_guest',
  'cancelled_by_restaurant',
  'no_show',
  'expired'
);

CREATE TYPE guarantee_status AS ENUM (
  'not_required',
  'pending',
  'authorized',
  'captured',
  'refunded',
  'partially_refunded',
  'failed',
  'expired',
  'disputed'
);

CREATE TABLE restaurants (
  id text PRIMARY KEY,
  name text NOT NULL,
  time_zone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dining_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  online_bookable boolean NOT NULL DEFAULT true,
  UNIQUE (restaurant_id, name)
);

CREATE TABLE restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_area_id uuid NOT NULL REFERENCES dining_areas(id),
  name text NOT NULL,
  shape text NOT NULL CHECK (shape IN ('rectangular', 'square', 'round')),
  x numeric(6, 5) NOT NULL CHECK (x >= 0 AND x <= 1),
  y numeric(6, 5) NOT NULL CHECK (y >= 0 AND y <= 1),
  width numeric(6, 5) NOT NULL CHECK (width > 0 AND width <= 1),
  height numeric(6, 5) NOT NULL CHECK (height > 0 AND height <= 1),
  rotation smallint NOT NULL DEFAULT 0 CHECK (rotation BETWEEN 0 AND 359),
  min_capacity smallint NOT NULL CHECK (min_capacity > 0),
  standard_capacity smallint NOT NULL CHECK (standard_capacity > 0),
  max_capacity smallint NOT NULL CHECK (max_capacity >= standard_capacity),
  combinable boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  online_bookable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (dining_area_id, name),
  CHECK (min_capacity <= standard_capacity)
);

CREATE TABLE table_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_area_id uuid NOT NULL REFERENCES dining_areas(id),
  name text NOT NULL,
  UNIQUE (dining_area_id, name)
);

CREATE TABLE table_combination_members (
  combination_id uuid NOT NULL REFERENCES table_combinations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES restaurant_tables(id),
  PRIMARY KEY (combination_id, table_id)
);

CREATE TABLE opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  closed boolean NOT NULL DEFAULT false,
  CHECK (closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at))
);

CREATE TABLE service_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  duration_minutes smallint NOT NULL CHECK (duration_minutes > 0),
  cleanup_minutes smallint NOT NULL DEFAULT 0 CHECK (cleanup_minutes >= 0),
  slot_interval_minutes smallint NOT NULL CHECK (slot_interval_minutes IN (15, 30)),
  enabled boolean NOT NULL DEFAULT true,
  CHECK (starts_at < ends_at)
);

CREATE TABLE availability_rules (
  restaurant_id text PRIMARY KEY REFERENCES restaurants(id),
  hold_minutes smallint NOT NULL DEFAULT 7 CHECK (hold_minutes BETWEEN 5 AND 10),
  maximum_party_size smallint NOT NULL CHECK (maximum_party_size > 0),
  online_booking_enabled boolean NOT NULL DEFAULT false,
  cancellation_notice_minutes integer CHECK (cancellation_notice_minutes >= 0),
  booking_terms_version text NOT NULL,
  privacy_notice_version text NOT NULL
);

CREATE TABLE closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  dining_area_id uuid REFERENCES dining_areas(id),
  table_id uuid REFERENCES restaurant_tables(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (dining_area_id IS NULL OR table_id IS NULL)
);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  guest_id uuid REFERENCES guests(id),
  confirmation_code_hash text UNIQUE,
  hold_token_hash text UNIQUE,
  status reservation_status NOT NULL DEFAULT 'draft',
  allocation_mode text NOT NULL CHECK (allocation_mode IN ('guest_selected', 'restaurant_assigned')),
  party_size_initial smallint NOT NULL CHECK (party_size_initial > 0),
  party_size_current smallint NOT NULL CHECK (party_size_current > 0),
  party_size_arrived smallint CHECK (party_size_arrived >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  hold_expires_at timestamptz,
  cancellation_deadline timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  UNIQUE (restaurant_id, idempotency_key)
);

CREATE TABLE reservation_tables (
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES restaurant_tables(id),
  status reservation_status NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  PRIMARY KEY (reservation_id, table_id),
  CHECK (starts_at < ends_at),
  EXCLUDE USING gist (
    table_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('holding', 'awaiting_guarantee', 'confirmed', 'seated'))
);

CREATE INDEX reservations_restaurant_start_idx
  ON reservations (restaurant_id, starts_at);

CREATE INDEX reservations_expiring_holds_idx
  ON reservations (hold_expires_at)
  WHERE status = 'holding';

CREATE TABLE table_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES restaurant_tables(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  EXCLUDE USING gist (table_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);

CREATE TABLE payment_guarantees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES reservations(id),
  status guarantee_status NOT NULL DEFAULT 'not_required',
  provider_reference text,
  amount_minor integer CHECK (amount_minor >= 0),
  currency char(3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  actor_type text NOT NULL CHECK (actor_type IN ('guest', 'staff', 'admin', 'system')),
  actor_id text,
  previous_status reservation_status,
  new_status reservation_status,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  channel text NOT NULL,
  status text NOT NULL,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  consent_type text NOT NULL CHECK (consent_type IN ('booking_terms', 'privacy', 'marketing')),
  document_version text NOT NULL,
  accepted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, consent_type, document_version)
);

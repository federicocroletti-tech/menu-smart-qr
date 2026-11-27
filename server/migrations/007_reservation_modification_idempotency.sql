CREATE TABLE reservation_modification_requests (
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  party_size smallint NOT NULL CHECK (party_size > 0),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reservation_id, idempotency_key),
  CHECK (starts_at < ends_at)
);

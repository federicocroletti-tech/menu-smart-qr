CREATE TABLE availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  opens_at time,
  closes_at time,
  closed boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (NOT closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
  ),
  UNIQUE (restaurant_id, service_date)
);

ALTER TABLE reservations
  ADD COLUMN idempotency_request_hash text;

ALTER TABLE notifications
  ADD COLUMN event_type text NOT NULL DEFAULT 'reservation_confirmed'
    CHECK (event_type IN (
      'reservation_confirmed',
      'reservation_modified',
      'reservation_cancelled',
      'reservation_created_by_staff'
    )),
  ADD COLUMN recipient_type text NOT NULL DEFAULT 'guest'
    CHECK (recipient_type IN ('guest', 'staff')),
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN dedupe_key text UNIQUE;

CREATE INDEX notifications_pending_idx
  ON notifications (available_at, created_at)
  WHERE status IN ('queued', 'retry');

CREATE INDEX availability_exceptions_restaurant_date_idx
  ON availability_exceptions (restaurant_id, service_date);

CREATE FUNCTION private.can_manage_restaurant(target_restaurant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.restaurant_id = target_restaurant_id
      AND membership.role IN ('owner', 'admin')
  );
$function$;

REVOKE ALL ON FUNCTION private.can_manage_restaurant(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_restaurant(text)
  TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  reservations,
  guests,
  reservation_tables,
  reservation_events,
  notifications,
  availability_rules,
  opening_hours,
  service_shifts,
  closures,
  table_blocks,
  availability_exceptions
TO authenticated;
GRANT DELETE ON TABLE
  reservation_tables,
  closures,
  table_blocks,
  availability_exceptions
TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE reservation_events_id_seq
  TO authenticated;

ALTER TABLE availability_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY availability_exceptions_read_member_tenant
  ON availability_exceptions FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY availability_exceptions_manage_tenant
  ON availability_exceptions FOR ALL TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY reservations_manage_tenant
  ON reservations FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_restaurant(restaurant_id));
CREATE POLICY reservations_update_manage_tenant
  ON reservations FOR UPDATE TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY guests_insert_manage_tenant
  ON guests FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IS NOT NULL
    AND private.can_manage_restaurant(restaurant_id)
  );

CREATE POLICY reservation_tables_manage_tenant
  ON reservation_tables FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.can_manage_restaurant(reservation.restaurant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.can_manage_restaurant(reservation.restaurant_id)
    )
  );

CREATE POLICY reservation_events_insert_manage_tenant
  ON reservation_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.can_manage_restaurant(reservation.restaurant_id)
    )
  );

CREATE POLICY notifications_insert_manage_tenant
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.can_manage_restaurant(reservation.restaurant_id)
    )
  );

CREATE POLICY availability_rules_manage_tenant
  ON availability_rules FOR UPDATE TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY opening_hours_manage_tenant
  ON opening_hours FOR ALL TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY service_shifts_manage_tenant
  ON service_shifts FOR ALL TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY closures_manage_tenant
  ON closures FOR ALL TO authenticated
  USING (private.can_manage_restaurant(restaurant_id))
  WITH CHECK (private.can_manage_restaurant(restaurant_id));

CREATE POLICY table_blocks_manage_tenant
  ON table_blocks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM restaurant_tables restaurant_table
      JOIN dining_areas area ON area.id = restaurant_table.dining_area_id
      WHERE restaurant_table.id = table_id
        AND private.can_manage_restaurant(area.restaurant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM restaurant_tables restaurant_table
      JOIN dining_areas area ON area.id = restaurant_table.dining_area_id
      WHERE restaurant_table.id = table_id
        AND private.can_manage_restaurant(area.restaurant_id)
    )
  );

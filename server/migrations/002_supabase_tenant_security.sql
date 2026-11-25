CREATE TYPE restaurant_member_role AS ENUM ('owner', 'admin', 'staff');

CREATE TABLE restaurant_memberships (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role restaurant_member_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX restaurant_memberships_restaurant_id_idx
  ON restaurant_memberships (restaurant_id);

REVOKE ALL ON TABLE schema_migrations FROM PUBLIC, anon, authenticated;

ALTER TABLE guests
  ADD COLUMN restaurant_id text REFERENCES restaurants(id) ON DELETE CASCADE;

UPDATE guests g
SET restaurant_id = r.restaurant_id
FROM reservations r
WHERE r.guest_id = g.id
  AND g.restaurant_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM reservations other
    WHERE other.guest_id = g.id
      AND other.restaurant_id <> r.restaurant_id
  );

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION private.has_restaurant_membership(target_restaurant_id text)
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
  );
$function$;

REVOKE ALL ON FUNCTION private.has_restaurant_membership(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_restaurant_membership(text)
  TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE
  restaurant_memberships,
  restaurants,
  dining_areas,
  restaurant_tables,
  table_combinations,
  table_combination_members,
  opening_hours,
  service_shifts,
  availability_rules,
  closures,
  guests,
  reservations,
  reservation_tables,
  table_blocks,
  payment_guarantees,
  reservation_events,
  notifications,
  consent_records
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  restaurant_memberships,
  restaurants,
  dining_areas,
  restaurant_tables,
  table_combinations,
  table_combination_members,
  opening_hours,
  service_shifts,
  availability_rules,
  closures,
  guests,
  reservations,
  reservation_tables,
  table_blocks,
  payment_guarantees,
  reservation_events,
  notifications,
  consent_records
TO authenticated;

ALTER TABLE restaurant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_combination_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_memberships_read_self
  ON restaurant_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY restaurants_read_member_tenant
  ON restaurants
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(id));

CREATE POLICY dining_areas_read_member_tenant
  ON dining_areas
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY restaurant_tables_read_member_tenant
  ON restaurant_tables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM dining_areas area
      WHERE area.id = dining_area_id
        AND private.has_restaurant_membership(area.restaurant_id)
    )
  );

CREATE POLICY table_combinations_read_member_tenant
  ON table_combinations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM dining_areas area
      WHERE area.id = dining_area_id
        AND private.has_restaurant_membership(area.restaurant_id)
    )
  );

CREATE POLICY table_combination_members_read_member_tenant
  ON table_combination_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM table_combinations combination
      JOIN dining_areas area ON area.id = combination.dining_area_id
      WHERE combination.id = combination_id
        AND private.has_restaurant_membership(area.restaurant_id)
    )
  );

CREATE POLICY opening_hours_read_member_tenant
  ON opening_hours
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY service_shifts_read_member_tenant
  ON service_shifts
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY availability_rules_read_member_tenant
  ON availability_rules
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY closures_read_member_tenant
  ON closures
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY guests_read_member_tenant
  ON guests
  FOR SELECT TO authenticated
  USING (
    restaurant_id IS NOT NULL
    AND private.has_restaurant_membership(restaurant_id)
  );

CREATE POLICY reservations_read_member_tenant
  ON reservations
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

CREATE POLICY reservation_tables_read_member_tenant
  ON reservation_tables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.has_restaurant_membership(reservation.restaurant_id)
    )
  );

CREATE POLICY table_blocks_read_member_tenant
  ON table_blocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM restaurant_tables restaurant_table
      JOIN dining_areas area ON area.id = restaurant_table.dining_area_id
      WHERE restaurant_table.id = table_id
        AND private.has_restaurant_membership(area.restaurant_id)
    )
  );

CREATE POLICY payment_guarantees_read_member_tenant
  ON payment_guarantees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.has_restaurant_membership(reservation.restaurant_id)
    )
  );

CREATE POLICY reservation_events_read_member_tenant
  ON reservation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.has_restaurant_membership(reservation.restaurant_id)
    )
  );

CREATE POLICY notifications_read_member_tenant
  ON notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.has_restaurant_membership(reservation.restaurant_id)
    )
  );

CREATE POLICY consent_records_read_member_tenant
  ON consent_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_id
        AND private.has_restaurant_membership(reservation.restaurant_id)
    )
  );

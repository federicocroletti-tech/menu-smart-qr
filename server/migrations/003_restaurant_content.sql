CREATE TABLE restaurant_content (
  restaurant_id text PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  client_data jsonb NOT NULL CHECK (jsonb_typeof(client_data) = 'object'),
  allergens jsonb NOT NULL CHECK (jsonb_typeof(allergens) = 'array'),
  menu_index jsonb NOT NULL CHECK (jsonb_typeof(menu_index) = 'object'),
  menu_categories jsonb NOT NULL CHECK (jsonb_typeof(menu_categories) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservations
  ADD COLUMN guest_notes text CHECK (
    guest_notes IS NULL OR char_length(guest_notes) <= 1000
  );

REVOKE ALL ON TABLE restaurant_content FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE restaurant_content TO authenticated;

ALTER TABLE restaurant_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_content_read_member_tenant
  ON restaurant_content
  FOR SELECT TO authenticated
  USING (private.has_restaurant_membership(restaurant_id));

INSERT INTO restaurants (id, name, time_zone)
VALUES ('pizzeria-vesuvio', 'Pizzeria Vesuvio', 'Europe/Rome')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dining_areas (restaurant_id, name, online_bookable)
VALUES ('pizzeria-vesuvio', 'Sala demo', true)
ON CONFLICT (restaurant_id, name)
DO UPDATE SET online_bookable = EXCLUDED.online_bookable;

INSERT INTO availability_rules (
  restaurant_id,
  hold_minutes,
  maximum_party_size,
  online_booking_enabled,
  cancellation_notice_minutes,
  booking_terms_version,
  privacy_notice_version
)
VALUES (
  'pizzeria-vesuvio',
  7,
  20,
  true,
  NULL,
  'demo-terms-v1',
  'demo-privacy-v1'
)
ON CONFLICT (restaurant_id)
DO UPDATE SET
  hold_minutes = EXCLUDED.hold_minutes,
  maximum_party_size = EXCLUDED.maximum_party_size,
  online_booking_enabled = EXCLUDED.online_booking_enabled,
  cancellation_notice_minutes = EXCLUDED.cancellation_notice_minutes,
  booking_terms_version = EXCLUDED.booking_terms_version,
  privacy_notice_version = EXCLUDED.privacy_notice_version;

INSERT INTO opening_hours (
  restaurant_id,
  day_of_week,
  opens_at,
  closes_at,
  closed
)
SELECT 'pizzeria-vesuvio', schedule.day_of_week, schedule.opens_at,
       schedule.closes_at, schedule.closed
FROM (
  VALUES
    (0, TIME '12:00', TIME '15:30', false),
    (0, TIME '19:00', TIME '23:30', false),
    (1, NULL::time, NULL::time, true),
    (2, TIME '12:00', TIME '15:00', false),
    (2, TIME '19:00', TIME '23:30', false),
    (3, TIME '12:00', TIME '15:00', false),
    (3, TIME '19:00', TIME '23:30', false),
    (4, TIME '12:00', TIME '15:00', false),
    (4, TIME '19:00', TIME '23:30', false),
    (5, TIME '12:00', TIME '15:00', false),
    (5, TIME '19:00', TIME '23:59', false),
    (6, TIME '12:00', TIME '15:30', false),
    (6, TIME '19:00', TIME '23:59', false)
) AS schedule(day_of_week, opens_at, closes_at, closed)
WHERE NOT EXISTS (
  SELECT 1
  FROM opening_hours existing
  WHERE existing.restaurant_id = 'pizzeria-vesuvio'
    AND existing.day_of_week = schedule.day_of_week
    AND existing.opens_at IS NOT DISTINCT FROM schedule.opens_at
    AND existing.closes_at IS NOT DISTINCT FROM schedule.closes_at
    AND existing.closed = schedule.closed
);

INSERT INTO service_shifts (
  restaurant_id,
  day_of_week,
  starts_at,
  ends_at,
  duration_minutes,
  cleanup_minutes,
  slot_interval_minutes,
  enabled
)
SELECT
  'pizzeria-vesuvio',
  schedule.day_of_week,
  schedule.starts_at,
  schedule.ends_at,
  90,
  15,
  30,
  true
FROM (
  VALUES
    (0, TIME '12:00', TIME '15:30'),
    (0, TIME '19:00', TIME '23:30'),
    (2, TIME '12:00', TIME '15:00'),
    (2, TIME '19:00', TIME '23:30'),
    (3, TIME '12:00', TIME '15:00'),
    (3, TIME '19:00', TIME '23:30'),
    (4, TIME '12:00', TIME '15:00'),
    (4, TIME '19:00', TIME '23:30'),
    (5, TIME '12:00', TIME '15:00'),
    (5, TIME '19:00', TIME '23:59'),
    (6, TIME '12:00', TIME '15:30'),
    (6, TIME '19:00', TIME '23:59')
) AS schedule(day_of_week, starts_at, ends_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM service_shifts existing
  WHERE existing.restaurant_id = 'pizzeria-vesuvio'
    AND existing.day_of_week = schedule.day_of_week
    AND existing.starts_at = schedule.starts_at
    AND existing.ends_at = schedule.ends_at
);

INSERT INTO restaurant_tables (
  dining_area_id,
  name,
  shape,
  x,
  y,
  width,
  height,
  min_capacity,
  standard_capacity,
  max_capacity,
  combinable,
  online_bookable,
  active
)
SELECT
  area.id,
  tables.name,
  'square',
  tables.x,
  tables.y,
  0.15,
  0.15,
  tables.min_capacity,
  tables.standard_capacity,
  tables.max_capacity,
  tables.combinable,
  true,
  true
FROM dining_areas area
CROSS JOIN (
  VALUES
    ('T01', 0.08::numeric, 0.12::numeric, 1, 2, 2, false),
    ('T02', 0.30::numeric, 0.12::numeric, 1, 2, 2, false),
    ('T03', 0.52::numeric, 0.12::numeric, 1, 2, 2, false),
    ('T04', 0.74::numeric, 0.12::numeric, 1, 2, 2, false),
    ('T05', 0.08::numeric, 0.52::numeric, 2, 4, 4, true),
    ('T06', 0.30::numeric, 0.52::numeric, 2, 4, 4, true),
    ('T07', 0.52::numeric, 0.52::numeric, 2, 4, 4, true),
    ('T08', 0.74::numeric, 0.52::numeric, 2, 4, 4, true)
) AS tables(name, x, y, min_capacity, standard_capacity, max_capacity, combinable)
WHERE area.restaurant_id = 'pizzeria-vesuvio'
  AND area.name = 'Sala demo'
ON CONFLICT (dining_area_id, name)
DO UPDATE SET
  min_capacity = EXCLUDED.min_capacity,
  standard_capacity = EXCLUDED.standard_capacity,
  max_capacity = EXCLUDED.max_capacity,
  combinable = EXCLUDED.combinable,
  online_bookable = true,
  active = true;

INSERT INTO table_combinations (dining_area_id, name)
SELECT area.id, combinations.name
FROM dining_areas area
CROSS JOIN (
  VALUES
    ('Tavoli demo T05-T06'),
    ('Tavoli demo T07-T08')
) AS combinations(name)
WHERE area.restaurant_id = 'pizzeria-vesuvio'
  AND area.name = 'Sala demo'
ON CONFLICT (dining_area_id, name) DO NOTHING;

INSERT INTO table_combination_members (combination_id, table_id)
SELECT combination.id, restaurant_table.id
FROM dining_areas area
JOIN table_combinations combination
  ON combination.dining_area_id = area.id
JOIN restaurant_tables restaurant_table
  ON restaurant_table.dining_area_id = area.id
JOIN (
  VALUES
    ('Tavoli demo T05-T06', 'T05'),
    ('Tavoli demo T05-T06', 'T06'),
    ('Tavoli demo T07-T08', 'T07'),
    ('Tavoli demo T07-T08', 'T08')
) AS members(combination_name, table_name)
  ON members.combination_name = combination.name
 AND members.table_name = restaurant_table.name
WHERE area.restaurant_id = 'pizzeria-vesuvio'
  AND area.name = 'Sala demo'
ON CONFLICT (combination_id, table_id) DO NOTHING;

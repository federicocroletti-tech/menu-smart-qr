UPDATE availability_rules
SET online_booking_enabled = false
WHERE restaurant_id = 'pizzeria-vesuvio';

UPDATE restaurant_content
SET client_data = jsonb_set(
      jsonb_set(
        client_data,
        '{reservations,enabled}',
        'false'::jsonb,
        true
      ),
      '{settings,featureFlags,enableReservations}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE restaurant_id = 'pizzeria-vesuvio';

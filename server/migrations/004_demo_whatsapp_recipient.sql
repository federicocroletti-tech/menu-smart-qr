UPDATE restaurant_content
SET client_data = jsonb_set(
  client_data,
  '{contacts,whatsapp}',
  to_jsonb('+39 389 465 8277'::text),
  true
),
updated_at = now()
WHERE restaurant_id IN ('pizzeria-vesuvio', 'bar-milano', 'the-corner-pub');

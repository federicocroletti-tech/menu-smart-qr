ALTER TABLE reservations
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE FUNCTION private.bump_reservation_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER reservations_bump_revision
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_reservation_revision();

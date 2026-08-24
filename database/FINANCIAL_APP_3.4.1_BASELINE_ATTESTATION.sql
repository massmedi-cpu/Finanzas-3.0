-- 3.4.1 was applied before migration tracking was used for this release.
-- This migration does not recreate it: it only refuses to proceed unless that
-- already-applied baseline is the active database version.
do $baseline$
begin
  if financial_app.current_app_version() <> '3.4.1' then
    raise exception 'Financial App 3.4.1 baseline is not active';
  end if;
end
$baseline$;

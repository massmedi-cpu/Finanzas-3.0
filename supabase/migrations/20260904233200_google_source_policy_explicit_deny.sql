create policy google_source_policy_deny_direct_access
on financial_app.google_source_policy
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

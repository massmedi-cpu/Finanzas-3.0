drop policy if exists authorized_users_select_self on financial_app.authorized_users;

create policy authorized_users_select_self
on financial_app.authorized_users
for select
to authenticated
using (user_id = (select auth.uid()));

-- Financial App · PRE-001 · permitir al login de infraestructura asumir el rol RLS restringido
-- PostgreSQL 17 crea automáticamente la membership del rol creado por un usuario CREATEROLE
-- con ADMIN TRUE, INHERIT FALSE y SET FALSE. El Edge Gateway necesita SET ROLE explícito.
-- Se mantiene INHERIT FALSE para que los privilegios de financial_app_gateway sólo se usen
-- durante el tramo explícitamente acotado por workspace-context.ts.

grant financial_app_gateway to postgres with inherit false, set true;

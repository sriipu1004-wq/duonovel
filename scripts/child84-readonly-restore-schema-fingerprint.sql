-- Child84: read-only schema and permission fingerprint for independent restore.
-- Run as trusted privileged inspector on source and on a separately restored
-- SAME-TIMESTAMP snapshot, ideally the same PostgreSQL major/extension versions.
-- Returns aggregate counts and SHA-256 of canonicalized catalog definitions,
-- not raw DDL, user content, object names, tokens or private data.
-- Policy role and object owner OIDs are normalized to role NAMES.
-- Includes policy permissiveness, trigger enabled state, and function EXECUTE
-- rights; raw DDL/passwords/individual database rows are never output.
-- Hash equality is evidence of these catalog subsets only; it cannot prove
-- an archive, Auth/Storage bytes, backup freshness, exact row contents or
-- full instance recovery. Never send actual database dumps to CI.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH inventory AS (
  SELECT 'relations'::text AS category,
    format('%s.%s|kind=%s|rls=%s|force=%s',
      n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity)
    AS descriptor
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')
    AND c.relkind IN ('r','p','v','m','S')

  UNION ALL
  SELECT 'columns',
    format('%s.%s.%s|%s|notnull=%s|default=%s',
      n.nspname,c.relname,a.attname,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,
      coalesce(pg_get_expr(d.adbin,d.adrelid),''))
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname IN ('public','storage')
    AND c.relkind IN ('r','p','v','m')
    AND a.attnum>0 AND NOT a.attisdropped

  UNION ALL
  SELECT 'constraints',
    format('%s.%s.%s|%s',
      n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,true))
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'policies',
    format('%s.%s.%s|cmd=%s|roles=%s|qual=%s|check=%s',
      n.nspname,c.relname,p.polname,p.polcmd,
      ARRAY(
        SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC'
                    ELSE pg_get_userbyid(role_oid) END
        FROM unnest(p.polroles) AS roles(role_oid)
        ORDER BY 1
      )::text,
      coalesce(pg_get_expr(p.polqual,p.polrelid),''),
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'functions',
    format('%s.%s(%s)|%s',
      n.nspname,p.proname,
      pg_get_function_identity_arguments(p.oid),
      pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'indexes',
    format('%s.%s|%s',n.nspname,c.relname,
      pg_get_indexdef(i.indexrelid))
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'triggers',
    format('%s.%s.%s|%s',n.nspname,c.relname,t.tgname,
      pg_get_triggerdef(t.oid,true))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')
    AND NOT t.tgisinternal

  UNION ALL
  SELECT 'anon_authenticated_table_privileges',
    format('%s.%s|anon:%s%s%s%s|authenticated:%s%s%s%s',
      n.nspname,c.relname,
      has_table_privilege('anon',c.oid,'SELECT')::int,
      has_table_privilege('anon',c.oid,'INSERT')::int,
      has_table_privilege('anon',c.oid,'UPDATE')::int,
      has_table_privilege('anon',c.oid,'DELETE')::int,
      has_table_privilege('authenticated',c.oid,'SELECT')::int,
      has_table_privilege('authenticated',c.oid,'INSERT')::int,
      has_table_privilege('authenticated',c.oid,'UPDATE')::int,
      has_table_privilege('authenticated',c.oid,'DELETE')::int)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')
    AND c.relkind IN ('r','p','v','m')

  UNION ALL
  -- pg_get_expr does not encode a policy's permissive/restrictive flag.
  SELECT 'policy_admission_flags',
    format('%s.%s.%s|permissive=%s|cmd=%s',
      n.nspname,c.relname,p.polname,p.polpermissive,p.polcmd)
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  -- pg_get_triggerdef does not encode ALTER TABLE ENABLE/DISABLE TRIGGER.
  SELECT 'trigger_activation_flags',
    format('%s.%s.%s|enabled=%s|deferrable=%s',
      n.nspname,c.relname,t.tgname,t.tgenabled,t.tgdeferrable)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage') AND NOT t.tgisinternal

  UNION ALL
  -- Function ACL and SECURITY DEFINER ownership are independent boundaries.
  SELECT 'function_execution_security',
    format('%s.%s(%s)|owner=%s|definer=%s|config=%s|anon=%s|authenticated=%s',
      n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
      pg_get_userbyid(p.proowner),p.prosecdef,coalesce(p.proconfig::text,''),
      has_function_privilege('anon',p.oid,'EXECUTE'),
      has_function_privilege('authenticated',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'schema_usage_security',
    format('%s|owner=%s|anon-usage=%s|auth-usage=%s|anon-create=%s|auth-create=%s',
      n.nspname,pg_get_userbyid(n.nspowner),
      has_schema_privilege('anon',n.oid,'USAGE'),
      has_schema_privilege('authenticated',n.oid,'USAGE'),
      has_schema_privilege('anon',n.oid,'CREATE'),
      has_schema_privilege('authenticated',n.oid,'CREATE'))
  FROM pg_namespace n
  WHERE n.nspname IN ('public','storage')

  UNION ALL
  SELECT 'relation_ownership',
    format('%s.%s|owner=%s|replica-identity=%s|persistence=%s',
      n.nspname,c.relname,pg_get_userbyid(c.relowner),
      c.relreplident,c.relpersistence)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','storage')
    AND c.relkind IN ('r','p','v','m','S')

  UNION ALL
  SELECT 'extensions',
    format('%s|%s',e.extname,e.extversion)
  FROM pg_extension e
)
SELECT category,
  count(*)::integer AS object_count,
  encode(sha256(convert_to(
    string_agg(descriptor,E'\n' ORDER BY descriptor),'UTF8'
  )),'hex') AS schema_sha256
FROM inventory
GROUP BY category ORDER BY category;

COMMIT;

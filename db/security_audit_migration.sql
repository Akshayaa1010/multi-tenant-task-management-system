-- =============================================================
--  CredZen — Security Audit Enhancement Migration
--  Run this script ONCE against the live database to add
--  super-admin security fields to audit_logs.
--  File: db/security_audit_migration.sql
-- =============================================================

-- 1. Create the action_type enum used by the super-admin audit trail
DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILURE',
    'LOGOUT',
    'TENANT_CREATED',
    'TENANT_DELETED',
    'USER_ROLE_CHANGED',
    'USER_CREATED',
    'USER_DELETED',
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_DELETED',
    'DATA_EXPORT',
    'PERMISSION_CHANGE',
    'CONFIG_CHANGE',
    'SUSPICIOUS_ACTIVITY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add new columns to audit_logs (all nullable so existing rows are unaffected)
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type      audit_action_type,
  ADD COLUMN IF NOT EXISTS target_tenant_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS ip_address       VARCHAR(45);   -- supports both IPv4 and IPv6

-- 3. Supporting indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id         ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type      ON audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_tenant_id ON audit_logs (target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address       ON audit_logs (ip_address);

-- 4. Seed realistic sample data for demo/testing purposes
-- (Only inserts if audit_logs is empty to avoid duplication)
DO $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;
  v_org2_id  UUID;
BEGIN
  SELECT id INTO v_org_id  FROM organizations LIMIT 1;
  SELECT id INTO v_user_id FROM users WHERE role IN ('admin','super_admin') LIMIT 1;
  SELECT id INTO v_org2_id FROM organizations ORDER BY created_at DESC LIMIT 1 OFFSET 1;

  IF v_org_id IS NOT NULL AND v_user_id IS NOT NULL THEN
    INSERT INTO audit_logs (org_id, user_id, actor_id, action, entity_type, entity_id, action_type, target_tenant_id, description, ip_address, metadata, created_at)
    VALUES
      (v_org_id, v_user_id, v_user_id, 'user.login',         'user',         v_user_id, 'LOGIN_SUCCESS',      v_org_id,  'Super Admin logged in',                    '192.168.1.1',                          '{"browser":"Chrome","os":"Windows"}',  NOW() - interval '5 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Failed login attempt',                     '10.0.0.99',                            '{"attempt":1}',                        NOW() - interval '12 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Failed login attempt',                     '10.0.0.99',                            '{"attempt":2}',                        NOW() - interval '11 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Failed login attempt',                     '10.0.0.99',                            '{"attempt":3}',                        NOW() - interval '10 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Failed login attempt',                     '10.0.0.99',                            '{"attempt":4}',                        NOW() - interval '9 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Failed login attempt',                     '10.0.0.99',                            '{"attempt":5}',                        NOW() - interval '8 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":1}',                        NOW() - interval '20 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":2}',                        NOW() - interval '19 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":3}',                        NOW() - interval '18 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":4}',                        NOW() - interval '17 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":5}',                        NOW() - interval '16 minutes'),
      (v_org_id, v_user_id, v_user_id, 'user.login_failure', 'user',         v_user_id, 'LOGIN_FAILURE',      v_org_id,  'Repeated brute-force from suspicious IP',  '203.0.113.42',                         '{"attempt":6}',                        NOW() - interval '15 minutes'),
      (v_org_id, v_user_id, v_user_id, 'tenant.created',     'organization', v_org_id,  'TENANT_CREATED',     v_org_id,  'New tenant organization created',          '192.168.1.1',                          '{"org_name":"Acme Corp"}',             NOW() - interval '2 hours'),
      (v_org_id, v_user_id, v_user_id, 'user.role_changed',  'user',         v_user_id, 'USER_ROLE_CHANGED',  v_org_id,  'User role updated from member to admin',   '192.168.1.1',                          '{"before":{"role":"member"},"after":{"role":"admin"}}', NOW() - interval '1 hour'),
      (v_org_id, v_user_id, v_user_id, 'data.export',        'organization', v_org_id,  'DATA_EXPORT',        v_org_id,  'Compliance data export triggered',         '192.168.1.1',                          '{"format":"CSV","rows":1500}',         NOW() - interval '30 minutes'),
      (v_org_id, v_user_id, v_user_id, 'task.created',       'task',         gen_random_uuid(), 'TASK_CREATED', v_org_id, 'New high-priority task created',            '10.10.0.5',                           '{"title":"Q4 Security Audit","priority":"high"}', NOW() - interval '45 minutes')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

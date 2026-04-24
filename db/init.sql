-- =============================================================
--  CredZen — Multi-Tenant Task Manager
--  Database: taskmanager
--  File:     db/init.sql
--  Runs automatically on first `docker compose up` via
--  /docker-entrypoint-initdb.d mount.
-- =============================================================

-- Enable pgcrypto so we can generate UUIDs with gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================
--  ENUM TYPES
--  Created before the tables that depend on them.
-- =============================================================

CREATE TYPE user_role AS ENUM (
    'admin',
    'super_admin',
    'agent',
    'member',
    'viewer'
);

CREATE TYPE task_status AS ENUM (
    'todo',
    'in_progress',
    'done'
);

CREATE TYPE task_priority AS ENUM (
    'low',
    'medium',
    'high'
);


-- =============================================================
--  TABLE: organizations
--  Root tenant entity. Every other record belongs to one org.
-- =============================================================

CREATE TABLE organizations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  organizations             IS 'Top-level tenant entities.';
COMMENT ON COLUMN organizations.id         IS 'Globally unique organization identifier (UUID v4).';
COMMENT ON COLUMN organizations.name       IS 'Human-readable organization name.';
COMMENT ON COLUMN organizations.created_at IS 'Timestamp of organization creation (UTC).';


-- =============================================================
--  TABLE: users
--  Belongs to one organization. Role is enforced per-tenant.
-- =============================================================

CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID        NOT NULL
                                REFERENCES organizations (id)
                                ON DELETE CASCADE,
    email         VARCHAR(320) NOT NULL UNIQUE,
    password_hash TEXT,                         -- NULL for OAuth-only accounts
    role          user_role   NOT NULL DEFAULT 'member',
    name          VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users               IS 'Platform users scoped to a tenant organization.';
COMMENT ON COLUMN users.org_id        IS 'FK → organizations. Determines tenant scope.';
COMMENT ON COLUMN users.email         IS 'User email address, unique per organization.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash; NULL when user authenticates via OAuth only.';
COMMENT ON COLUMN users.role          IS 'Access level within the organization.';

-- Index: fast lookups / listing all users in an org
CREATE INDEX idx_users_org_id ON users (org_id);


-- =============================================================
--  TABLE: tasks
--  Core work items, scoped to an org and optionally assigned
--  to a user within that org.
-- =============================================================

CREATE TABLE tasks (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID         NOT NULL
                               REFERENCES organizations (id)
                               ON DELETE CASCADE,
    created_by  UUID         NOT NULL
                               REFERENCES users (id)
                               ON DELETE RESTRICT,
    assigned_to UUID                                          -- nullable
                               REFERENCES users (id)
                               ON DELETE SET NULL,
    title       VARCHAR(500) NOT NULL,
    description TEXT,
    status      task_status  NOT NULL DEFAULT 'todo',
    priority    task_priority NOT NULL DEFAULT 'medium',
    due_date    DATE,
    attachments JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tasks             IS 'Work items owned by a tenant organization.';
COMMENT ON COLUMN tasks.org_id      IS 'FK → organizations. Tenant scope.';
COMMENT ON COLUMN tasks.created_by  IS 'FK → users. User who created the task.';
COMMENT ON COLUMN tasks.assigned_to IS 'FK → users. Nullable; the user responsible for completion.';
COMMENT ON COLUMN tasks.status      IS 'Workflow state: todo | in_progress | done.';
COMMENT ON COLUMN tasks.priority    IS 'Urgency level: low | medium | high.';
COMMENT ON COLUMN tasks.updated_at  IS 'Updated automatically via trigger on every row change.';

-- Index: list/filter all tasks belonging to an org
CREATE INDEX idx_tasks_org_id      ON tasks (org_id);

-- Supporting indexes for common query patterns
CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tasks_status      ON tasks (org_id, status);
CREATE INDEX idx_tasks_due_date    ON tasks (org_id, due_date) WHERE due_date IS NOT NULL;

-- Trigger function: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
--  TABLE: audit_logs
--  Immutable append-only log of every significant action.
--  metadata (JSONB) carries arbitrary context per action type.
-- =============================================================

CREATE TABLE audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL
                              REFERENCES organizations (id)
                              ON DELETE CASCADE,
    user_id     UUID        NOT NULL
                              REFERENCES users (id)
                              ON DELETE RESTRICT,
    action      VARCHAR(100) NOT NULL,          -- e.g. 'task.created', 'user.role_changed'
    entity_type VARCHAR(100) NOT NULL,          -- e.g. 'task', 'user', 'organization'
    entity_id   UUID        NOT NULL,           -- PK of the affected row
    metadata    JSONB,                          -- arbitrary extra context
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  audit_logs             IS 'Immutable audit trail for all tenant actions.';
COMMENT ON COLUMN audit_logs.org_id      IS 'FK → organizations. Tenant scope.';
COMMENT ON COLUMN audit_logs.user_id     IS 'FK → users. Actor who triggered the event.';
COMMENT ON COLUMN audit_logs.action      IS 'Dot-namespaced action identifier, e.g. task.status_changed.';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of the affected entity (task, user, …).';
COMMENT ON COLUMN audit_logs.entity_id   IS 'UUID of the affected row in its own table.';
COMMENT ON COLUMN audit_logs.metadata    IS 'JSONB bag for action-specific context (before/after values, etc.).';

-- Index: fetch all audit events for an org (primary query pattern)
CREATE INDEX idx_audit_logs_org_id    ON audit_logs (org_id, created_at DESC);

-- Supporting indexes
CREATE INDEX idx_audit_logs_user_id   ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity    ON audit_logs (entity_type, entity_id);
-- GIN index allows efficient JSONB field queries on metadata
CREATE INDEX idx_audit_logs_metadata  ON audit_logs USING GIN (metadata);


-- =============================================================
--  TABLE: oauth_providers
--  Stores linked third-party OAuth identities (e.g. Google).
--  One user can have multiple providers.
-- =============================================================

CREATE TABLE oauth_providers (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL
                                   REFERENCES users (id)
                                   ON DELETE CASCADE,
    provider         VARCHAR(50) NOT NULL,   -- e.g. 'google', 'github'
    provider_user_id VARCHAR(255) NOT NULL,  -- opaque ID from the provider
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A provider identity can only be linked to one user
    CONSTRAINT uq_oauth_provider_identity UNIQUE (provider, provider_user_id)
);

COMMENT ON TABLE  oauth_providers                  IS 'Third-party OAuth identity links per user.';
COMMENT ON COLUMN oauth_providers.user_id          IS 'FK → users. The platform user this identity belongs to.';
COMMENT ON COLUMN oauth_providers.provider         IS 'OAuth provider name, e.g. google, github.';
COMMENT ON COLUMN oauth_providers.provider_user_id IS 'Opaque subject/ID returned by the provider.';

CREATE INDEX idx_oauth_providers_user_id ON oauth_providers (user_id);


-- =============================================================
--  END OF SCHEMA
-- =============================================================

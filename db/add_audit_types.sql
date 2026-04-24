-- Add new values to the audit_action_type enum
ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'TASK_COMPLETED';

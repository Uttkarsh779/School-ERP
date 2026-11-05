-- Principal and Accountant logins (run once, before roles_assign.sql: a new enum value can
-- only be used after the statement that adds it has committed).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRINCIPAL';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';

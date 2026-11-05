-- Login role follows the staff category (same rule as staff/service.ts loginRoleFor):
-- Principal -> PRINCIPAL, Accountant -> ACCOUNTANT, office/admin staff -> ADMIN, everyone
-- else -> TEACHER. Safe to run again.
UPDATE "User" u SET role = CASE t."staffCategory"
    WHEN 'PRINCIPAL' THEN 'PRINCIPAL'::"Role"
    WHEN 'ACCOUNTANT' THEN 'ACCOUNTANT'::"Role"
    WHEN 'ADMIN_STAFF' THEN 'ADMIN'::"Role"
    WHEN 'OFFICE_STAFF' THEN 'ADMIN'::"Role"
    ELSE 'TEACHER'::"Role" END
FROM teachers t
WHERE t."userId" = u.id AND u.role <> 'SUPER_ADMIN';

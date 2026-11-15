-- ONE-TIME MIGRATION, ALREADY APPLIED. DO NOT RUN AGAIN: login role is now set separately from
-- designation on the Staff page, and running this would overwrite those choices.
-- It set the login role from the staff category:
-- Principal -> PRINCIPAL, Accountant -> ACCOUNTANT, office/admin staff -> ADMIN, everyone
-- else -> TEACHER.
UPDATE "User" u SET role = CASE t."staffCategory"
    WHEN 'PRINCIPAL' THEN 'PRINCIPAL'::"Role"
    WHEN 'ACCOUNTANT' THEN 'ACCOUNTANT'::"Role"
    WHEN 'ADMIN_STAFF' THEN 'ADMIN'::"Role"
    WHEN 'OFFICE_STAFF' THEN 'ADMIN'::"Role"
    ELSE 'TEACHER'::"Role" END
FROM teachers t
WHERE t."userId" = u.id AND u.role <> 'SUPER_ADMIN';


-- Clear all test environment detail pages
DELETE FROM invoice_fees WHERE env = 'test';
DELETE FROM client_invoice_fees WHERE env = 'test';
DELETE FROM cases WHERE env = 'test';
DELETE FROM fees WHERE env = 'test';
DELETE FROM invoices WHERE env = 'test';
DELETE FROM client_invoices WHERE env = 'test';

-- Copy production permission_settings to test environment
INSERT INTO permission_settings (id, env, config, updated_at, updated_by)
SELECT gen_random_uuid(), 'test', config, now(), updated_by
FROM permission_settings
WHERE env = 'production'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- If test env already has a row, update it instead
UPDATE permission_settings
SET config = (SELECT config FROM permission_settings WHERE env = 'production' LIMIT 1),
    updated_at = now()
WHERE env = 'test';

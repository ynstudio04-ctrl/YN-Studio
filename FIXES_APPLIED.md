# YN Studio Savings Fixes

Applied fixes in this build:

1. Admin Savings API requests now send the `yn_token` Bearer JWT.
2. Admin Savings approve/reject actions now send authentication and support an optional rejection note.
3. Removed the erroneous `db.transaction(... )()` calls. Transactions are now invoked correctly.
4. Loan interest schedule now uses the schema's `paid_date` column instead of the nonexistent `payment_date` column.
5. Added a safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS paid_date` migration for existing Supabase databases.
6. Approving a Savings "Make an order" request now creates a normal pending YN Studio order and order item, using a `Savings Purchase` system service when needed.
7. The savings amount is deducted atomically with the approval/order creation.

Server JavaScript syntax was checked successfully with Node.js 22.

Before deploying, install dependencies and run the normal client/customer/server builds locally if possible.

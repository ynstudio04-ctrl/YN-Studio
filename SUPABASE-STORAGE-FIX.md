# Supabase Storage memory fix

This build keeps Render for the API/admin/customer apps and moves uploaded images/files to Supabase Storage. PostgreSQL stores URLs instead of large base64 strings.

## Render server environment variables
Add these to `yn-studio-api`:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key (server only)
- `SUPABASE_STORAGE_BUCKET` = `yn-studio-files`

Never put `SUPABASE_SERVICE_ROLE_KEY` in `client/.env` or `customer/.env`.

The server automatically creates the public bucket `yn-studio-files` on first upload if it does not exist.

## Existing files
After setting the variables, run from `server` once:

```cmd
npm run migrate:files
```

This converts existing base64 files in orders, order items, payments, customer requests, and delivery proofs into Storage URLs. It skips files that are already URLs.

## New uploads
New order pictures, order item files, payment receipts, wallet/loan payment proofs, customer request files, and China/Vietnam delivery proofs are uploaded to Storage. PostgreSQL receives only the URL, reducing Render memory usage.

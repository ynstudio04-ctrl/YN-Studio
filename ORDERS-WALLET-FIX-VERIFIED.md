# Orders + Wallet Fix

Based on the uploaded Supabase working folder.

## Admin Create Order
- Fixed browser validation that blocked China/Vietnam order submission because hidden regular-service fields were still marked required.
- China/Vietnam order creation detects whether existing Supabase `services.active` and `services.allow_file_upload` columns are BOOLEAN or INTEGER before creating/updating the internal system service.
- China/Vietnam orders use the existing POST `/orders` flow and create the linked `customer_requests` record used by the dedicated China/Vietnam order pages.

## Wallet
- Preserved the existing Add Money and Deduct Money actions already present in the uploaded build.

Server syntax check passed with Node.js `node --check`.

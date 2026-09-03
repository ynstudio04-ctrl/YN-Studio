# Orders File Lazy-Load Fix

This version keeps file uploads enabled but prevents the normal `/orders` and customer order-list endpoints from fetching large file contents (Base64/receipts/proofs) automatically.

Order list responses include order information and file metadata only. Actual file contents/URLs remain available through the specific order/file/receipt flows.

The goal is to keep Render API memory usage low while preserving the upload feature.

## Local test

1. Keep the existing `server/.env` values.
2. Make sure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET=yn-studio-files` are present.
3. From `server` run `npm run dev`.
4. Open the Admin Orders page and Customer Orders page.
5. Confirm orders load without downloading images.
6. Open a receipt/proof/order-detail page and confirm the file still loads there.

Do not commit `server/.env`.


PDF IMAGE FIX: Receipt previews do not fetch files. When Download PDF is clicked, image files are fetched individually and embedded into the PDF.

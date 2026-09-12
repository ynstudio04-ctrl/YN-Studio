# Order upload + monthly receipt fix

- Admin order files are uploaded one-at-a-time to Supabase Storage via `/uploads/order-file`.
- The `/orders` JSON request now contains URLs instead of Base64 file bodies, preventing large multi-service requests from exhausting Render memory.
- Monthly receipts in Admin → Receipts allow selecting multiple orders for the same customer and combine their items/totals into one PDF.
- Existing order/receipt data is preserved.

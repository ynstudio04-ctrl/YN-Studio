# Order Upload 500 Fix

- `/uploads/order-file` now uses a dedicated Multer middleware with a 20 MB per-file limit.
- Payment receipt uploads remain 10 MB.
- Supabase Storage bucket setup now checks for an existing bucket before creation and safely handles `409` or `400 BucketAlreadyExists`.
- Existing buckets are updated toward a 20 MB limit; a metadata update failure is logged as a warning instead of crashing an upload.

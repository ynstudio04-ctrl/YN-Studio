# Savings payment fix

The customer Savings payment endpoint now:
- uploads to Supabase Storage bucket `yn-studio-files` when available;
- falls back to a database data URL for payment proofs up to 8 MB if Storage is unavailable;
- saves the payment row only after a usable proof value exists;
- returns a clear error for files above the fallback size.

The customer PWA manifest uses `/pwa-icon.png`, and the real PNG is in `customer/public/pwa-icon.png`.

# YN Studio — Supabase Fixed Build

This build uses **Supabase PostgreSQL as the only database** for the API.

## Before running the server locally

1. Copy `server/.env.example` to `server/.env`.
2. Put your real Supabase PostgreSQL connection string in `SUPABASE_DATABASE_URL`.
3. Put a long random value in `JWT_SECRET`.
4. Keep:
   - `CLIENT_URL=https://yn-studio-admin.onrender.com`
   - `CUSTOMER_URL=https://yn-studio-customer.onrender.com`
5. Run:

```bat
cd server
npm install
npm run dev
```

The API should start on port 5000.

### Important

`SUPABASE_DATABASE_URL` must look like:

`postgresql://...`

It is **not** the same thing as the Supabase project URL that starts with `https://`.

The API automatically creates the tables from `server/supabase-schema.sql` when it first connects.

## Render

The included `render.yaml` contains:

- `yn-studio-api`
- `yn-studio-admin`
- `yn-studio-customer`

The admin and customer static services both rewrite all paths to `index.html`, so refreshing routes such as `/dashboard`, `/orders`, `/customer/orders`, and `/customer/coupons` will not show Render's Not Found page.

For the API service, set:

- `SUPABASE_DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `CUSTOMER_URL`

Optional integration variables can remain blank.

## Customer coupons

The customer app now includes:

`/customer/coupons`

Customers can see their assigned coupons, copy a coupon code, and validate a coupon code.

Admin coupon assignment remains available from the customer profile.

## Admin direct China / Vietnam orders

The admin Orders page now supports:

- Regular Service Order
- China Order
- Vietnam Order

For China/Vietnam orders the admin can enter:

- customer
- order date
- price
- product picture
- notes

The API stores the order type and creates the corresponding customer request so the order appears in the China/Vietnam order pages.

## Do not upload

Do not put these in GitHub:

- `server/.env`
- Supabase passwords
- JWT secrets
- OpenAI keys
- Telegram bot tokens

Only commit the `.env.example` files.

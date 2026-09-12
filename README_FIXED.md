# YN Studio — Connected Test Build

This copy is prepared as a clean test build of the YN Studio project.

## What is connected

- Admin/client and customer apps use the same YN Studio API.
- Customer registration and login use the server customer authentication.
- Customer services are loaded from the same `services` table used by the admin.
- Customer requests create records in `customer_requests`.
- Admin customer requests can quote those requests.
- When a customer accepts a quote, a real order is created and the requested service is attached to `order_items`.
- Customer orders read those same orders from `/api/customer/orders`.
- Customer order details and payment receipt uploads use the authenticated customer API.
- Existing customer-request orders missing a service item are repaired automatically on server startup.
- Customer home/profile refresh the account from `/api/customer/me`.
- Customer protected-route token checking now uses `customerToken`.
- API URLs can be changed with `VITE_API_URL`.

## Requirements

Use Node.js 22.x for this project.

Check:

```bat
node -v
```

It should show something like:

```text
v22.x.x
```

## Install

Open three terminals.

### 1. Server

```bat
cd server
npm install
npm start
```

Server:

```text
http://localhost:5000
```

### 2. Admin / Client

```bat
cd client
npm install
npm run dev
```

The Vite client normally runs on:

```text
http://localhost:5173
```

### 3. Customer

```bat
cd customer
npm install
npm run dev -- --port 5174
```

Customer normally runs on:

```text
http://localhost:5174
```

## API URL

Both frontends default to:

```text
http://localhost:5000
```

If needed, copy `.env.example` to `.env` in `client` or `customer` and change:

```text
VITE_API_URL=http://localhost:5000
```

## Important

Do not copy your old `node_modules` into this build.

Install dependencies fresh with Node 22.

The fixed build intentionally does not include `.env` secrets or `node_modules`.

## What was stabilized in this revision

- Added React error boundaries to both admin and customer apps so a single rendering error does not leave a blank page.
- Added consistent page-motion behavior and `prefers-reduced-motion` support.
- Added safer mobile/touch interaction polish and focus/overflow fixes.
- Normalized `VITE_API_URL` trailing slashes so deployments do not accidentally request `//api/...`.
- Expired JWTs now return the user to the correct login screen instead of leaving the UI stuck on failed requests.
- Fixed the admin Savings proof request to use the actual admin token key (`yn_token`).
- Added a JSON API error handler for upload/server errors instead of returning unexpected HTML.
- Removed a duplicate `payment_name` migration statement from the Supabase schema.
- Added `CHECK-WINDOWS.bat` for a clean install + build + lint check.

## Verify before deployment

From the project root on Windows:

```bat
CHECK-WINDOWS.bat
```

If it reports a failure, fix that error before pushing. Render should then use the existing `render.yaml` configuration.

## Push this project to GitHub

If this folder is going into the existing YN Studio repository:

```bat
git init
git branch -M main
git remote -v
```

If `origin` is missing, add the repository you actually own/control:

```bat
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPO.git
```

Then:

```bat
git add .
git status
git commit -m "stabilize customer and admin apps"
git push -u origin main
```

If the folder is already connected to the correct repository, do **not** add another `origin`; just run `git add .`, `git commit`, and `git push`.

If GitHub says `403 Permission denied`, the logged-in GitHub account does not have write access to that repository. Push to a repository owned by the correct account or authenticate Git with an account that has access.

## Render environment

Keep the three Render services from `render.yaml`:

- `yn-studio-api` → `server`
- `yn-studio-admin` → `client`
- `yn-studio-customer` → `customer`

Set `VITE_API_URL` on both static sites to the deployed API URL, for example your `https://...onrender.com` API address **without needing a trailing slash**.

Set the server secrets in Render (`SUPABASE_DATABASE_URL`, `JWT_SECRET`, and any optional AI/Telegram variables you use). Never commit `.env` files or secret keys.

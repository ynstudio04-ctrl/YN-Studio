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

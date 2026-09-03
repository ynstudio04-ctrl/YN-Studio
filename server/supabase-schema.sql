-- YN Studio PostgreSQL schema for Supabase
-- Run this once in Supabase SQL Editor.
-- It mirrors the application's existing SQLite schema and adds the
-- wallet passcode column already used by the current customer app.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'one_time',
  phone TEXT,
  email TEXT UNIQUE,
  password TEXT,
  payment_name TEXT,
  telegram TEXT,
  facebook TEXT,
  address TEXT,
  notes TEXT,
  wallet_pin_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_name TEXT;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_name TEXT;

CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  service_code TEXT,
  category TEXT,
  allow_file_upload INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  public_order_number TEXT,
  payment_amount DOUBLE PRECISION DEFAULT 0,
  payment_receipt TEXT,
  payment_submitted_at TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  updated_at TEXT,
  service_id BIGINT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data TEXT,
  china_status TEXT,
  china_proof TEXT,
  china_proof_uploaded_at TEXT,
  vietnam_status TEXT,
  vietnam_proof TEXT,
  vietnam_proof_uploaded_at TEXT,
  order_type TEXT,
  order_date TEXT,
  product_image TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES services(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  approved_date TEXT,
  notes TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  file_data TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_item_files (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'wallet',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_image TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL DEFAULT 'KHR',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  loan_id BIGINT,
  payment_method TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_withdrawals (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  qr_code TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  product_link TEXT,
  product_image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saving_payments (
  id BIGSERIAL PRIMARY KEY,
  saving_id BIGINT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  payment_method TEXT,
  payment_image TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saving_requests (
  id BIGSERIAL PRIMARY KEY,
  saving_id BIGINT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('withdrawal','order')),
  amount DOUBLE PRECISION NOT NULL,
  note TEXT,
  qr_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_customer ON savings_goals(customer_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_saving_payments_saving ON saving_payments(saving_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_saving_requests_customer ON saving_requests(customer_id, id DESC);

-- Existing installations may already have these tables from an earlier build.
-- Add every column used by the current Savings routes without destroying data.
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS target_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS current_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS product_link TEXT;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS saving_id BIGINT;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS payment_image TEXT;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE saving_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS saving_id BIGINT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS request_type TEXT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE saving_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;


CREATE TABLE IF NOT EXISTS customer_loans (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  start_date TEXT,
  end_date TEXT,
  interest_type TEXT NOT NULL DEFAULT 'fixed',
  interest_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  weekly_interest DOUBLE PRECISION NOT NULL DEFAULT 0,
  principal_remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  payoff_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  remaining_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  loan_status TEXT NOT NULL DEFAULT 'active',
  repayment_frequency TEXT
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES customer_loans(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL DEFAULT 'interest',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  due_date TEXT,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'due',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS paid_date TEXT;

CREATE TABLE IF NOT EXISTS loan_transactions (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES customer_loans(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'payment',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_requests (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  service_id BIGINT REFERENCES services(id),
  product_link TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  details TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  quote_amount DOUBLE PRECISION,
  quote_currency TEXT DEFAULT 'USD',
  quote_status TEXT NOT NULL DEFAULT 'pending',
  quote_note TEXT,
  quoted_at TEXT,
  accepted_at TEXT,
  declined_at TEXT,
  order_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_request_messages (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_id BIGINT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_request_files (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_notifications (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_customer
  ON customer_notifications(customer_id, id DESC);

CREATE TABLE IF NOT EXISTS customer_coupons (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  discount_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  expires_at TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Runtime-safe additions for databases created before the latest app changes.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_pin_hash TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS loan_id BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE customer_loans ADD COLUMN IF NOT EXISTS remaining_balance DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE customer_loans ADD COLUMN IF NOT EXISTS loan_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE customer_loans ADD COLUMN IF NOT EXISTS repayment_frequency TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS allow_file_upload INTEGER NOT NULL DEFAULT 0;


-- Compatibility migrations for older Supabase databases.
-- Older YN Studio versions could have created these flags as BOOLEAN and
-- date fields as DATE/TIMESTAMPTZ. The application intentionally uses
-- SQLite-compatible integer flags and date-only TEXT values, so normalize
-- existing columns without touching their data.
DO $$
DECLARE
  v_type TEXT;
BEGIN
  -- Boolean flags -> INTEGER 0/1.
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='services' AND column_name='active';
  IF v_type = 'boolean' THEN
    ALTER TABLE services ALTER COLUMN active TYPE INTEGER
      USING CASE WHEN active THEN 1 ELSE 0 END;
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='services' AND column_name='allow_file_upload';
  IF v_type = 'boolean' THEN
    ALTER TABLE services ALTER COLUMN allow_file_upload TYPE INTEGER
      USING CASE WHEN allow_file_upload THEN 1 ELSE 0 END;
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='customer_loans' AND column_name='enabled';
  IF v_type = 'boolean' THEN
    ALTER TABLE customer_loans ALTER COLUMN enabled TYPE INTEGER
      USING CASE WHEN enabled THEN 1 ELSE 0 END;
  END IF;

  -- Date-only fields -> TEXT in YYYY-MM-DD form.
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='order_date';
  IF v_type IN ('date','timestamp without time zone','timestamp with time zone') THEN
    ALTER TABLE orders ALTER COLUMN order_date TYPE TEXT
      USING to_char(order_date::timestamp, 'YYYY-MM-DD');
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='customer_loans' AND column_name='start_date';
  IF v_type IN ('date','timestamp without time zone','timestamp with time zone') THEN
    ALTER TABLE customer_loans ALTER COLUMN start_date TYPE TEXT
      USING to_char(start_date::timestamp, 'YYYY-MM-DD');
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='customer_loans' AND column_name='end_date';
  IF v_type IN ('date','timestamp without time zone','timestamp with time zone') THEN
    ALTER TABLE customer_loans ALTER COLUMN end_date TYPE TEXT
      USING to_char(end_date::timestamp, 'YYYY-MM-DD');
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='loan_payments' AND column_name='due_date';
  IF v_type IN ('date','timestamp without time zone','timestamp with time zone') THEN
    ALTER TABLE loan_payments ALTER COLUMN due_date TYPE TEXT
      USING CASE WHEN due_date IS NULL THEN NULL ELSE to_char(due_date::timestamp, 'YYYY-MM-DD') END;
  END IF;

  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='loan_payments' AND column_name='paid_date';
  IF v_type IN ('date','timestamp without time zone','timestamp with time zone') THEN
    ALTER TABLE loan_payments ALTER COLUMN paid_date TYPE TEXT
      USING CASE WHEN paid_date IS NULL THEN NULL ELSE to_char(paid_date::timestamp, 'YYYY-MM-DD') END;
  END IF;
END $$;

-- Ensure future generated IDs continue after imported SQLite IDs.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','customers','services','orders','order_items',
    'order_item_files','receipts','payments','wallets',
    'wallet_transactions','wallet_withdrawals','customer_loans',
    'loan_payments','loan_transactions','customer_requests',
    'customer_request_messages','customer_request_files','customer_coupons','customer_notifications'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT setval(pg_get_serial_sequence(''%I'', ''id''), COALESCE((SELECT MAX(id) FROM %I), 1), true)',
        t, t
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

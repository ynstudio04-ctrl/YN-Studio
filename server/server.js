require("dotenv").config();
console.log("SYSTEM ROUTES REGISTERING...");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const multer = require("multer");
const db = require("./database");
const supabaseDb = require("./database-supabase");
const { uploadDataUrl, uploadBuffer } = require("./supabase-storage");
const app = express();


const configuredOrigins = [
  process.env.CLIENT_URL || "https://yn-studio-admin.onrender.com",
  process.env.CUSTOMER_URL || "https://yn-studio-customer.onrender.com",
  ...(process.env.CORS_ORIGINS || "").split(","),
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
].map((value) => String(value || "").trim()).filter(Boolean);

const allowedOrigins = [...new Set(configuredOrigins)];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("CORS blocked origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in the server environment.");
}

const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-5.6-luna").trim();
const OPENAI_REALTIME_MODEL = String(process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1").trim();
const OPENAI_REALTIME_VOICE = String(process.env.OPENAI_REALTIME_VOICE || "cedar").trim();
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
const pendingAiActions = new Map();
const aiRate = new Map();
function checkAiRateLimit(userKey) {
  const now = Date.now(), windowMs = 60_000, maxRequests = 20;
  const entry = aiRate.get(userKey) || { startedAt: now, count: 0 };
  if (now - entry.startedAt >= windowMs) { entry.startedAt = now; entry.count = 0; }
  entry.count += 1; aiRate.set(userKey, entry);
  return entry.count <= maxRequests;
}

// =========================================================
// CUSTOMER NOTIFICATIONS
// =========================================================
function createCustomerNotification(customerId, type, title, message, data = null) {
  try {
    const id = Number(customerId);
    if (!id || !title || !message) return;
    db.prepare(`
      INSERT INTO customer_notifications
        (customer_id, type, title, message, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      String(type || "system"),
      String(title),
      String(message),
      data == null ? null : JSON.stringify(data)
    );
  } catch (error) {
    // Notifications must never break the primary operation.
    console.error("CUSTOMER NOTIFICATION ERROR:", error);
  }
}
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
/* =========================================================
   GLOBAL API SECURITY GATE
   Every API/data route requires a valid JWT unless explicitly public.
   Admin-only and customer-only routes are separated here so legacy
   routes cannot accidentally bypass authentication.
========================================================= */
function verifyRequestToken(req) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) return null;
  try { return jwt.verify(parts[1], JWT_SECRET); } catch { return null; }
}

function globalApiSecurity(req, res, next) {
  if (req.method === "OPTIONS") return next();
  const path = req.path || "";
  const publicPaths = new Set([
    "/", "/health", "/api/auth/login", "/telegram/webhook", "/api/telegram/webhook",
    "/api/customer/auth/login", "/api/customer/auth/register"
  ]);
  if (publicPaths.has(path)) return next();

  const tokenUser = verifyRequestToken(req);
  if (!tokenUser) return res.status(401).json({ message: "Authentication required" });
  req.user = tokenUser;

  const isCustomer = tokenUser.type === "customer";
  const isAdmin = tokenUser.type === "admin" || tokenUser.type === "administrator";
  const method = req.method.toUpperCase();

  if (path.startsWith("/api/customer/") && !isCustomer) {
    return res.status(403).json({ message: "Customer access required" });
  }
  if ((path.startsWith("/admin/") || path.startsWith("/api/admin/")) && !isAdmin) {
    return res.status(403).json({ message: "Administrator access required" });
  }

  const adminOnly =
    path === "/uploads/order-file" ||
    path === "/payments" || path.startsWith("/payments/") ||
    path === "/customers" || path.startsWith("/customers/") ||
    path === "/receipts" || path.startsWith("/receipts/") ||
    path === "/services" && method !== "GET" || path.startsWith("/services/") ||
    path === "/orders" || path.startsWith("/orders/") ||
    path === "/loans" || path.startsWith("/loans/") ||
    path === "/admin" || path.startsWith("/admin/") || path === "/api/admin" || path.startsWith("/api/admin/") ||
    path === "/china-orders" || path.startsWith("/china-orders/") ||
    path === "/vietnam-orders" || path.startsWith("/vietnam-orders/");
  if (adminOnly && !isAdmin) {
    // Public catalog reads remain available to authenticated customers.
    if (!(path === "/services" && method === "GET")) {
      return res.status(403).json({ message: "Administrator access required" });
    }
  }

  // Customer-originated wallet operations.
  if (path === "/wallet/request" && !isCustomer) {
    return res.status(403).json({ message: "Customer access required" });
  }
  if (/^\/wallet\/\d+\/(add|deduct)$/.test(path) && !isAdmin) {
    return res.status(403).json({ message: "Administrator access required" });
  }
  const walletMatch = path.match(/^\/wallet\/(\d+)(?:\/transactions)?$/);
  if (walletMatch && isCustomer && Number(walletMatch[1]) !== Number(tokenUser.customerId || tokenUser.id)) {
    return res.status(403).json({ message: "You can only access your own wallet" });
  }

  next();
}

app.use(globalApiSecurity);

// =========================================================
// CUSTOMER PAYMENT RECEIPT UPLOAD
// =========================================================

const paymentUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, PNG, WEBP, and PDF files are allowed."
        )
      );
    }

    cb(null, true);
  },
});

// Dedicated order-file upload limit: 20 MB per file.
// Keep payment receipts at their separate 10 MB limit.
const orderFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP, GIF and PDF files are allowed."));
    }
    cb(null, true);
  },
});

// =========================================================
// ADMIN ORDER FILE UPLOAD
// Upload files one-at-a-time to Supabase Storage so a large
// multi-service order never sends many Base64 files through
// the /orders JSON request.
// =========================================================
app.post("/uploads/order-file", orderFileUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file was uploaded.",
      });
    }

    const customerId = Number(req.body?.customer_id) || 0;
    const folder = customerId > 0
      ? `orders/${customerId}/items`
      : "orders/items";

    const url = await uploadBuffer(
      req.file.buffer,
      req.file.mimetype,
      folder,
      req.file.originalname
    );

    return res.status(201).json({
      success: true,
      url,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size: req.file.size,
    });
  } catch (error) {
    console.error("ORDER FILE UPLOAD ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to upload order file.",
    });
  }
});

/* =========================================================
   CUSTOMER REQUEST FILE UPLOAD
========================================================= */

const requestUpload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "image/gif",
    ];

    if (
      !allowedTypes.includes(
        file.mimetype
      )
    ) {

      return cb(
        new Error(
          "Only JPG, PNG, WEBP, GIF and PDF files are allowed."
        )
      );

    }

    cb(null, true);
  },

});
/* =========================================================
   DATABASE MIGRATIONS
========================================================= */

function ensureColumn(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  if (!columns.some((item) => item.name === column)) {
    db.prepare(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    ).run();
  }
}

/* =========================================================
   RUNTIME COMPATIBILITY MIGRATIONS
   Existing databases may predate columns used by current routes.
========================================================= */
try {
  // Savings compatibility migrations for databases created by older builds.
  ensureColumn("customers", "payment_name", "TEXT");
  ensureColumn("customers", "payment_name", "TEXT");
  ensureColumn("payments", "currency", "TEXT");
  ensureColumn("payments", "telegram_verified_at", "TEXT");
  ensureColumn("payments", "telegram_transaction_id", "TEXT");
  ensureColumn("payments", "telegram_update_id", "TEXT");
  ensureColumn("payments", "verification_source", "TEXT");
  ensureColumn("savings_goals", "target_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("savings_goals", "current_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("savings_goals", "product_link", "TEXT");
  ensureColumn("savings_goals", "product_image", "TEXT");
  ensureColumn("savings_goals", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("savings_goals", "updated_at", "TEXT");
  ensureColumn("saving_payments", "payment_method", "TEXT");
  ensureColumn("saving_payments", "payment_image", "TEXT");
  ensureColumn("saving_payments", "status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("saving_payments", "updated_at", "TEXT");
  ensureColumn("saving_requests", "note", "TEXT");
  ensureColumn("saving_requests", "qr_code", "TEXT");
  ensureColumn("saving_requests", "status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("saving_requests", "admin_note", "TEXT");
  ensureColumn("saving_requests", "updated_at", "TEXT");
  ensureColumn("loan_payments", "paid_date", "TEXT");
} catch (error) {
  console.error("SAVINGS/LOAN COMPATIBILITY MIGRATION ERROR:", error);
}

try {
  ensureColumn("orders", "updated_at", "TEXT");
  db.prepare(`UPDATE orders SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL`).run();
  ensureColumn("payments", "loan_id", "INTEGER");
  ensureColumn("payments", "payment_method", "TEXT");
  ensureColumn("customer_loans", "remaining_balance", "REAL NOT NULL DEFAULT 0");
  ensureColumn("customer_loans", "loan_status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("customer_loans", "repayment_frequency", "TEXT");
  ensureColumn("customers", "wallet_pin_hash", "TEXT");
  db.prepare(`
    UPDATE customer_loans
    SET remaining_balance = COALESCE(principal_remaining, total_amount - paid_amount, 0),
        loan_status = COALESCE(NULLIF(status, ''), 'active')
  `).run();
} catch (migrationError) {
  console.error("RUNTIME COMPATIBILITY MIGRATION ERROR:", migrationError);
}
/* =========================================================
   CUSTOMER REQUEST SYSTEM
========================================================= */

/*
   REQUESTS

   A request is NOT an order yet.

   Customer:
   - asks about Vietnam
   - asks about China
   - requests a service

   Admin:
   - chats with customer
   - sends quotation

   Customer:
   - accepts
   - declines

   Only when accepted do we create
   the real order.
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS customer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    request_type TEXT NOT NULL,

    service_id INTEGER,

    product_link TEXT,

    quantity INTEGER NOT NULL DEFAULT 1,

    details TEXT,

    deadline TEXT,

    status TEXT NOT NULL DEFAULT 'open',

    quote_amount REAL,

    quote_currency TEXT DEFAULT 'USD',

    quote_status TEXT NOT NULL DEFAULT 'pending',

    quote_note TEXT,

    quoted_at TEXT,

    accepted_at TEXT,

    declined_at TEXT,

    order_id INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id)
      REFERENCES customers(id)
      ON DELETE CASCADE,

    FOREIGN KEY (service_id)
      REFERENCES services(id)
  )
`);


/* =========================================================
   REQUEST MESSAGES
========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS customer_request_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    request_id INTEGER NOT NULL,

    sender_type TEXT NOT NULL,

    sender_id INTEGER,

    message TEXT NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id)
      REFERENCES customer_requests(id)
      ON DELETE CASCADE
  )
`);


/* =========================================================
   REQUEST FILES
========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS customer_request_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    request_id INTEGER NOT NULL,

    file_name TEXT,

    file_type TEXT,

    file_size INTEGER NOT NULL DEFAULT 0,

    file_data TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id)
      REFERENCES customer_requests(id)
      ON DELETE CASCADE
  )
`);


/* =========================================================
   REQUEST DATABASE MIGRATIONS
========================================================= */

try {

  const requestColumns = [
    ["quote_amount", "REAL"],
    ["quote_currency", "TEXT DEFAULT 'USD'"],
    ["quote_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["quote_note", "TEXT"],
    ["quoted_at", "TEXT"],
    ["accepted_at", "TEXT"],
    ["declined_at", "TEXT"],
    ["order_id", "INTEGER"],
    ["updated_at", "TEXT"],
  ];

  for (
    const [column, definition]
    of requestColumns
  ) {

    const columns = db
      .prepare(
        `PRAGMA table_info(customer_requests)`
      )
      .all();

    const exists =
      columns.some(
        (item) =>
          item.name === column
      );

    if (!exists) {

      db.exec(`
        ALTER TABLE customer_requests
        ADD COLUMN ${column} ${definition}
      `);

      console.log(
        `✅ Added customer_requests.${column}`
      );
    }
  }

} catch (error) {

  console.error(
    "REQUEST DATABASE MIGRATION ERROR:",
    error
  );

}
/* =========================================================
   ADMIN - GET ALL CUSTOMER REQUESTS
========================================================= */

app.get(
  "/admin/customer-requests",
  (req, res) => {
    try {
      const requests = db
        .prepare(`
          SELECT
            r.id,
            r.customer_id,
            r.request_type,
            r.service_id,
            r.product_link,
            r.quantity,
            r.details,
            r.deadline,
            r.status,
            r.quote_amount,
            r.quote_currency,
            r.quote_status,
            r.quote_note,
            r.quoted_at,
            r.accepted_at,
            r.declined_at,
            r.order_id,
            r.created_at,
            r.updated_at,

            c.full_name AS customer_name,
            c.customer_code,
            c.email AS customer_email,
            c.phone AS customer_phone,

            s.name AS service_name,
            s.category AS service_category,
            s.price AS service_price

          FROM customer_requests r

          LEFT JOIN customers c
            ON c.id = r.customer_id

          LEFT JOIN services s
            ON s.id = r.service_id

          ORDER BY
            r.created_at DESC,
            r.id DESC
        `)
        .all();

      /* -----------------------------------------------------
         LAST MESSAGE
      ----------------------------------------------------- */

      const getLastMessage = db.prepare(`
        SELECT
          id,
          sender_type,
          sender_id,
          message,
          created_at

        FROM customer_request_messages

        WHERE request_id = ?

        ORDER BY
          created_at DESC,
          id DESC

        LIMIT 1
      `);

      /* -----------------------------------------------------
         FILES
      ----------------------------------------------------- */

      const getFiles = db.prepare(`
        SELECT
          id,
          file_name,
          file_type,
          file_size,
          created_at

        FROM customer_request_files

        WHERE request_id = ?

        ORDER BY id ASC
      `);

      const result = requests.map((request) => {

        const lastMessage =
          getLastMessage.get(request.id);

        const files =
          getFiles.all(request.id);

        return {
          ...request,

          last_message:
            lastMessage
              ? lastMessage.message
              : null,

          last_message_sender:
            lastMessage
              ? lastMessage.sender_type
              : null,

          last_message_at:
            lastMessage
              ? lastMessage.created_at
              : null,

          files,
        };
      });

      console.log(
        "ADMIN CUSTOMER REQUESTS:",
        result.length
      );

      res.json({
        success: true,
        requests: result,
      });

    } catch (error) {

      console.error(
        "GET ADMIN CUSTOMER REQUESTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load customer requests.",
        error:
          error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - GET ONE CUSTOMER REQUEST
========================================================= */

app.get(
  "/admin/customer-requests/:id",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      const request =
        db.prepare(`
          SELECT
            r.*,

            c.full_name AS customer_name,
            c.customer_code,
            c.email AS customer_email,
            c.phone AS customer_phone,

            s.name AS service_name,
            s.category AS service_category,
            s.price AS service_price,
            s.description AS service_description

          FROM customer_requests r

          LEFT JOIN customers c
            ON c.id = r.customer_id

          LEFT JOIN services s
            ON s.id = r.service_id

          WHERE r.id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      const messages =
        db.prepare(`
          SELECT
            id,
            sender_type,
            sender_id,
            message,
            created_at

          FROM customer_request_messages

          WHERE request_id = ?

          ORDER BY
            created_at ASC,
            id ASC
        `)
        .all(requestId);

      const files =
        db.prepare(`
          SELECT
            id,
            file_name,
            file_type,
            file_size,
            file_data,
            created_at

          FROM customer_request_files

          WHERE request_id = ?

          ORDER BY id ASC
        `)
        .all(requestId);

      res.json({
        success: true,

        request: {
          ...request,
          messages,
          files,
        },
      });

    } catch (error) {

      console.error(
        "GET ADMIN CUSTOMER REQUEST ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load customer request.",
      });
    }
  }
);


/* =========================================================
   ADMIN - SEND MESSAGE
========================================================= */

app.post(
  "/admin/customer-requests/:id/messages",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      const message =
        String(
          req.body.message || ""
        ).trim();

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          message:
            "Message cannot be empty.",
        });
      }

      const request =
        db.prepare(`
          SELECT
            id,
            status

          FROM customer_requests

          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      if (
        request.status === "closed" ||
        request.status === "completed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This request is closed.",
        });
      }

      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'admin',
          NULL,
          ?
        )
      `)
      .run(
        requestId,
        message
      );

      db.prepare(`
        UPDATE customer_requests

        SET
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(requestId);

      res.json({
        success: true,
        message:
          "Message sent.",
      });

    } catch (error) {

      console.error(
        "ADMIN SEND REQUEST MESSAGE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to send message.",
      });
    }
  }
);


/* =========================================================
   ADMIN - SEND QUOTE
========================================================= */

app.put(
  "/admin/customer-requests/:id/quote",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      const amount =
        Number(req.body.amount);

      const currency =
        String(
          req.body.currency || "USD"
        )
        .trim()
        .toUpperCase();

      const note =
        String(
          req.body.note || ""
        ).trim();

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Quote amount must be greater than 0.",
        });
      }

      if (
        currency !== "USD" &&
        currency !== "KHR"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Currency must be USD or KHR.",
        });
      }

      const request =
        db.prepare(`
          SELECT *
          FROM customer_requests
          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      if (request.order_id) {
        return res.status(400).json({
          success: false,
          message:
            "This request already has an order.",
        });
      }

      db.prepare(`
        UPDATE customer_requests

        SET
          quote_amount = ?,
          quote_currency = ?,
          quote_status = 'quoted',
          quote_note = ?,
          quoted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(
        amount,
        currency,
        note,
        requestId
      );

      /* -----------------------------------------------------
         ADD QUOTE MESSAGE
      ----------------------------------------------------- */

      let quoteMessage =
        `Quotation: ${currency} ${amount.toLocaleString()}`;

      if (note) {
        quoteMessage +=
          `\n${note}`;
      }

      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'admin',
          NULL,
          ?
        )
      `)
      .run(
        requestId,
        quoteMessage
      );

      const updatedRequest =
        db.prepare(`
          SELECT *
          FROM customer_requests
          WHERE id = ?
        `)
        .get(requestId);

      res.json({
        success: true,
        message:
          "Quotation sent.",
        request:
          updatedRequest,
      });

    } catch (error) {

      console.error(
        "ADMIN QUOTE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to send quotation.",
        error:
          error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - CLOSE REQUEST
========================================================= */

app.put(
  "/admin/customer-requests/:id/close",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      const request =
        db.prepare(`
          SELECT *
          FROM customer_requests
          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      db.prepare(`
        UPDATE customer_requests

        SET
          status = 'closed',
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(requestId);

      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'system',
          NULL,
          'Request closed by YN Studio.'
        )
      `)
      .run(requestId);

      res.json({
        success: true,
        message:
          "Request closed.",
      });

    } catch (error) {

      console.error(
        "ADMIN CLOSE REQUEST ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to close request.",
      });
    }
  }
);
/* =========================================================
   EXISTING DATABASE COLUMNS
========================================================= */

try {
  /* -------------------------------------------------------
     SERVICES
  ------------------------------------------------------- */

  ensureColumn(
    "services",
    "allow_file_upload",
    "INTEGER NOT NULL DEFAULT 0"
  );
  /* -------------------------------------------------------
     ORDER PAYMENT
  ------------------------------------------------------- */

  ensureColumn(
    "orders",
    "payment_amount",
    "REAL NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "orders",
    "payment_receipt",
    "TEXT"
  );

  ensureColumn(
    "orders",
    "payment_submitted_at",
    "TEXT"
  );

  ensureColumn(
    "orders",
    "payment_status",
    "TEXT NOT NULL DEFAULT 'unpaid'"
  );
  /* -------------------------------------------------------
     ORDERS
  ------------------------------------------------------- */

  ensureColumn(
    "orders",
    "customer_id",
    "INTEGER"
  );

  ensureColumn(
    "orders",
    "service_id",
    "INTEGER"
  );

  ensureColumn(
    "orders",
    "quantity",
    "INTEGER NOT NULL DEFAULT 1"
  );

  ensureColumn(
    "orders",
    "price",
    "REAL NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "orders",
    "total",
    "REAL NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "orders",
    "notes",
    "TEXT"
  );

  ensureColumn(
    "orders",
    "status",
    "TEXT NOT NULL DEFAULT 'pending'"
  );

  ensureColumn(
    "orders",
    "file_name",
    "TEXT"
  );

  ensureColumn(
    "orders",
    "file_type",
    "TEXT"
  );

  ensureColumn(
    "orders",
    "file_size",
    "INTEGER NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "orders",
    "file_data",
    "TEXT"
  );

  /* =======================================================
     NEW MULTI-SERVICE ORDER TABLE
     
     One order can now contain many services.
  ======================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,

    quantity INTEGER NOT NULL DEFAULT 1,

    price REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,

    approved_date TEXT,

    notes TEXT,

    file_name TEXT,
    file_type TEXT,
    file_size INTEGER DEFAULT 0,
    file_data TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id)
      REFERENCES orders(id)
      ON DELETE CASCADE,

    FOREIGN KEY (service_id)
      REFERENCES services(id)
  )
`);
// =========================================================
// FORCE ORDER ITEMS COLUMNS
// =========================================================

const orderItemColumns = [
  ["approved_date", "TEXT"],
  ["file_name", "TEXT"],
  ["file_type", "TEXT"],
  ["file_size", "INTEGER DEFAULT 0"],
  ["file_data", "TEXT"],
];

for (const [column, definition] of orderItemColumns) {
  try {
    const columns = db
      .prepare(`PRAGMA table_info(order_items)`)
      .all();

    const exists = columns.some(
      (col) => col.name === column
    );

    if (!exists) {
      db.exec(`
        ALTER TABLE order_items
        ADD COLUMN ${column} ${definition}
      `);

      console.log(
        `✅ Added order_items.${column}`
      );
    }
  } catch (error) {
    console.error(
      `❌ Failed to add order_items.${column}:`,
      error.message
    );
  }
}
  /* =======================================================
     FILES FOR EACH ORDER ITEM

     This allows every service to have its own files.
  ======================================================= */

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_item_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      order_item_id INTEGER NOT NULL,

      file_name TEXT,

      file_type TEXT,

      file_size INTEGER NOT NULL DEFAULT 0,

      file_data TEXT,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (order_item_id)
        REFERENCES order_items(id)
        ON DELETE CASCADE
    )
  `);

} catch (error) {
  console.error(
    "DATABASE MIGRATION ERROR:",
    error
  );
}

/* =========================================================
   JWT WARNING
========================================================= */

if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set in .env"
  );
}

/* =========================================================
   MIDDLEWARE
========================================================= */




/* =========================================================
   DATA REPAIR
   Restore service links for customer-request orders that
   were created before order_items was attached correctly.
   This is safe to run on every server start.
========================================================= */

function repairCustomerRequestOrderItems() {
  try {
    const missingItems = db.prepare(`
      SELECT
        r.id AS request_id,
        r.order_id,
        r.service_id,
        r.quantity,
        r.details,
        r.quote_amount,
        s.price AS service_price
      FROM customer_requests r
      INNER JOIN orders o
        ON o.id = r.order_id
      INNER JOIN services s
        ON s.id = r.service_id
      WHERE r.order_id IS NOT NULL
        AND r.service_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = r.order_id
            AND oi.service_id = r.service_id
        )
    `).all();

    if (!missingItems.length) return;

    const insertItem = db.prepare(`
      INSERT INTO order_items
        (order_id, service_id, quantity, price, total, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const repair = db.transaction(() => {
      for (const item of missingItems) {
        const quantity = Math.max(
          1,
          Number(item.quantity) || 1
        );

        const servicePrice =
          Number(item.service_price) || 0;

        const quoteAmount = Number(item.quote_amount);

        const total =
          Number.isFinite(quoteAmount) && quoteAmount > 0
            ? quoteAmount
            : Number(
                (servicePrice * quantity).toFixed(2)
              );

        insertItem.run(
          item.order_id,
          item.service_id,
          quantity,
          servicePrice,
          total,
          item.details || ""
        );
      }
    });

    repair();

    console.log(
      `Repaired ${missingItems.length} customer order service link(s).`
    );
  } catch (error) {
    console.error(
      "CUSTOMER ORDER SERVICE REPAIR ERROR:",
      error
    );
  }
}

repairCustomerRequestOrderItems();

app.use(
  express.json({
    limit: "25mb",
  })
);


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const parts = authHeader.split(" ");

  if (
    parts.length !== 2 ||
    parts[0] !== "Bearer" ||
    !parts[1]
  ) {
    return res.status(401).json({
      message: "Invalid authorization header",
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (error) {
    console.error(
      "JWT verification failed:",
      error.message
    );

    return res.status(403).json({
      message: "Invalid or expired token",
    });
  }
}

/* =========================================================
   BASIC ROUTE
========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "YN Studio API is running",
  });
});

/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  (req, res) => {
    try {
      const {
        username,
        password,
        payment_name,
      } = req.body;

      if (
        !username ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Username and password are required",
        });
      }

      const user = db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE username = ?
        `
        )
        .get(username);

      if (!user) {
        return res.status(401).json({
          message:
            "Invalid username or password",
        });
      }

      const validPassword =
        bcrypt.compareSync(
          password,
          user.password
        );

      if (!validPassword) {
        return res.status(401).json({
          message:
            "Invalid username or password",
        });
      }

      const token =
        jwt.sign(
          {
            id: user.id,
            username: user.username,
            type: "admin",
          },
          JWT_SECRET,
          {
            expiresIn: process.env.JWT_EXPIRES_IN || "30d",
          }
        );

      res.json({
        success: true,

        token,

        user: {
          id: user.id,
          username:
            user.username,
        },
      });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Login failed",
      });
    }
  }
);

/* =========================================================
CUSTOMER - REGISTER
========================================================= */

app.post(
  "/api/customer/auth/register",
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        password,
        payment_name,
      } = req.body;

      // ---------------------------------------------
      // VALIDATION
      // ---------------------------------------------

      if (!name || !email || !phone || !password) {
        return res.status(400).json({
          message:
            "Name, email, phone and password are required.",
        });
      }

      const cleanName = String(name).trim();
      const cleanPaymentName = String(payment_name || name || "").trim();

      const cleanEmail = String(email)
        .trim()
        .toLowerCase();

      const cleanPhone = String(phone).trim();

      if (cleanName.length < 2) {
        return res.status(400).json({
          message:
            "Name must contain at least 2 characters.",
        });
      }
      if (cleanPaymentName.length < 2) {
        return res.status(400).json({
          message:
            "Payment name is required and must contain at least 2 characters.",
        });
      }
      if (cleanPaymentName.length < 2) {
        return res.status(400).json({
          message:
            "Payment name is required and must contain at least 2 characters.",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          message:
            "Password must contain at least 6 characters.",
        });
      }

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(cleanEmail)) {
        return res.status(400).json({
          message:
            "Please provide a valid email address.",
        });
      }

      // ---------------------------------------------
      // CHECK EXISTING CUSTOMER
      // ---------------------------------------------

      const existingCustomer =
        await supabaseDb.query(
          `
          SELECT id
          FROM customers
          WHERE LOWER(email) = $1
          LIMIT 1
          `,
          [cleanEmail]
        );

      if (existingCustomer.rows.length > 0) {
        return res.status(409).json({
          message:
            "An account with this email already exists.",
        });
      }

      // ---------------------------------------------
      // CREATE RANDOM CUSTOMER CODE
      // ---------------------------------------------

      let customerCode;
      let codeExists = true;

      while (codeExists) {
        const randomNumber = Math.floor(
          100000 + Math.random() * 900000
        );

        customerCode = `YN-${randomNumber}`;

        const existingCode =
          await supabaseDb.query(
            `
            SELECT id
            FROM customers
            WHERE customer_code = $1
            LIMIT 1
            `,
            [customerCode]
          );

        codeExists =
          existingCode.rows.length > 0;
      }

      // ---------------------------------------------
      // HASH PASSWORD
      // ---------------------------------------------

      const hashedPassword =
        bcrypt.hashSync(password, 10);

      // ---------------------------------------------
      // CREATE CUSTOMER
      // ---------------------------------------------

      const result =
        await supabaseDb.query(
          `
          INSERT INTO customers (
            customer_code,
            full_name,
            customer_type,
            phone,
            email,
            password,
            payment_name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
          `,
          [
            customerCode,
            cleanName,
            "registered",
            cleanPhone,
            cleanEmail,
            hashedPassword,
            cleanPaymentName,
          ]
        );

      const customerId =
        result.rows[0].id;

      // ---------------------------------------------
      // GET CREATED CUSTOMER
      // ---------------------------------------------

      const customerResult =
        await supabaseDb.query(
          `
          SELECT
            id,
            customer_code,
            full_name,
            customer_type,
            phone,
            email,
            created_at
          FROM customers
          WHERE id = $1
          `,
          [customerId]
        );

      const customer =
        customerResult.rows[0];

      return res.status(201).json({
        success: true,
        message:
          "Account created successfully.",
        customer,
      });

    } catch (error) {
      console.error(
        "CUSTOMER REGISTER ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Registration failed.",
        error: error.message,
      });
    }
  }
);

/* =========================================================
CUSTOMER - LOGIN
========================================================= */

app.post(
  "/api/customer/auth/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          message:
            "Email and password are required.",
        });
      }

      const cleanEmail = String(email)
        .trim()
        .toLowerCase();

      // Get customer from Supabase
      const result = await supabaseDb.query(
        `
        SELECT *
        FROM customers
        WHERE LOWER(email) = $1
        LIMIT 1
        `,
        [cleanEmail]
      );

      const customer = result.rows[0];

      if (!customer) {
        return res.status(401).json({
          message:
            "Invalid email or password.",
        });
      }

      if (!customer.password) {
        return res.status(401).json({
          message:
            "This customer account does not have a password.",
        });
      }

      const validPassword =
        bcrypt.compareSync(
          password,
          customer.password
        );

      if (!validPassword) {
        return res.status(401).json({
          message:
            "Invalid email or password.",
        });
      }

      const token = jwt.sign(
        {
          id: customer.id,
          customerId: customer.id,
          type: "customer",
          email: customer.email,
        },
        JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || "30d",
        }
      );

      return res.json({
        success: true,

        token,

        walletPinSet: Boolean(
          customer.wallet_pin_hash
        ),

        customer: {
          id: customer.id,
          customer_code:
            customer.customer_code,
          full_name:
            customer.full_name,
          customer_type:
            customer.customer_type,
          phone:
            customer.phone,
          email:
            customer.email,
          payment_name:
            customer.payment_name || "",
          paymentNameSet:
            Boolean(String(customer.payment_name || "").trim()),
          created_at:
            customer.created_at,
        },
      });

    } catch (error) {
      console.error(
        "CUSTOMER LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Customer login failed.",
      });
    }
  }
);

/* =========================================================
   CUSTOMER - WALLET PASSCODE
   ========================================================= */

app.post(
  "/api/customer/wallet/passcode",
  authenticateToken,
  async (req, res) => {
    try {
      const customerId = Number(req.user.id);
      const passcode = String(
        req.body.passcode || ""
      ).trim();
      const paymentName = String(
        req.body.payment_name || ""
      ).trim();

      if (!customerId) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid customer authentication.",
        });
      }

      if (!/^\d{4}$/.test(passcode)) {
        return res.status(400).json({
          success: false,
          message:
            "Passcode must be exactly 4 digits.",
        });
      }

      // Check customer in Supabase
      const customerResult =
        await supabaseDb.query(
          `
          SELECT id, wallet_pin_hash
          FROM customers
          WHERE id = $1
          LIMIT 1
          `,
          [customerId]
        );

      const customer =
        customerResult.rows[0];

      if (!customer) {
        return res.status(404).json({
          success: false,
          message:
            "Customer not found.",
        });
      }

      if (paymentName.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Please enter the real payment name shown on your bank/payment account.",
        });
      }
      if (paymentName.length > 120) {
        return res.status(400).json({ success:false, message:"Payment name is too long." });
      }

      // Hash the 4-digit passcode
      const hash =
        bcrypt.hashSync(passcode, 10);

      // Save both wallet passcode and payment name.
      await supabaseDb.query(
        `
        UPDATE customers
        SET wallet_pin_hash = $1,
            payment_name = $2
        WHERE id = $3
        `,
        [hash, paymentName, customerId]
      );

      return res.json({
        success: true,
        message:
          "Wallet passcode saved successfully.",
      });

    } catch (error) {
      console.error(
        "SET WALLET PASSCODE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to save wallet passcode.",
      });
    }
  }
);


app.post(
  "/api/customer/wallet/verify-passcode",
  authenticateToken,
  async (req, res) => {
    try {
      const customerId = Number(req.user.id);
      const passcode = String(
        req.body.passcode || ""
      ).trim();

      if (!customerId) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid customer authentication.",
        });
      }

      if (!/^\d{4}$/.test(passcode)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your 4-digit passcode.",
        });
      }

      // Get passcode hash from Supabase
      const customerResult =
        await supabaseDb.query(
          `
          SELECT id, wallet_pin_hash
          FROM customers
          WHERE id = $1
          LIMIT 1
          `,
          [customerId]
        );

      const customer =
        customerResult.rows[0];

      if (
        !customer ||
        !customer.wallet_pin_hash
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Wallet passcode has not been set.",
        });
      }

      // Verify passcode
      const valid =
        bcrypt.compareSync(
          passcode,
          customer.wallet_pin_hash
        );

      if (!valid) {
        return res.status(401).json({
          success: false,
          message:
            "Incorrect passcode.",
        });
      }

      return res.json({
        success: true,
        verified: true,
      });

    } catch (error) {
      console.error(
        "VERIFY WALLET PASSCODE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to verify wallet passcode.",
      });
    }
  }
);
/* =========================================================
   CUSTOMER - CURRENT ACCOUNT
   ========================================================= */

app.get(
  "/api/customer/me",
  authenticateToken,
  (req, res) => {
    try {
      const customerId = Number(req.user.id);

      if (!customerId) {
        return res.status(401).json({
          message: "Invalid customer authentication.",
        });
      }

      const customer = db.prepare(`
        SELECT
          id,
          customer_code,
          full_name,
          customer_type,
          phone,
          email,
          created_at
        FROM customers
        WHERE id = ?
      `).get(customerId);

      if (!customer) {
        return res.status(404).json({
          message: "Customer not found.",
        });
      }

      res.json({
        success: true,
        customer,
      });
    } catch (error) {
      console.error("CUSTOMER ME ERROR:", error);

      res.status(500).json({
        message: "Failed to load customer account.",
      });
    }
  }
);

/* =========================================================
   CUSTOMER - PAYMENT NAME
   ========================================================= */
app.put("/api/customer/payment-name", authenticateToken, async (req, res) => {
  try {
    const customerId = Number(req.user?.customerId || req.user?.id);
    const paymentName = String(req.body?.payment_name || "").trim();
    if (!customerId) return res.status(401).json({success:false,message:"Invalid customer authentication."});
    if (paymentName.length < 2) return res.status(400).json({success:false,message:"Please enter the real name shown on the payment account."});
    if (paymentName.length > 120) return res.status(400).json({success:false,message:"Payment name is too long."});
    await supabaseDb.query(`UPDATE customers SET payment_name=$1 WHERE id=$2`, [paymentName, customerId]);
    return res.json({success:true,payment_name:paymentName});
  } catch (error) {
    console.error("SET PAYMENT NAME ERROR:", error);
    return res.status(500).json({success:false,message:"Unable to save your payment name."});
  }
});

/* =========================================================
   CUSTOMER - PAYMENT NAME
   ========================================================= */
app.put("/api/customer/payment-name", authenticateToken, async (req, res) => {
  try {
    const customerId = Number(req.user?.customerId || req.user?.id);
    const paymentName = String(req.body?.payment_name || "").trim();
    if (!customerId) return res.status(401).json({success:false,message:"Invalid customer authentication."});
    if (paymentName.length < 2) return res.status(400).json({success:false,message:"Please enter the real name shown on the payment account."});
    if (paymentName.length > 120) return res.status(400).json({success:false,message:"Payment name is too long."});
    await supabaseDb.query("UPDATE customers SET payment_name=$1 WHERE id=$2", [paymentName, customerId]);
    return res.json({success:true,payment_name:paymentName});
  } catch (error) {
    console.error("SET PAYMENT NAME ERROR:", error);
    return res.status(500).json({success:false,message:"Unable to save your payment name."});
  }
});

/* =========================================================
   CUSTOMER ORDERS
   ========================================================= */


app.get(
  "/api/customer/orders",
  authenticateToken,
  (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      /*
       * Customer login tokens use the customer ID.
       *
       * Your customer login response should contain:
       * customer.id
       */

      const customerId = req.user.id;

      if (!customerId) {
        return res.status(401).json({
          message: "Invalid customer authentication.",
        });
      }

      const customer = db
        .prepare(`
          SELECT
            id,
            customer_code,
            full_name,
            email,
            phone
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);

      if (!customer) {
        return res.status(404).json({
          message: "Customer not found.",
        });
      }

      const orders = db
        .prepare(`
          SELECT
            o.id,
            o.public_order_number,
            o.customer_id,
            o.status,
            o.vietnam_status,
            o.china_status,
            o.updated_at,
            o.total,
            o.notes,
            o.created_at,
            o.payment_amount,
            o.payment_receipt,
            o.payment_submitted_at,
            o.payment_status,
            COALESCE(
              first_service.name,
              linked_request.service_name,
              CASE linked_request.request_type
                WHEN 'vietnam' THEN 'Vietnam Purchase'
                WHEN 'china' THEN 'China Purchase'
                WHEN 'service' THEN 'Service Request'
                ELSE 'YN Studio Order'
              END
            ) AS service_name,
            linked_request.request_type
          FROM orders o
          LEFT JOIN (
            SELECT oi.order_id, s.name
            FROM order_items oi
            LEFT JOIN services s ON s.id = oi.service_id
            WHERE oi.id = (
              SELECT MIN(oi2.id) FROM order_items oi2 WHERE oi2.order_id = oi.order_id
            )
          ) first_service ON first_service.order_id = o.id
          LEFT JOIN (
            SELECT r.order_id, r.request_type, s.name AS service_name
            FROM customer_requests r
            LEFT JOIN services s ON s.id = r.service_id
            WHERE r.order_id IS NOT NULL
          ) linked_request ON linked_request.order_id = o.id
          WHERE o.customer_id = ?
          ORDER BY o.created_at DESC, o.id DESC
        `)
        .all(customerId);

      res.json({
        success: true,
        customer,
        orders,
      });

    } catch (error) {
      console.error(
        "CUSTOMER ORDERS ERROR:",
        error
      );

      res.status(500).json({
        message: "Failed to load customer orders.",
      });
    }
  }
);
/* =========================================================
   CUSTOMER ORDER DETAILS
========================================================= */

app.get(
  "/api/customer/orders/:id",
  authenticateToken,
  (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      const customerId = req.user.id;
      const orderId = req.params.id;

      if (!customerId) {
        return res.status(401).json({
          message: "Invalid customer authentication.",
        });
      }

      if (!orderId) {
        return res.status(400).json({
          message: "Order ID is required.",
        });
      }

      const customer = db
        .prepare(`
          SELECT
            id,
            customer_code,
            full_name,
            email,
            phone
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);

      if (!customer) {
        return res.status(404).json({
          message: "Customer not found.",
        });
      }

      const order = db
        .prepare(`
          SELECT
            o.id,
            o.public_order_number,
            o.customer_id,
            o.status,
            o.vietnam_status,
            o.china_status,
            o.updated_at,
            o.total,
            o.notes,
            o.created_at,
            o.payment_amount,
            o.payment_receipt,
            o.payment_submitted_at,
            o.payment_status,
            COALESCE(first_service.name, linked_request.service_name,
              CASE linked_request.request_type
                WHEN 'vietnam' THEN 'Vietnam Purchase'
                WHEN 'china' THEN 'China Purchase'
                WHEN 'service' THEN 'Service Request'
                ELSE 'YN Studio Order'
              END) AS service_name,
            linked_request.request_type
          FROM orders o
          LEFT JOIN (
            SELECT oi.order_id, s.name
            FROM order_items oi
            LEFT JOIN services s ON s.id = oi.service_id
            WHERE oi.id = (SELECT MIN(oi2.id) FROM order_items oi2 WHERE oi2.order_id = oi.order_id)
          ) first_service ON first_service.order_id = o.id
          LEFT JOIN (
            SELECT r.order_id, r.request_type, s.name AS service_name
            FROM customer_requests r
            LEFT JOIN services s ON s.id = r.service_id
            WHERE r.order_id IS NOT NULL
          ) linked_request ON linked_request.order_id = o.id
          WHERE o.id = ? AND o.customer_id = ?
        `)
        .get(orderId, customerId);

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      res.json({
        success: true,
        customer,
        order,
      });

    } catch (error) {
      console.error(
        "CUSTOMER ORDER DETAILS ERROR:",
        error
      );

      res.status(500).json({
        message: "Failed to load customer order.",
      });
    }
  }
);
/* =========================================================
   CUSTOMER REQUESTS
========================================================= */


/* =========================================================
   CREATE CUSTOMER REQUEST
========================================================= */

app.post(
  "/api/customer/requests",
  authenticateToken,
  requestUpload.array(
    "files",
    10
  ),
  async (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );

      if (
        !customerId
      ) {

        return res.status(401).json({
          message:
            "Invalid customer authentication.",
        });

      }


      const {
        request_type,
        service_id,
        product_link,
        quantity,
        details,
        deadline,
      } = req.body;


      /* -----------------------------------------------------
         VALIDATE REQUEST TYPE
      ----------------------------------------------------- */

      const allowedTypes = [
        "vietnam",
        "china",
        "service",
      ];

      if (
        !allowedTypes.includes(
          request_type
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid request type.",
        });

      }


      /* -----------------------------------------------------
         CUSTOMER
      ----------------------------------------------------- */

      const customer =
        db.prepare(`
          SELECT
            id,
            full_name,
            customer_code,
            email,
            phone
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);


      if (!customer) {

        return res.status(404).json({
          message:
            "Customer not found.",
        });

      }


      /* -----------------------------------------------------
         SERVICE
      ----------------------------------------------------- */

      let service = null;

      if (
        request_type ===
        "service"
      ) {

        const serviceId =
          Number(
            service_id
          );

        if (
          !serviceId
        ) {

          return res.status(400).json({
            message:
              "Please select a service.",
          });

        }


        service =
          db.prepare(`
            SELECT
              id,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload
            FROM services
            WHERE id = ?
          `)
          .get(serviceId);


        if (!service) {

          return res.status(404).json({
            message:
              "Selected service was not found.",
          });

        }


        if (
          Number(
            service.active
          ) !== 1
        ) {

          return res.status(400).json({
            message:
              "This service is currently unavailable.",
          });

        }

      }


      /* -----------------------------------------------------
         VIETNAM / CHINA
      ----------------------------------------------------- */

      const isProductRequest =
        request_type ===
          "vietnam" ||
        request_type ===
          "china";


      if (
        isProductRequest &&
        !String(
          product_link ||
          ""
        ).trim()
      ) {

        return res.status(400).json({
          message:
            "Product link is required.",
        });

      }


      let requestQuantity =
        Number(
          quantity
        );


      if (
        !Number.isInteger(
          requestQuantity
        ) ||
        requestQuantity < 1
      ) {

        requestQuantity = 1;

      }


      /* -----------------------------------------------------
         DETAILS
      ----------------------------------------------------- */

      const cleanDetails =
        String(
          details ||
          ""
        ).trim();


      if (
        !cleanDetails
      ) {

        return res.status(400).json({
          message:
            "Please describe what you need.",
        });

      }


      /* -----------------------------------------------------
         CREATE REQUEST
      ----------------------------------------------------- */

      const result =
        db.prepare(`
          INSERT INTO customer_requests
          (
            customer_id,
            request_type,
            service_id,
            product_link,
            quantity,
            details,
            deadline,
            status,
            quote_status
          )

          VALUES
          (?, ?, ?, ?, ?, ?, ?, 'open', 'pending')
        `)
        .run(

          customerId,

          request_type,

          service
            ? service.id
            : null,

          isProductRequest
            ? String(
                product_link ||
                ""
              ).trim()
            : null,

          requestQuantity,

          cleanDetails,

          deadline ||
            null

        );


      const requestId =
        Number(
          result.lastInsertRowid
        );


      /* -----------------------------------------------------
         SAVE FILES
      ----------------------------------------------------- */

      if (
        Array.isArray(
          req.files
        ) &&
        req.files.length
      ) {

        const insertFile =
          db.prepare(`
            INSERT INTO
            customer_request_files
            (
              request_id,
              file_name,
              file_type,
              file_size,
              file_data
            )

            VALUES
            (?, ?, ?, ?, ?)
          `);


        for (
          const file
          of req.files
        ) {

          const fileUrl = await uploadBuffer(
            file.buffer,
            file.mimetype,
            `requests/${requestId}`
          );

          insertFile.run(
            requestId,
            file.originalname,
            file.mimetype,
            file.size,
            fileUrl
          );

        }

      }


      /* -----------------------------------------------------
         CREATE FIRST SYSTEM MESSAGE
      ----------------------------------------------------- */

      let firstMessage =
        "New request received.";


      if (
        request_type ===
        "vietnam"
      ) {

        firstMessage =
          "New Vietnam purchase request submitted.";

      }

      if (
        request_type ===
        "china"
      ) {

        firstMessage =
          "New China purchase request submitted.";

      }

      if (
        request_type ===
        "service"
      ) {

        firstMessage =
          `New service request submitted${
            service
              ? ` for ${service.name}`
              : ""
          }.`;

      }


      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (?, 'system', NULL, ?)
      `)
      .run(
        requestId,
        firstMessage
      );


      /* -----------------------------------------------------
         RETURN REQUEST
      ----------------------------------------------------- */

      const createdRequest =
        db.prepare(`
          SELECT

            r.*,

            s.name AS service_name,

            s.category AS service_category,

            c.full_name AS customer_name,

            c.customer_code

          FROM customer_requests r

          LEFT JOIN services s
            ON s.id =
               r.service_id

          LEFT JOIN customers c
            ON c.id =
               r.customer_id

          WHERE r.id = ?
        `)
        .get(
          requestId
        );


      res.status(201).json({

        success: true,

        message:
          "Request submitted successfully.",

        request:
          createdRequest,

      });

    } catch (error) {

      console.error(
        "CREATE CUSTOMER REQUEST ERROR:",
        error
      );

      res.status(500).json({

        message:
          error.message ||
          "Failed to create request.",

      });

    }

  }
);
/* =========================================================
   GET CUSTOMER REQUESTS
========================================================= */

app.get(
  "/api/customer/requests",
  authenticateToken,
  (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );


      if (
        !customerId
      ) {

        return res.status(401).json({
          message:
            "Invalid customer authentication.",
        });

      }


      const requests =
        db.prepare(`
          SELECT

            r.*,

            s.name AS service_name,

            s.category AS service_category,

            c.full_name AS customer_name,

            c.customer_code

          FROM customer_requests r

          LEFT JOIN services s
            ON s.id =
               r.service_id

          LEFT JOIN customers c
            ON c.id =
               r.customer_id

          WHERE r.customer_id = ?

          ORDER BY
            r.created_at DESC,
            r.id DESC
        `)
        .all(
          customerId
        );


      /* -----------------------------------------------------
         ADD LAST MESSAGE
      ----------------------------------------------------- */

      const getLastMessage =
        db.prepare(`
          SELECT
            id,
            sender_type,
            sender_id,
            message,
            created_at

          FROM customer_request_messages

          WHERE request_id = ?

          ORDER BY
            created_at DESC,
            id DESC

          LIMIT 1
        `);


      const result =
        requests.map(
          (request) => {

            const lastMessage =
              getLastMessage.get(
                request.id
              );


            return {

              ...request,

              last_message:
                lastMessage
                  ? lastMessage.message
                  : null,

              last_message_sender:
                lastMessage
                  ? lastMessage.sender_type
                  : null,

              last_message_at:
                lastMessage
                  ? lastMessage.created_at
                  : null,

            };

          }
        );


      res.json({

        success: true,

        requests:
          result,

      });

    } catch (error) {

      console.error(
        "GET CUSTOMER REQUESTS ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Failed to load customer requests.",

      });

    }

  }
);/* =========================================================
   GET CUSTOMER REQUEST DETAILS
========================================================= */

app.get(
  "/api/customer/requests/:id",
  authenticateToken,
  (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );

      const requestId =
        Number(
          req.params.id
        );


      if (
        !customerId
      ) {

        return res.status(401).json({
          message:
            "Invalid customer authentication.",
        });

      }


      if (
        !Number.isInteger(
          requestId
        ) ||
        requestId <= 0
      ) {

        return res.status(400).json({
          message:
            "Invalid request ID.",
        });

      }


      /* -----------------------------------------------------
         REQUEST
      ----------------------------------------------------- */

      const request =
        db.prepare(`
          SELECT

            r.*,

            s.name AS service_name,

            s.category AS service_category,

            s.description AS service_description

          FROM customer_requests r

          LEFT JOIN services s
            ON s.id =
               r.service_id

          WHERE
            r.id = ?

            AND
            r.customer_id = ?
        `)
        .get(
          requestId,
          customerId
        );


      if (!request) {

        return res.status(404).json({
          message:
            "Request not found.",
        });

      }


      /* -----------------------------------------------------
         MESSAGES
      ----------------------------------------------------- */

      const messages =
        db.prepare(`
          SELECT

            id,

            sender_type,

            sender_id,

            message,

            created_at

          FROM customer_request_messages

          WHERE request_id = ?

          ORDER BY
            created_at ASC,
            id ASC
        `)
        .all(
          requestId
        );


      /* -----------------------------------------------------
         FILES
      ----------------------------------------------------- */

      const files =
        db.prepare(`
          SELECT

            id,

            file_name,

            file_type,

            file_size,

            created_at

          FROM customer_request_files

          WHERE request_id = ?

          ORDER BY
            id ASC
        `)
        .all(
          requestId
        );


      res.json({

        success: true,

        request: {

          ...request,

          messages,

          files,

        },

      });

    } catch (error) {

      console.error(
        "GET CUSTOMER REQUEST ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Failed to load request.",

      });

    }

  }
);/* =========================================================
   CUSTOMER SEND REQUEST MESSAGE
========================================================= */

app.post(
  "/api/customer/requests/:id/messages",
  authenticateToken,
  (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );

      const requestId =
        Number(
          req.params.id
        );

      const message =
        String(
          req.body.message ||
          ""
        ).trim();


      if (
        !customerId
      ) {

        return res.status(401).json({
          message:
            "Invalid customer authentication.",
        });

      }


      if (
        !message
      ) {

        return res.status(400).json({
          message:
            "Message cannot be empty.",
        });

      }


      const request =
        db.prepare(`
          SELECT
            id,
            customer_id,
            status,
            quote_status

          FROM customer_requests

          WHERE
            id = ?

            AND
            customer_id = ?
        `)
        .get(
          requestId,
          customerId
        );


      if (!request) {

        return res.status(404).json({
          message:
            "Request not found.",
        });

      }


      if (
        request.status ===
          "closed" ||
        request.status ===
          "completed"
      ) {

        return res.status(400).json({
          message:
            "This request is closed.",
        });

      }


      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (?, 'customer', ?, ?)
      `)
      .run(
        requestId,
        customerId,
        message
      );


      db.prepare(`
        UPDATE customer_requests

        SET
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(
        requestId
      );


      const updatedRequest =
        db.prepare(`
          SELECT *
          FROM customer_requests
          WHERE id = ?
        `)
        .get(
          requestId
        );


      res.json({

        success: true,

        message:
          "Message sent.",

        request:
          updatedRequest,

      });

    } catch (error) {

      console.error(
        "CUSTOMER SEND MESSAGE ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Failed to send message.",

      });

    }

  }
);/* =========================================================
   CUSTOMER ACCEPT QUOTE
========================================================= */

app.post(
  "/api/customer/requests/:id/accept",
  authenticateToken,
  (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );

      const requestId =
        Number(
          req.params.id
        );


      if (
        !customerId
      ) {

        return res.status(401).json({
          message:
            "Invalid customer authentication.",
        });

      }


      const transaction =
        db.transaction(() => {

          /* -------------------------------------------------
             REQUEST
          ------------------------------------------------- */

          const request =
            db.prepare(`
              SELECT *

              FROM customer_requests

              WHERE
                id = ?

                AND
                customer_id = ?
            `)
            .get(
              requestId,
              customerId
            );


          if (!request) {

            throw new Error(
              "Request not found."
            );

          }


          /* -------------------------------------------------
             VALIDATE QUOTE
          ------------------------------------------------- */

          if (
            request.quote_status !==
            "quoted"
          ) {

            throw new Error(
              "There is no active quotation to accept."
            );

          }


          if (
            request.order_id
          ) {

            throw new Error(
              "An order has already been created for this request."
            );

          }


          const quoteAmount =
            Number(
              request.quote_amount
            );


          if (
            !Number.isFinite(
              quoteAmount
            ) ||
            quoteAmount <= 0
          ) {

            throw new Error(
              "Invalid quotation amount."
            );

          }


          /* -------------------------------------------------
             GENERATE PUBLIC ORDER NUMBER
          ------------------------------------------------- */

          function generatePublicOrderNumber() {

            let number;

            let exists;

            do {

              number =
                String(
                  Math.floor(
                    100000 +
                    Math.random() *
                      900000
                  )
                );


              exists =
                db.prepare(`
                  SELECT id
                  FROM orders
                  WHERE public_order_number = ?
                `)
                .get(
                  number
                );

            } while (
              exists
            );


            return number;

          }


          const publicOrderNumber =
            generatePublicOrderNumber();


          /* -------------------------------------------------
             ORDER NOTES
          ------------------------------------------------- */

          let orderNotes =
            `Created from request #${request.id}.`;


          if (
            request.request_type
          ) {

            orderNotes +=
              ` Type: ${request.request_type}.`;

          }


          if (
            request.product_link
          ) {

            orderNotes +=
              ` Product: ${request.product_link}`;

          }


          if (
            request.details
          ) {

            orderNotes +=
              ` ${request.details}`;

          }


          /* -------------------------------------------------
             CREATE REAL ORDER
          ------------------------------------------------- */

          const orderResult =
            db.prepare(`
              INSERT INTO orders
              (
                customer_id,
                status,
                total,
                notes,
                public_order_number,
                payment_amount,
                payment_status
              )

              VALUES
              (
                ?,
                'pending_payment',
                ?,
                ?,
                ?,
                ?,
                'unpaid'
              )
            `)
            .run(

              customerId,

              quoteAmount,

              orderNotes,

              publicOrderNumber,

              quoteAmount

            );


          const orderId =
            Number(
              orderResult.lastInsertRowid
            );

          // Keep the requested service attached to the order.
          // Without this row the Orders UI cannot resolve the service name.
          if (request.service_id) {
            const service = db.prepare(`
              SELECT id, price FROM services WHERE id = ?
            `).get(request.service_id);

            if (service) {
              const qty = Math.max(1, Number(request.quantity) || 1);
              db.prepare(`
                INSERT INTO order_items
                  (order_id, service_id, quantity, price, total, notes)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(
                orderId,
                service.id,
                qty,
                Number(service.price) || 0,
                quoteAmount,
                request.details || ''
              );
            }
          }

          /* -------------------------------------------------
             LINK REQUEST TO ORDER
          ------------------------------------------------- */

          db.prepare(`
            UPDATE customer_requests

            SET

              status = 'accepted',

              quote_status = 'accepted',

              accepted_at =
                CURRENT_TIMESTAMP,

              order_id = ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
          `)
          .run(
            orderId,
            requestId
          );


          /* -------------------------------------------------
             ADD SYSTEM MESSAGE
          ------------------------------------------------- */

          db.prepare(`
            INSERT INTO
            customer_request_messages
            (
              request_id,
              sender_type,
              sender_id,
              message
            )

            VALUES
            (
              ?,
              'system',
              NULL,
              ?
            )
          `)
          .run(
            requestId,
            `Quote accepted. Order #${publicOrderNumber} has been created.`
          );


          return {
            orderId,
            publicOrderNumber,
          };

        });
 transaction();

      /* -----------------------------------------------------
         GET CREATED ORDER
      ----------------------------------------------------- */

     const createdOrderId =
  db.prepare(`
    SELECT order_id
    FROM customer_requests
    WHERE id = ?
      AND customer_id = ?
  `).get(
    requestId,
    customerId
  )?.order_id;

if (!createdOrderId) {
  throw new Error(
    "The quotation was accepted, but the order ID was not saved."
  );
}

const order =
  db.prepare(`
    SELECT *
    FROM orders
    WHERE id = ?
      AND customer_id = ?
  `).get(
    createdOrderId,
    customerId
  );

if (!order) {
  throw new Error(
    `Order was not found after creation. Order ID: ${createdOrderId}`
  );
}



console.log(
  "========================================"
);

console.log(
  "QUOTE ACCEPTED"
);

console.log(
  "Request ID:",
  requestId
);

console.log(
  "Customer ID:",
  customerId
);

console.log(
  "Created Order ID:",
  createdOrderId
);

console.log(
  "Public Order Number:",
  order.public_order_number
);

console.log(
  "========================================"
);
      res.json({

        success: true,

        message:
          "Quotation accepted. Your order has been created.",

        order

      });

    } catch (error) {

      console.error(
        "ACCEPT QUOTE ERROR:",
        error
      );

      res.status(400).json({

        message:
          error.message ||
          "Unable to accept quotation.",

      });

    }

  }
);/* =========================================================
   CUSTOMER DECLINE QUOTE
========================================================= */

app.post(
  "/api/customer/requests/:id/decline",
  authenticateToken,
  (req, res) => {

    try {

      const customerId =
        Number(
          req.user.id
        );

      const requestId =
        Number(
          req.params.id
        );


      const request =
        db.prepare(`
          SELECT *

          FROM customer_requests

          WHERE
            id = ?

            AND
            customer_id = ?
        `)
        .get(
          requestId,
          customerId
        );


      if (!request) {

        return res.status(404).json({
          message:
            "Request not found.",
        });

      }


      if (
        request.quote_status !==
        "quoted"
      ) {

        return res.status(400).json({
          message:
            "There is no active quotation to decline.",
        });

      }


      db.prepare(`
        UPDATE customer_requests

        SET

          quote_status =
            'declined',

          declined_at =
            CURRENT_TIMESTAMP,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(
        requestId
      );


      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'system',
          NULL,
          'Customer declined the quotation.'
        )
      `)
      .run(
        requestId
      );


      const updatedRequest =
        db.prepare(`
          SELECT *
          FROM customer_requests
          WHERE id = ?
        `)
        .get(
          requestId
        );


      res.json({

        success: true,

        message:
          "Quotation declined.",

        request:
          updatedRequest,

      });

    } catch (error) {

      console.error(
        "DECLINE QUOTE ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Unable to decline quotation.",

      });

    }

  }
);
/* =========================================================
   CUSTOMER ORDER PAYMENT
========================================================= */

app.post(
  "/api/customer/orders/:id/payment",
  authenticateToken,
  paymentUpload.single("receipt"),
  async (req, res) => {
    try {
      const customerId = Number(req.user.id);
      const orderId = Number(req.params.id);

      // -----------------------------------------------
      // VALIDATE CUSTOMER
      // -----------------------------------------------

      if (!customerId) {
        return res.status(401).json({
          success: false,
          message: "Invalid customer authentication.",
        });
      }

      // -----------------------------------------------
      // VALIDATE ORDER
      // -----------------------------------------------

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      // -----------------------------------------------
      // REQUIRE RECEIPT
      // -----------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload your payment receipt.",
        });
      }

      // -----------------------------------------------
      // FIND CUSTOMER ORDER
      // -----------------------------------------------

      const order = db
        .prepare(`
          SELECT
            id,
            customer_id,
            status,
            total,
            payment_amount,
            payment_status
          FROM orders
          WHERE id = ?
            AND customer_id = ?
        `)
        .get(orderId, customerId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // -----------------------------------------------
      // MUST BE PENDING PAYMENT
      // -----------------------------------------------

      if (order.status !== "pending_payment") {
        return res.status(400).json({
          success: false,
          message:
            "This order is not currently waiting for payment.",
        });
      }

      // -----------------------------------------------
      // PREVENT DUPLICATE PAYMENT
      // -----------------------------------------------

      if (order.payment_status === "submitted") {
        return res.status(400).json({
          success: false,
          message:
            "A payment receipt has already been submitted.",
        });
      }

      if (order.payment_status === "paid") {
        return res.status(400).json({
          success: false,
          message:
            "This order has already been paid.",
        });
      }

      // -----------------------------------------------
      // CONVERT RECEIPT TO BASE64
      // -----------------------------------------------

      const receiptData = await uploadBuffer(
        req.file.buffer,
        req.file.mimetype,
        `order-payments/${customerId}`
      );

      // -----------------------------------------------
      // SAVE PAYMENT RECEIPT
      // -----------------------------------------------

      db.prepare(`
        UPDATE orders
        SET
          payment_receipt = ?,
          payment_submitted_at = CURRENT_TIMESTAMP,
          payment_status = 'submitted'
        WHERE id = ?
          AND customer_id = ?
      `).run(
        receiptData,
        orderId,
        customerId
      );

      // -----------------------------------------------
      // GET UPDATED ORDER
      // -----------------------------------------------

      const updatedOrder = db
        .prepare(`
          SELECT
            id,
            public_order_number,
            customer_id,
            status,
            total,
            payment_amount,
            payment_submitted_at,
            payment_status
          FROM orders
          WHERE id = ?
            AND customer_id = ?
        `)
        .get(orderId, customerId);

      console.log(
        `CUSTOMER PAYMENT SUBMITTED: ORDER #${orderId}`
      );

      res.json({
        success: true,
        message:
          "Payment receipt submitted successfully.",
        order: updatedOrder,
      });

    } catch (error) {
      console.error(
        "CUSTOMER PAYMENT SUBMISSION ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to submit payment receipt.",
      });
    }
  }
);
/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/auth/me",
  authenticateToken,
  (req, res) => {
    try {
      const user = db
        .prepare(
          `
          SELECT
            id,
            username,
            created_at
          FROM users
          WHERE id = ?
        `
        )
        .get(req.user.id);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(
        "AUTH ME ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to load user",
      });
    }
  }
);

/* =========================================================
   DASHBOARD
========================================================= */

app.get(
  "/api/dashboard",
  authenticateToken,
  (req, res) => {
    try {
      const customers =
        db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM customers
          `
          )
          .get().count;

      const services =
        db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM services
            WHERE active = 1
          `
          )
          .get().count;

      const orders =
        db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM orders
          `
          )
          .get().count;

      const receipts =
        db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM receipts
          `
          )
          .get().count;

      res.json({
        success: true,

        stats: {
          customers,
          services,
          orders,
          receipts,
        },
      });
    } catch (error) {
      console.error(
        "DASHBOARD ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load dashboard",
      });
    }
  }
);

/* =========================================================
   CUSTOMERS
========================================================= */

function generateCustomerCode() {
  const random =
    Math.floor(
      100000 +
        Math.random() *
          900000
    );

  return `YN-${random}`;
}

/* =========================================================
   GET ALL CUSTOMERS
========================================================= */

app.get(
  "/customers",
  (req, res) => {
    try {
      const customers =
        db
          .prepare(
            `
            SELECT
              id,
              customer_code,
              full_name,
              customer_type,
              phone,
              telegram,
              facebook,
              address,
              notes,
              created_at
            FROM customers
            ORDER BY id DESC
          `
          )
          .all();

      res.json(customers);
    } catch (error) {
      console.error(
        "GET /customers error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load customers",
      });
    }
  }
);

/* =========================================================
   GET ONE CUSTOMER
========================================================= */

app.get(
  "/customers/:id",
  (req, res) => {
    try {
      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              customer_code,
              full_name,
              customer_type,
              phone,
              telegram,
              facebook,
              address,
              notes,
              created_at
            FROM customers
            WHERE id = ?
          `
          )
          .get(req.params.id);

      if (!customer) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      res.json(customer);
    } catch (error) {
      console.error(
        "GET /customers/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load customer",
      });
    }
  }
);

/* =========================================================
   ADMIN CUSTOMER ORDER / PAYMENT HISTORY
========================================================= */
app.get("/customers/:id/orders", (req, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({
        error: "Invalid customer ID",
      });
    }

    const orders = db
      .prepare(`
        SELECT
          o.id,
          o.public_order_number,
          o.customer_id,
          o.service_id,
          o.quantity,
          o.price,
          o.total,
          o.status,
          o.notes,
          o.created_at,
          o.updated_at,
          o.payment_amount,
          o.payment_submitted_at,
          o.payment_status,
          o.file_name,
          o.file_type,
          o.file_size,
          o.china_status,
          o.china_proof_uploaded_at,
          o.vietnam_status,
          o.vietnam_proof_uploaded_at,
          o.order_type,
          o.order_date,

          COALESCE(
            /* 1. Try to get the service from the order item */
            (
              SELECT s.name
              FROM order_items oi
              LEFT JOIN services s
                ON s.id = oi.service_id
              WHERE oi.order_id = o.id
              ORDER BY oi.id
              LIMIT 1
            ),

            /* 2. Try to get the service from the customer request */
            (
              SELECT s.name
              FROM customer_requests r
              LEFT JOIN services s
                ON s.id = r.service_id
              WHERE r.order_id = o.id
              ORDER BY r.id DESC
              LIMIT 1
            ),

            /* 3. Fallback based on request type */
            CASE (
              SELECT r.request_type
              FROM customer_requests r
              WHERE r.order_id = o.id
              ORDER BY r.id DESC
              LIMIT 1
            )
              WHEN 'vietnam' THEN 'Vietnam Purchase'
              WHEN 'china' THEN 'China Purchase'
              WHEN 'service' THEN 'Service Request'
              ELSE 'YN Studio Order'
            END
          ) AS service_name

        FROM orders o

        WHERE o.customer_id = ?

        ORDER BY
          o.created_at DESC,
          o.id DESC
      `)
      .all(customerId);

    res.json({
      success: true,
      orders,
    });

  } catch (error) {
    console.error(
      "GET ADMIN CUSTOMER ORDERS ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to load customer orders",
      details: error.message,
    });
  }
});

/* =========================================================
   CREATE CUSTOMER
========================================================= */

app.post(
  "/customers",
  (req, res) => {
    try {
      const {
        full_name,
        customer_type =
          "one_time",
        phone = "",
        telegram = "",
        facebook = "",
        address = "",
        notes = "",
      } = req.body;

      if (
        !full_name ||
        !full_name.trim()
      ) {
        return res.status(400).json({
          error:
            "Customer name is required",
        });
      }

      let customer_code;

      while (true) {
        const code =
          generateCustomerCode();

        const existing =
          db
            .prepare(
              `
              SELECT id
              FROM customers
              WHERE customer_code = ?
            `
            )
            .get(code);

        if (!existing) {
          customer_code = code;
          break;
        }
      }

      const result =
        db
          .prepare(
            `
            INSERT INTO customers
            (
              customer_code,
              full_name,
              customer_type,
              phone,
              telegram,
              facebook,
              address,
              notes
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            customer_code,
            full_name.trim(),
            customer_type,
            String(phone).trim(),
            String(telegram).trim(),
            String(facebook).trim(),
            String(address).trim(),
            String(notes).trim()
          );

      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              customer_code,
              full_name,
              customer_type,
              phone,
              telegram,
              facebook,
              address,
              notes,
              created_at
            FROM customers
            WHERE id = ?
          `
          )
          .get(
            result.lastInsertRowid
          );

      res.status(201).json(
        customer
      );
    } catch (error) {
      console.error(
        "POST /customers error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create customer",
      });
    }
  }
);

/* =========================================================
   UPDATE CUSTOMER
========================================================= */

app.put(
  "/customers/:id",
  (req, res) => {
    try {
      const {
        full_name,
        customer_type,
        phone = "",
        telegram = "",
        facebook = "",
        address = "",
        notes = "",
      } = req.body;

      if (
        !full_name ||
        !full_name.trim()
      ) {
        return res.status(400).json({
          error:
            "Customer name is required",
        });
      }

      const existing =
        db
          .prepare(
            `
            SELECT id
            FROM customers
            WHERE id = ?
          `
          )
          .get(req.params.id);

      if (!existing) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      db.prepare(
        `
        UPDATE customers
        SET
          full_name = ?,
          customer_type = ?,
          phone = ?,
          telegram = ?,
          facebook = ?,
          address = ?,
          notes = ?
        WHERE id = ?
        `
      ).run(
        full_name.trim(),
        customer_type ||
          "one_time",
        String(phone).trim(),
        String(telegram).trim(),
        String(facebook).trim(),
        String(address).trim(),
        String(notes).trim(),
        req.params.id
      );

      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              customer_code,
              full_name,
              customer_type,
              phone,
              telegram,
              facebook,
              address,
              notes,
              created_at
            FROM customers
            WHERE id = ?
          `
          )
          .get(req.params.id);

      res.json(customer);
    } catch (error) {
      console.error(
        "PUT /customers/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update customer",
      });
    }
  }
);

/* =========================================================
   DELETE CUSTOMER
========================================================= */

app.delete(
  "/customers/:id",
  (req, res) => {
    try {
      const existing =
        db
          .prepare(
            `
            SELECT id
            FROM customers
            WHERE id = ?
          `
          )
          .get(req.params.id);

      if (!existing) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      db.prepare(
        `
        DELETE FROM customers
        WHERE id = ?
        `
      ).run(req.params.id);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "DELETE /customers/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to delete customer",
      });
    }
  }
);

/* =========================================================
   END OF PART 1
========================================================= *//* =========================================================
   SERVICES
========================================================= */

function generateServiceCode() {
  const random =
    Math.floor(
      100000 +
        Math.random() *
          900000
    );

  return `SRV-${random}`;
}

/* =========================================================
   GET ALL SERVICES
========================================================= */

app.get(
  "/services",
  (req, res) => {
    try {
      const services =
        db
          .prepare(
            `
            SELECT
              id,
              service_code,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload,
              created_at
            FROM services
            ORDER BY id DESC
            `
          )
          .all();

      res.json(services);
    } catch (error) {
      console.error(
        "GET /services error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load services",
      });
    }
  }
);

/* =========================================================
   GET ONE SERVICE
========================================================= */

app.get(
  "/services/:id",
  (req, res) => {
    try {
      const service =
        db
          .prepare(
            `
            SELECT
              id,
              service_code,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload,
              created_at
            FROM services
            WHERE id = ?
            `
          )
          .get(req.params.id);

      if (!service) {
        return res.status(404).json({
          error:
            "Service not found",
        });
      }

      res.json(service);
    } catch (error) {
      console.error(
        "GET /services/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load service",
      });
    }
  }
);

/* =========================================================
   CREATE SERVICE
========================================================= */

app.post(
  "/services",
  (req, res) => {
    try {
      const {
        name,
        category = "",
        price = 0,
        description = "",
        active = 1,
        allow_file_upload = 0,
      } = req.body;

      /* ---------------------------------------------------
         VALIDATE NAME
      --------------------------------------------------- */

      if (
        !name ||
        !name.trim()
      ) {
        return res.status(400).json({
          error:
            "Service name is required",
        });
      }

      /* ---------------------------------------------------
         VALIDATE PRICE
      --------------------------------------------------- */

      const numericPrice =
        Number(price);

      if (
        Number.isNaN(
          numericPrice
        ) ||
        numericPrice < 0
      ) {
        return res.status(400).json({
          error:
            "Invalid service price",
        });
      }

      /* ---------------------------------------------------
         GENERATE UNIQUE SERVICE CODE
      --------------------------------------------------- */

      let service_code;

      while (true) {
        const code =
          generateServiceCode();

        const existing =
          db
            .prepare(
              `
              SELECT id
              FROM services
              WHERE service_code = ?
              `
            )
            .get(code);

        if (!existing) {
          service_code = code;
          break;
        }
      }

      /* ---------------------------------------------------
         CREATE SERVICE
      --------------------------------------------------- */

      const result =
        db
          .prepare(
            `
            INSERT INTO services
            (
              service_code,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            service_code,
            name.trim(),
            String(
              category
            ).trim(),
            numericPrice,
            String(
              description
            ).trim(),
            active ? 1 : 0,
            allow_file_upload
              ? 1
              : 0
          );

      /* ---------------------------------------------------
         GET CREATED SERVICE
      --------------------------------------------------- */

      const service =
        db
          .prepare(
            `
            SELECT
              id,
              service_code,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload,
              created_at
            FROM services
            WHERE id = ?
            `
          )
          .get(
            result.lastInsertRowid
          );

      res.status(201).json(
        service
      );
    } catch (error) {
      console.error(
        "POST /services error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create service",
      });
    }
  }
);

/* =========================================================
   UPDATE SERVICE
========================================================= */

app.put(
  "/services/:id",
  (req, res) => {
    try {
      const {
        name,
        category = "",
        price = 0,
        description = "",
        active = 1,
        allow_file_upload = 0,
      } = req.body;

      /* ---------------------------------------------------
         VALIDATE NAME
      --------------------------------------------------- */

      if (
        !name ||
        !name.trim()
      ) {
        return res.status(400).json({
          error:
            "Service name is required",
        });
      }

      /* ---------------------------------------------------
         VALIDATE PRICE
      --------------------------------------------------- */

      const numericPrice =
        Number(price);

      if (
        Number.isNaN(
          numericPrice
        ) ||
        numericPrice < 0
      ) {
        return res.status(400).json({
          error:
            "Invalid service price",
        });
      }

      /* ---------------------------------------------------
         CHECK SERVICE
      --------------------------------------------------- */

      const existing =
        db
          .prepare(
            `
            SELECT id
            FROM services
            WHERE id = ?
            `
          )
          .get(req.params.id);

      if (!existing) {
        return res.status(404).json({
          error:
            "Service not found",
        });
      }

      /* ---------------------------------------------------
         UPDATE SERVICE
      --------------------------------------------------- */

      db.prepare(
        `
        UPDATE services
        SET
          name = ?,
          category = ?,
          price = ?,
          description = ?,
          active = ?,
          allow_file_upload = ?
        WHERE id = ?
        `
      ).run(
        name.trim(),
        String(
          category
        ).trim(),
        numericPrice,
        String(
          description
        ).trim(),
        active ? 1 : 0,
        allow_file_upload
          ? 1
          : 0,
        req.params.id
      );

      /* ---------------------------------------------------
         GET UPDATED SERVICE
      --------------------------------------------------- */

      const service =
        db
          .prepare(
            `
            SELECT
              id,
              service_code,
              name,
              category,
              price,
              description,
              active,
              allow_file_upload,
              created_at
            FROM services
            WHERE id = ?
            `
          )
          .get(req.params.id);

      res.json(service);
    } catch (error) {
      console.error(
        "PUT /services/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update service",
      });
    }
  }
);

/* =========================================================
   DELETE SERVICE
========================================================= */

app.delete(
  "/services/:id",
  (req, res) => {
    try {
      /* ---------------------------------------------------
         CHECK SERVICE
      --------------------------------------------------- */

      const existing =
        db
          .prepare(
            `
            SELECT id
            FROM services
            WHERE id = ?
            `
          )
          .get(req.params.id);

      if (!existing) {
        return res.status(404).json({
          error:
            "Service not found",
        });
      }

      /* ---------------------------------------------------
         DELETE SERVICE
      --------------------------------------------------- */

      db.prepare(
        `
        DELETE FROM services
        WHERE id = ?
        `
      ).run(req.params.id);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "DELETE /services/:id error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to delete service",
      });
    }
  }
);

/* =========================================================
   END OF PART 2
========================================================= *//* =========================================================
   WALLET
========================================================= */

/* =========================================================
   GET CUSTOMER WALLET
========================================================= */

app.get(
  "/wallet/:customerId",
  (req, res) => {
    try {
      const customerId =
        Number(req.params.customerId);

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      const wallet =
        db
          .prepare(
            `
            SELECT *
            FROM wallets
            WHERE customer_id = ?
            `
          )
          .get(customerId);

      if (!wallet) {
        return res.json({
          customer_id:
            customerId,
          balance: 0,
        });
      }

      res.json(wallet);
    } catch (error) {
      console.error(
        "GET WALLET ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Wallet error",
      });
    }
  }
);


app.get("/api/customer/wallet/payments", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const payments = db.prepare(`SELECT id, customer_id, type, amount, payment_image, status, created_at, payment_method FROM payments WHERE customer_id = ? AND type = 'wallet' ORDER BY created_at DESC, id DESC`).all(customerId);
    return res.json({ success: true, payments });
  } catch (error) { return res.status(500).json({ message: "Failed to load wallet payments.", details: error.message }); }
});

app.post("/api/customer/wallet/withdraw", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const amount = Number(req.body?.amount);
    const qrCode = String(req.body?.qr_code || '').trim() || null;
    const note = String(req.body?.note || '').trim() || null;
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Enter a valid withdrawal amount." });
    const wallet = db.prepare(`SELECT balance FROM wallets WHERE customer_id = ?`).get(customerId);
    const balance = Number(wallet?.balance || 0);
    if (amount > balance) return res.status(400).json({ message: `Insufficient wallet balance. Available: $${balance.toFixed(2)}.` });
    const pending = db.prepare(`SELECT id FROM wallet_withdrawals WHERE customer_id = ? AND status = 'pending' LIMIT 1`).get(customerId);
    if (pending) return res.status(409).json({ message: "You already have a pending withdrawal request." });
    const result = db.prepare(`INSERT INTO wallet_withdrawals (customer_id, amount, qr_code, note, status) VALUES (?, ?, ?, ?, 'pending')`).run(customerId, amount, qrCode, note);
    return res.status(201).json({ success: true, id: result.lastInsertRowid, status: 'pending' });
  } catch (error) { return res.status(500).json({ message: "Failed to create withdrawal request.", details: error.message }); }
});

app.get("/api/customer/wallet/withdrawals", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const rows = db.prepare(`SELECT * FROM wallet_withdrawals WHERE customer_id = ? ORDER BY created_at DESC, id DESC`).all(customerId);
    return res.json({ success: true, withdrawals: rows });
  } catch (error) { return res.status(500).json({ message: "Failed to load withdrawals.", details: error.message }); }
});

app.put("/admin/wallet/withdrawals/:id/approve", (req, res) => {
  try {
    const id = Number(req.params.id);
    const withdrawal = db.prepare(`SELECT * FROM wallet_withdrawals WHERE id = ?`).get(id);
    if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found." });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: "Withdrawal already processed." });
    db.transaction(() => {
      const wallet = db.prepare(`SELECT balance FROM wallets WHERE customer_id = ?`).get(withdrawal.customer_id);
      const balance = Number(wallet?.balance || 0);
      if (Number(withdrawal.amount) > balance) throw new Error("Customer no longer has enough wallet balance.");
      const newBalance = Number((balance - Number(withdrawal.amount)).toFixed(2));
      db.prepare(`UPDATE wallet_withdrawals SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
      db.prepare(`UPDATE wallets SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`).run(newBalance, withdrawal.customer_id);
      db.prepare(`INSERT INTO wallet_transactions (customer_id, amount, type, description) VALUES (?, ?, 'customer_withdrawal', ?)`).run(withdrawal.customer_id, -Number(withdrawal.amount), withdrawal.note || 'Wallet withdrawal approved');
    });
    createCustomerNotification(withdrawal.customer_id, 'wallet_withdrawal', 'Withdrawal approved', `$${Number(withdrawal.amount).toFixed(2)} withdrawal approved.`, { amount: Number(withdrawal.amount) });
    return res.json({ success: true });
  } catch (error) { return res.status(400).json({ message: error.message || "Failed to approve withdrawal." }); }
});

app.put("/admin/wallet/withdrawals/:id/reject", (req, res) => {
  try {
    const id = Number(req.params.id), note = String(req.body?.admin_note || '').trim() || null;
    const withdrawal = db.prepare(`SELECT * FROM wallet_withdrawals WHERE id = ?`).get(id);
    if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found." });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: "Withdrawal already processed." });
    db.prepare(`UPDATE wallet_withdrawals SET status = 'rejected', note = COALESCE(?, note), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(note, id);
    createCustomerNotification(withdrawal.customer_id, 'wallet_withdrawal', 'Withdrawal rejected', note || 'Your withdrawal request was rejected.', { amount: Number(withdrawal.amount) });
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ message: "Failed to reject withdrawal.", details: error.message }); }
});

/* =========================================================
   ADD MONEY TO WALLET
========================================================= */

app.post(
  "/wallet/:customerId/add",
  (req, res) => {
    try {
      const customerId =
        Number(req.params.customerId);

      const amount =
        Number(req.body.amount);

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      if (
        Number.isNaN(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              full_name
            FROM customers
            WHERE id = ?
            `
          )
          .get(customerId);

      if (!customer) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      db.prepare(
        `
        INSERT OR IGNORE INTO wallets
        (
          customer_id,
          balance
        )
        VALUES (?, 0)
        `
      ).run(customerId);

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE wallets
            SET
              balance =
                balance + ?
            WHERE customer_id = ?
            `
          ).run(
            amount,
            customerId
          );

          try {
            db.prepare(
              `
              INSERT INTO wallet_transactions
              (
                customer_id,
                amount,
                type,
                description
              )
              VALUES (?, ?, ?, ?)
              `
            ).run(
              customerId,
              amount,
              "admin_add",
              "Money added by admin"
            );
          } catch (error) {
            console.log(
              "wallet_transactions table not available"
            );
          }
        });

      transaction();

      createCustomerNotification(
        customerId,
        "wallet_credit",
        "Wallet credited",
        `$${amount.toFixed(2)} was added to your wallet.`,
        { amount }
      );

      const wallet =
        db
          .prepare(
            `
            SELECT *
            FROM wallets
            WHERE customer_id = ?
            `
          )
          .get(customerId);

      res.json({
        success: true,

        customer:
          customer.full_name,

        amount,

        balance:
          wallet.balance,
      });
    } catch (error) {
      console.error(
        "POST wallet add error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to add money",
      });
    }
  }
);

/* =========================================================
   ADMIN DEDUCT MONEY
========================================================= */

app.post(
  "/wallet/:customerId/deduct",
  (req, res) => {
    try {
      const customerId =
        Number(req.params.customerId);

      const amount =
        Number(req.body.amount);

      const description =
        req.body.description ||
        "Money deducted by admin";

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      if (
        !amount ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              full_name,
              customer_code
            FROM customers
            WHERE id = ?
            `
          )
          .get(customerId);

      if (!customer) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      const wallet =
        db
          .prepare(
            `
            SELECT *
            FROM wallets
            WHERE customer_id = ?
            `
          )
          .get(customerId);

      if (!wallet) {
        return res.status(404).json({
          error:
            "Customer wallet not found",
        });
      }

      const currentBalance =
        Number(wallet.balance) ||
        0;

      if (
        amount >
        currentBalance
      ) {
        return res.status(400).json({
          error:
            "Insufficient wallet balance",

          balance:
            currentBalance,

          requested:
            amount,
        });
      }

      const newBalance =
        Number(
          (
            currentBalance -
            amount
          ).toFixed(2)
        );

      const deductMoney =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE wallets
            SET balance = ?
            WHERE customer_id = ?
            `
          ).run(
            newBalance,
            customerId
          );

          db.prepare(
            `
            INSERT INTO wallet_transactions
            (
              customer_id,
              amount,
              type,
              description
            )
            VALUES (?, ?, ?, ?)
            `
          ).run(
            customerId,
            -amount,
            "admin_deduct",
            description
          );
        });

      deductMoney();

      createCustomerNotification(
        customerId,
        "wallet_debit",
        "Wallet payment deducted",
        `$${amount.toFixed(2)} was deducted from your wallet${description ? `: ${description}` : "."}`,
        { amount, balance: newBalance, description }
      );

      res.json({
        success: true,

        customer:
          customer.full_name,

        customer_code:
          customer.customer_code,

        deducted:
          amount,

        balance:
          newBalance,
      });
    } catch (error) {
      console.error(
        "Admin wallet deduct error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to deduct money",
      });
    }
  }
);

/* =========================================================
   WALLET TRANSACTIONS
========================================================= */

app.get(
  "/wallet/:customerId/transactions",
  (req, res) => {
    try {
      const transactions =
        db
          .prepare(
            `
            SELECT *
            FROM wallet_transactions
            WHERE customer_id = ?
            ORDER BY created_at DESC
            `
          )
          .all(
            req.params.customerId
          );

      res.json(
        transactions
      );
    } catch (error) {
      console.error(
        "Wallet transactions error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load transactions",
      });
    }
  }
);

/* =========================================================
   CUSTOMER PAYMENT REQUESTS
========================================================= */

/* =========================================================
   CREATE PAYMENT REQUEST
========================================================= */

app.post(
  "/wallet/request",
  requestUpload.single("payment_proof"),
  async (req, res) => {
    try {
      console.log("WALLET REQUEST BODY:", req.body);
      console.log("WALLET REQUEST FILE:", req.file?.originalname || "none (automatic verification mode)");

      const customerId = Number(req.user?.customerId || req.user?.id);
      const numericAmount = Number(req.body?.amount);
      const paymentMethod =
        req.body?.payment_method || "qr";

      if (!customerId) {
        return res.status(400).json({
          error: "Invalid customer",
        });
      }

      if (
        Number.isNaN(numericAmount) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          error: "Invalid amount",
        });
      }

      const customer = db
        .prepare(`
          SELECT
            id,
            full_name,
            customer_code
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);

      if (!customer) {
        return res.status(404).json({
          error: "Customer not found",
        });
      }

      // The customer no longer needs to upload a receipt. The payment request
      // is matched later against the configured Telegram bank notification.
      const result = db
        .prepare(`
          INSERT INTO payments
          (
            customer_id,
            type,
            amount,
            payment_image,
            status,
            payment_method,
            verification_source
          )
          VALUES (
            ?,
            'wallet',
            ?,
            NULL,
            'pending',
            ?,
            'telegram'
          )
        `)
        .run(
          customerId,
          numericAmount,
          paymentMethod
        );

      console.log(
        "WALLET PAYMENT SUBMITTED:",
        {
          id: result.lastInsertRowid,
          customer_id: customerId,
          amount: numericAmount,
          payment_method: paymentMethod,
        }
      );

      res.status(201).json({
        success: true,
        id: result.lastInsertRowid,
        customer: customer.full_name,
        customer_code: customer.customer_code,
        amount: numericAmount,
        status: "pending",
        verification: "telegram_auto",
        message: "Payment request created. Pay the exact amount and the Telegram notification will be matched automatically when configured.",
      });

    } catch (error) {
      console.error(
        "POST /wallet/request error:",
        error
      );

      res.status(500).json({
        error: "Payment request failed",
        details: error.message,
      });
    }
  }
);

/* =========================================================
   GET PAYMENTS
========================================================= */

app.get(
  "/payments",
  (req, res) => {
    try {
      const payments =
        db
          .prepare(
            `
            SELECT
              payments.*,

              customers.full_name,

              customers.customer_code

            FROM payments

            JOIN customers
              ON customers.id =
                 payments.customer_id

            ORDER BY
              payments.created_at DESC
            `
          )
          .all();

      res.json(payments);
    } catch (error) {
      console.error(
        "GET /payments error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load payments",
      });
    }
  }
);

/* =========================================================
   APPROVE PAYMENT
========================================================= */

app.put(
  "/payments/:id/approve",
  (req, res) => {
    try {
      const paymentId =
        Number(req.params.id);

      const payment =
        db
          .prepare(
            `
            SELECT *
            FROM payments
            WHERE id = ?
            `
          )
          .get(paymentId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Payment not found",
        });
      }

      if (
        payment.status !==
        "pending"
      ) {
        return res.status(400).json({
          error:
            "Payment already processed",
        });
      }

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE payments
            SET status = 'approved'
            WHERE id = ?
            `
          ).run(paymentId);

          db.prepare(
            `
            INSERT OR IGNORE INTO wallets
            (
              customer_id,
              balance
            )
            VALUES (?, 0)
            `
          ).run(
            payment.customer_id
          );

          db.prepare(
            `
            UPDATE wallets
            SET
              balance =
                balance + ?
            WHERE customer_id = ?
            `
          ).run(
            payment.amount,
            payment.customer_id
          );

          try {
            db.prepare(
              `
              INSERT INTO wallet_transactions
              (
                customer_id,
                amount,
                type,
                description
              )
              VALUES (?, ?, ?, ?)
              `
            ).run(
              payment.customer_id,
              payment.amount,
              "customer_topup",
              "Customer payment approved"
            );
          } catch (error) {
            console.log(
              "Wallet transaction history unavailable"
            );
          }
        });

      transaction();

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Approve payment error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to approve payment",
      });
    }
  }
);

/* =========================================================
   REJECT PAYMENT
========================================================= */

app.put(
  "/payments/:id/reject",
  (req, res) => {
    try {
      const paymentId =
        Number(req.params.id);

      const payment =
        db
          .prepare(
            `
            SELECT *
            FROM payments
            WHERE id = ?
            `
          )
          .get(paymentId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Payment not found",
        });
      }

      if (
        payment.status !==
        "pending"
      ) {
        return res.status(400).json({
          error:
            "Payment already processed",
        });
      }

      db.prepare(
        `
        UPDATE payments
        SET status = 'rejected'
        WHERE id = ?
        `
      ).run(paymentId);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Reject payment error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to reject payment",
      });
    }
  }
);
// =========================================================
// ADMIN WALLET PAYMENT MANAGEMENT
// =========================================================

// GET WALLET PAYMENT REQUESTS
app.get("/admin/wallet/payments", (req, res) => {
  try {
    const payments = db
      .prepare(`
        SELECT
          payments.id,
          payments.customer_id,
          payments.type,
          payments.amount,
          payments.status,
          payments.created_at,

          customers.full_name,
          customers.customer_code,
          customers.email,
          customers.phone

        FROM payments

        LEFT JOIN customers
          ON customers.id = payments.customer_id

        WHERE payments.type = 'wallet'

        ORDER BY
          payments.created_at DESC,
          payments.id DESC
      `)
      .all();

    const formattedPayments = payments.map(
      (payment) => ({
        id: payment.id,

        source_id: payment.id,

        payment_type: "wallet",

        type: "Wallet Deposit",

        full_name:
          payment.full_name ||
          "Unknown Customer",

        customer_code:
          payment.customer_code ||
          "",

        customer_id:
          payment.customer_id,

        email:
          payment.email ||
          "",

        phone:
          payment.phone ||
          "",

        amount:
          Number(payment.amount) || 0,

        receipt:
          payment.payment_image ||
          null,

        payment_receipt:
          payment.payment_image ||
          null,

        submitted_at:
          payment.created_at ||
          null,

        created_at:
          payment.created_at ||
          null,

        status:
          payment.status ||
          "pending"
      })
    );

    console.log(
      "ADMIN WALLET PAYMENTS:",
      formattedPayments.length
    );

    res.json(formattedPayments);

  } catch (error) {
    console.error(
      "GET /admin/wallet/payments ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Failed to load wallet payments",

      details:
        error.message
    });
  }
});


// =========================================================
// APPROVE WALLET PAYMENT
// =========================================================

app.put(
  "/admin/wallet/payments/:id/approve",
  (req, res) => {
    try {
      const paymentId =
        Number(req.params.id);

      if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid wallet payment ID"
        });
      }

      const payment =
        db
          .prepare(`
            SELECT
              id,
              customer_id,
              amount,
              payment_image,
              status

            FROM payments

            WHERE id = ?
              AND type = 'wallet'
          `)
          .get(paymentId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Wallet payment not found"
        });
      }

      if (
        payment.status !==
        "pending"
      ) {
        return res.status(400).json({
          error:
            "This wallet payment is not waiting for approval."
        });
      }

      const amount =
        Number(payment.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid wallet payment amount."
        });
      }

      const approveWallet =
        db.transaction(() => {

          // Make sure wallet exists
          db.prepare(`
            INSERT OR IGNORE INTO wallets
            (
              customer_id,
              balance
            )
            VALUES (?, 0)
          `).run(
            payment.customer_id
          );

          // Add money to wallet
          db.prepare(`
            UPDATE wallets

            SET balance =
              ROUND(balance + ?, 2)

            WHERE customer_id = ?
          `).run(
            amount,
            payment.customer_id
          );

          // Mark payment approved
          db.prepare(`
            UPDATE payments

            SET status = 'approved'

            WHERE id = ?
          `).run(
            paymentId
          );

          // Record transaction
          db.prepare(`
            INSERT INTO wallet_transactions
            (
              customer_id,
              amount,
              type,
              description
            )
            VALUES (?, ?, ?, ?)
          `).run(
            payment.customer_id,
            amount,
            "deposit",
            "Wallet deposit approved"
          );
        });

      approveWallet();

      const wallet =
        db
          .prepare(`
            SELECT
              balance

            FROM wallets

            WHERE customer_id = ?
          `)
          .get(
            payment.customer_id
          );

      console.log(
        `WALLET PAYMENT APPROVED: #${paymentId}`
      );

      res.json({
        success: true,

        message:
          "Wallet deposit approved successfully.",

        payment_id:
          paymentId,

        amount,

        customer_id:
          payment.customer_id,

        balance:
          wallet
            ? Number(wallet.balance)
            : 0
      });

    } catch (error) {
      console.error(
        "APPROVE WALLET PAYMENT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to approve wallet payment",

        details:
          error.message
      });
    }
  }
);


// =========================================================
// REJECT WALLET PAYMENT
// =========================================================

app.put(
  "/admin/wallet/payments/:id/reject",
  (req, res) => {
    try {
      const paymentId =
        Number(req.params.id);

      if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid wallet payment ID"
        });
      }

      const payment =
        db
          .prepare(`
            SELECT
              id,
              status

            FROM payments

            WHERE id = ?
              AND type = 'wallet'
          `)
          .get(paymentId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Wallet payment not found"
        });
      }

      if (
        payment.status !==
        "pending"
      ) {
        return res.status(400).json({
          error:
            "This wallet payment is not waiting for approval."
        });
      }

      db.prepare(`
        UPDATE payments

        SET status = 'rejected'

        WHERE id = ?
      `).run(paymentId);

      console.log(
        `WALLET PAYMENT REJECTED: #${paymentId}`
      );

      res.json({
        success: true,

        message:
          "Wallet payment rejected successfully."
      });

    } catch (error) {
      console.error(
        "REJECT WALLET PAYMENT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to reject wallet payment",

        details:
          error.message
      });
    }
  }
);
// =========================================================
// ADMIN PAYMENT PROOF (LAZY LOAD)
// =========================================================

app.get("/admin/order-payments/:id/proof", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order payment ID" });
    }
    const row = db.prepare(`SELECT payment_receipt FROM orders WHERE id = ? LIMIT 1`).get(id);
    if (!row) return res.status(404).json({ error: "Order payment not found" });
    if (!row.payment_receipt) return res.status(404).json({ error: "This payment does not have a receipt." });
    res.json({ receipt: row.payment_receipt });
  } catch (error) {
    console.error("GET ORDER PAYMENT PROOF ERROR:", error);
    res.status(500).json({ error: "Failed to load payment proof" });
  }
});

app.get("/admin/wallet/payments/:id/proof", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid wallet payment ID" });
    }
    const row = db.prepare(`SELECT payment_image FROM payments WHERE id = ? AND type = 'wallet' LIMIT 1`).get(id);
    if (!row) return res.status(404).json({ error: "Wallet payment not found" });
    if (!row.payment_image) return res.status(404).json({ error: "This payment does not have a receipt." });
    res.json({ receipt: row.payment_image });
  } catch (error) {
    console.error("GET WALLET PAYMENT PROOF ERROR:", error);
    res.status(500).json({ error: "Failed to load payment proof" });
  }
});

app.get("/admin/loan-payments/:id/proof", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid loan payment ID" });
    }
    const row = db.prepare(`SELECT payment_image FROM payments WHERE id = ? AND type = 'loan' LIMIT 1`).get(id);
    if (!row) return res.status(404).json({ error: "Loan payment not found" });
    if (!row.payment_image) return res.status(404).json({ error: "This payment does not have a receipt." });
    res.json({ receipt: row.payment_image });
  } catch (error) {
    console.error("GET LOAN PAYMENT PROOF ERROR:", error);
    res.status(500).json({ error: "Failed to load payment proof" });
  }
});

// =========================================================
// ADMIN ORDER PAYMENT MANAGEMENT
// =========================================================

// GET CUSTOMER ORDER PAYMENTS
app.get("/admin/order-payments", (req, res) => {
  try {
    const payments = db
      .prepare(`
        SELECT
          orders.id,
          orders.public_order_number,
          orders.customer_id,
          orders.total,
          orders.payment_amount,
          orders.payment_submitted_at,
          orders.payment_status,
          orders.status AS order_status,

          customers.full_name,
          customers.customer_code,
          customers.email,
          customers.phone

        FROM orders

        LEFT JOIN customers
          ON customers.id = orders.customer_id

        WHERE orders.payment_status IN (
          'submitted',
          'paid',
          'rejected'
        )

        ORDER BY
          orders.payment_submitted_at DESC,
          orders.id DESC
      `)
      .all();

    const formattedPayments = payments.map(
      (payment) => ({
        id: payment.id,

        order_id: payment.id,

        order_number:
          payment.public_order_number ||
          payment.id,

        full_name:
          payment.full_name ||
          "Unknown Customer",

        customer_code:
          payment.customer_code ||
          "",

        email:
          payment.email ||
          "",

        phone:
          payment.phone ||
          "",

        amount: Number(
          payment.payment_amount ??
          payment.total ??
          0
        ),

        receipt: null,

        submitted_at:
          payment.payment_submitted_at ||
          null,

        type: "Order Payment",

        status:
          payment.payment_status ===
          "submitted"
            ? "pending"
            : payment.payment_status,

        order_status:
          payment.order_status
      })
    );

    console.log(
      "ADMIN ORDER PAYMENTS:",
      formattedPayments.length
    );

    res.json(formattedPayments);

  } catch (error) {
    console.error(
      "GET /admin/order-payments ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Failed to load order payments",

      details:
        error.message
    });
  }
});


// =========================================================
// APPROVE CUSTOMER ORDER PAYMENT
// =========================================================

app.put(
  "/admin/order-payments/:id/approve",
  (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order payment ID"
        });
      }

      const payment =
        db
          .prepare(`
            SELECT
              id,
              customer_id,
              payment_status,
              payment_amount,
              payment_receipt

            FROM orders

            WHERE id = ?
          `)
          .get(orderId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Order payment not found"
        });
      }

      if (
        payment.payment_status !==
        "submitted"
      ) {
        return res.status(400).json({
          error:
            "This payment is not waiting for approval."
        });
      }

      if (!payment.payment_receipt) {
        return res.status(400).json({
          error:
            "This order does not have a payment receipt."
        });
      }
const orderInfo = db.prepare(`
  SELECT
    id,
    payment_status,
    status
  FROM orders
  WHERE id = ?
`).get(orderId);

const requestInfo = db.prepare(`
  SELECT
    request_type
  FROM customer_requests
  WHERE order_id = ?
  LIMIT 1
`).get(orderId);

const requestType =
  String(
    requestInfo?.request_type ||
    ""
  ).toLowerCase();

const isVietnamOrder =
  requestType === "vietnam";

const isChinaOrder =
  requestType === "china";

let nextOrderStatus =
  "processing";

if (
  isVietnamOrder ||
  isChinaOrder
) {
  nextOrderStatus =
    "ordered";
}

db.prepare(`
  UPDATE orders
  SET
    payment_status = 'paid',
    status = ?
  WHERE id = ?
`).run(
  nextOrderStatus,
  orderId
);

      const updatedPayment =
        db
          .prepare(`
            SELECT
              orders.*,
              customers.full_name,
              customers.customer_code

            FROM orders

            LEFT JOIN customers
              ON customers.id =
                 orders.customer_id

            WHERE orders.id = ?
          `)
          .get(orderId);

      console.log(
        `ORDER PAYMENT APPROVED: ORDER #${orderId}`
      );

      res.json({
        success: true,

        message:
          "Order payment approved successfully.",

        payment:
          updatedPayment
      });

    } catch (error) {

      console.error(
        "APPROVE ORDER PAYMENT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to approve order payment",

        details:
          error.message
      });
    }
  }
);

// =========================================================
// CHINA ORDER FIELDS
// =========================================================

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN china_status TEXT
  `);
} catch (error) {
  // Column already exists.
}

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN china_proof TEXT
  `);
} catch (error) {
  // Column already exists.
}

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN china_proof_uploaded_at TEXT
  `);
} catch (error) {
  // Column already exists.
}


// =========================================================
// CHINA ORDER STATUS
// =========================================================

app.put(
  "/orders/:id/china-status",
  (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      const {
        status,
      } = req.body || {};

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order ID.",
        });
      }

      const allowedStatuses = [
        "pending_payment",
        "ordered",
        "arrive_china_warehouse",
        "delivering",
        "customs_clearance",
        "customs_clearance_done",
        "arrive_pp_warehouse",
        "delivering_to_customer",
        "completed",
      ];

      if (
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          error:
            "Invalid China order status.",
        });
      }

      const order =
        db.prepare(`
          SELECT
            id,
            status,
            payment_status,
            china_status,
            china_proof
          FROM orders
          WHERE id = ?
        `).get(orderId);

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found.",
        });
      }


      // =====================================================
      // CHECK REQUEST TYPE
      // =====================================================

      const request =
        db.prepare(`
          SELECT
            request_type
          FROM customer_requests
          WHERE order_id = ?
          LIMIT 1
        `).get(orderId);

      const requestType =
        String(
          request?.request_type ||
          ""
        ).toLowerCase();

      if (
        requestType !== "china"
      ) {
        return res.status(400).json({
          error:
            "This is not a China order.",
        });
      }


      // =====================================================
      // CURRENT STATUS
      // =====================================================

      let currentStatus =
        order.china_status ||
        order.status ||
        "pending_payment";


      // Old paid orders that were
      // saved as processing should
      // behave as ordered.

      if (
        currentStatus ===
          "processing" &&
        order.payment_status ===
          "paid"
      ) {
        currentStatus =
          "ordered";
      }


      // =====================================================
      // STATUS ORDER
      // =====================================================

      const currentIndex =
        allowedStatuses.indexOf(
          currentStatus
        );

      const newIndex =
        allowedStatuses.indexOf(
          status
        );


      // =====================================================
      // UPDATE
      // =====================================================

      db.prepare(`
        UPDATE orders
        SET
          china_status = ?,
          status = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,

        status === "completed"
          ? "completed"
          : status,

        orderId
      );


      // =====================================================
      // RETURN UPDATED ORDER
      // =====================================================

      const updatedOrder =
        db.prepare(`
          SELECT
            orders.*,

            customers.full_name
              AS customer_name,

            customers.customer_code,

            customers.phone

          FROM orders

          LEFT JOIN customers
            ON customers.id =
               orders.customer_id

          WHERE orders.id = ?
        `).get(orderId);

      res.json({
        success: true,

        message:
          "China order status updated.",

        order:
          updatedOrder,
      });

    } catch (error) {
      console.error(
        "CHINA STATUS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update China order status.",

        details:
          error.message,
      });
    }
  }
);


// =========================================================
// CHINA DELIVERY PROOF
// =========================================================

app.post(
  "/orders/:id/china-proof",
  paymentUpload.single("proof"),
  async (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order ID.",
        });
      }


      // =====================================================
      // FILE REQUIRED
      // =====================================================

      if (!req.file) {
        return res.status(400).json({
          error:
            "Please upload a proof picture.",
        });
      }


      // =====================================================
      // IMAGE ONLY
      // =====================================================

      if (
        !String(
          req.file.mimetype || ""
        ).startsWith("image/")
      ) {
        return res.status(400).json({
          error:
            "Proof must be an image.",
        });
      }


      // =====================================================
      // ORDER
      // =====================================================

      const order =
        db.prepare(`
          SELECT
            id,
            payment_status,
            china_status,
            china_proof
          FROM orders
          WHERE id = ?
        `).get(orderId);

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found.",
        });
      }


      // =====================================================
      // CHECK CHINA ORDER
      // =====================================================

      const request =
        db.prepare(`
          SELECT
            request_type
          FROM customer_requests
          WHERE order_id = ?
          LIMIT 1
        `).get(orderId);

      const requestType =
        String(
          request?.request_type ||
          ""
        ).toLowerCase();

      if (
        requestType !== "china"
      ) {
        return res.status(400).json({
          error:
            "This is not a China order.",
        });
      }


      // =====================================================
      // CONVERT IMAGE TO BASE64
      // =====================================================

      const proof = await uploadBuffer(
        req.file.buffer,
        req.file.mimetype,
        `china-proofs/${orderId}`
      );


      // =====================================================
      // SAVE
      // =====================================================

      db.prepare(`
        UPDATE orders
        SET
          china_proof = ?,
          china_proof_uploaded_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        proof,
        orderId
      );


      // =====================================================
      // RETURN ORDER
      // =====================================================

      const updatedOrder =
        db.prepare(`
          SELECT
            orders.*,

            customers.full_name
              AS customer_name,

            customers.customer_code,

            customers.phone

          FROM orders

          LEFT JOIN customers
            ON customers.id =
               orders.customer_id

          WHERE orders.id = ?
        `).get(orderId);

      res.json({
        success: true,

        message:
          "China delivery proof uploaded successfully.",

        order:
          updatedOrder,
      });

    } catch (error) {
      console.error(
        "CHINA PROOF ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to upload China delivery proof.",

        details:
          error.message,
      });
    }
  }
);
// =========================================================
// REJECT CUSTOMER ORDER PAYMENT
// =========================================================

app.put(
  "/admin/order-payments/:id/reject",
  (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order payment ID"
        });
      }

      const payment =
        db
          .prepare(`
            SELECT
              id,
              customer_id,
              payment_status

            FROM orders

            WHERE id = ?
          `)
          .get(orderId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Order payment not found"
        });
      }

      if (
        payment.payment_status !==
        "submitted"
      ) {
        return res.status(400).json({
          error:
            "This payment is not waiting for approval."
        });
      }

      db.prepare(`
        UPDATE orders

        SET
          payment_status = 'rejected',
          status = 'pending_payment'

        WHERE id = ?
      `).run(orderId);

      console.log(
        `ORDER PAYMENT REJECTED: ORDER #${orderId}`
      );

      res.json({
        success: true,

        message:
          "Order payment rejected successfully."
      });

    } catch (error) {

      console.error(
        "REJECT ORDER PAYMENT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to reject order payment",

        details:
          error.message
      });
    }
  }
);
// =========================================================
// VIETNAM ORDER FIELDS
// =========================================================

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN vietnam_status TEXT
  `);
} catch (error) {
  // Column already exists.
}

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN vietnam_proof TEXT
  `);
} catch (error) {
  // Column already exists.
}

try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN vietnam_proof_uploaded_at TEXT
  `);
} catch (error) {
  // Column already exists.
}// =========================================================
// VIETNAM ORDER STATUS
// =========================================================

app.put(
  "/orders/:id/vietnam-status",
  (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      const {
        status,
      } = req.body || {};

      if (
        !Number.isInteger(
          orderId
        ) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order ID.",
        });
      }

      const allowedStatuses = [
        "pending_payment",
        "ordered",
        "arrive_vietnam_warehouse",
        "delivering",
        "customs_clearance",
        "customs_clearance_done",
        "arrive_pp_warehouse",
        "delivering_to_customer",
        "completed",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid Vietnam order status.",
        });
      }

      const order =
        db.prepare(`
          SELECT
            id,
            status,
            payment_status,
            vietnam_status,
            vietnam_proof
          FROM orders
          WHERE id = ?
        `).get(orderId);

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found.",
        });
      }

      /*
      =======================================================
      MAKE SURE THIS IS ACTUALLY A VIETNAM ORDER
      =======================================================
      */

      const request =
        db.prepare(`
          SELECT
            request_type
          FROM customer_requests
          WHERE order_id = ?
          LIMIT 1
        `).get(orderId);

      const requestType =
        String(
          request?.request_type ||
            ""
        ).toLowerCase();

      if (
        requestType !==
        "vietnam"
      ) {
        return res.status(400).json({
          error:
            "This is not a Vietnam order.",
        });
      }

      /*
      =======================================================
      CURRENT VIETNAM STATUS
      =======================================================
      */

      let currentStatus =
        order.vietnam_status ||
        order.status ||
        "pending_payment";

      /*
      Existing paid Vietnam orders that were previously
      saved as "processing" should behave as "ordered".
      */

      if (
        currentStatus ===
          "processing" &&
        order.payment_status ===
          "paid"
      ) {
        currentStatus =
          "ordered";
      }

      const currentIndex =
        allowedStatuses.indexOf(
          currentStatus
        );

      const newIndex =
        allowedStatuses.indexOf(
          status
        );

      /*
      =======================================================
      UPDATE
      =======================================================
      */

      db.prepare(`
        UPDATE orders
        SET
          vietnam_status = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        status ===
          "completed"
          ? "completed"
          : status,
        orderId
      );

      /*
      =======================================================
      RETURN UPDATED ORDER
      =======================================================
      */

      const updatedOrder =
        db.prepare(`
          SELECT
            orders.*,

            customers.full_name
              AS customer_name,

            customers.customer_code,

            customers.phone

          FROM orders

          LEFT JOIN customers
            ON customers.id =
               orders.customer_id

          WHERE orders.id = ?
        `).get(orderId);

      res.json({
        success: true,
        message:
          "Vietnam order status updated.",
        order:
          updatedOrder,
      });

    } catch (error) {
      console.error(
        "VIETNAM STATUS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update Vietnam order status.",
        details:
          error.message,
      });
    }
  }
);// =========================================================
// VIETNAM DELIVERY PROOF
// =========================================================

app.post(
  "/orders/:id/vietnam-proof",
  paymentUpload.single("proof"),
  async (req, res) => {
    try {
      const orderId =
        Number(req.params.id);

      if (
        !Number.isInteger(
          orderId
        ) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order ID.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error:
            "Please upload a proof picture.",
        });
      }

      if (
        !req.file.mimetype.startsWith(
          "image/"
        )
      ) {
        return res.status(400).json({
          error:
            "Proof must be an image.",
        });
      }

      const order =
        db.prepare(`
          SELECT
            id,
            payment_status,
            vietnam_status
          FROM orders
          WHERE id = ?
        `).get(orderId);

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found.",
        });
      }

      /*
      =======================================================
      CHECK VIETNAM REQUEST
      =======================================================
      */

      const request =
        db.prepare(`
          SELECT
            request_type
          FROM customer_requests
          WHERE order_id = ?
          LIMIT 1
        `).get(orderId);

      if (
        String(
          request?.request_type ||
            ""
        ).toLowerCase() !==
        "vietnam"
      ) {
        return res.status(400).json({
          error:
            "This is not a Vietnam order.",
        });
      }

      /*
      =======================================================
      CONVERT IMAGE TO BASE64
      =======================================================
      */

      const proofData = await uploadBuffer(
        req.file.buffer,
        req.file.mimetype,
        `vietnam-proofs/${orderId}`
      );

      /*
      =======================================================
      SAVE PROOF
      =======================================================
      */

      db.prepare(`
        UPDATE orders
        SET
          vietnam_proof = ?,
          vietnam_proof_uploaded_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        proofData,
        orderId
      );

      /*
      =======================================================
      RETURN UPDATED ORDER
      =======================================================
      */

      const updatedOrder =
        db.prepare(`
          SELECT
            orders.*,

            customers.full_name
              AS customer_name,

            customers.customer_code,

            customers.phone

          FROM orders

          LEFT JOIN customers
            ON customers.id =
               orders.customer_id

          WHERE orders.id = ?
        `).get(orderId);

      res.json({
        success: true,
        message:
          "Vietnam delivery proof uploaded successfully.",
        order:
          updatedOrder,
      });

    } catch (error) {
      console.error(
        "VIETNAM PROOF ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to upload Vietnam delivery proof.",
        details:
          error.message,
      });
    }
  }
);
/* =========================================================
   END OF PART 3
========================================================= *//* =========================================================
   LOANS
========================================================= */

/* =========================================================
   DATE HELPERS
========================================================= */

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

function addDays(
  dateString,
  days
) {
  const date =
    new Date(
      `${dateString}T00:00:00`
    );

  date.setDate(
    date.getDate() + days
  );

  return date
    .toISOString()
    .split("T")[0];
}

/* =========================================================
   CALCULATE NUMBER OF WEEKS
========================================================= */

function calculateNumberOfWeeks(
  startDate,
  endDate
) {
  const start =
    new Date(
      `${startDate}T00:00:00`
    );

  const end =
    new Date(
      `${endDate}T00:00:00`
    );

  const difference =
    end.getTime() -
    start.getTime();

  if (difference <= 0) {
    return 0;
  }

  return Math.ceil(
    difference /
      (1000 *
        60 *
        60 *
        24 *
        7)
  );
}

/* =========================================================
   CALCULATE WEEKLY INTEREST
========================================================= */

function calculateWeeklyInterest(
  totalAmount,
  interestType,
  interestValue
) {
  const amount =
    Number(totalAmount) ||
    0;

  const value =
    Number(interestValue) ||
    0;

  if (
    interestType ===
    "percentage"
  ) {
    return Number(
      (
        (amount * value) /
        100
      ).toFixed(2)
    );
  }

  return Number(
    value.toFixed(2)
  );
}

/* =========================================================
   DATE HELPERS
========================================================= */
function normalizeDateOnly(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/* =========================================================
   CREATE INTEREST SCHEDULE
========================================================= */

function createInterestSchedule(
  loanId,
  startDate,
  endDate,
  weeklyInterest
) {
  // Force everything going into SQLite to a supported type
  const safeLoanId = Number(loanId);
  const safeWeeklyInterest = Number(weeklyInterest);

  if (
    !Number.isFinite(safeLoanId) ||
    !Number.isFinite(safeWeeklyInterest) ||
    safeWeeklyInterest <= 0
  ) {
    console.log(
      "Skipping interest schedule:",
      {
        loanId,
        startDate,
        endDate,
        weeklyInterest,
      }
    );

    return;
  }

  const safeStartDate = String(startDate);
  const safeEndDate = String(endDate);

  const weeks = Number(
    calculateNumberOfWeeks(
      safeStartDate,
      safeEndDate
    )
  );

  if (
    !Number.isFinite(weeks) ||
    weeks <= 0
  ) {
    return;
  }

  const insertPayment = db.prepare(`
    INSERT INTO loan_payments
    (
      loan_id,
      payment_type,
      amount,
      due_date,
      status
    )
    VALUES (?, 'interest', ?, ?, 'due')
  `);

  for (
    let week = 1;
    week <= weeks;
    week++
  ) {
    const dueDate = String(
      addDays(
        safeStartDate,
        Number(week) * 7
      )
    );

    insertPayment.run(
      safeLoanId,
      "interest",
      safeWeeklyInterest,
      dueDate,
      "due"
    );
  }
}
/* =========================================================
   UPDATE OVERDUE PAYMENTS
========================================================= */

function updateOverduePayments() {
  try {
    const today =
      getToday();

    db.prepare(
      `
      UPDATE loan_payments

      SET status = 'overdue'

      WHERE status = 'due'

      AND due_date < ?

      AND loan_id IN (
        SELECT id
        FROM customer_loans
        WHERE status = 'active'
      )
      `
    ).run(today);
  } catch (error) {
    console.error(
      "updateOverduePayments error:",
      error
    );
  }
}

/* =========================================================
   GET ALL LOANS
========================================================= */

app.get(
  "/loans",
  (req, res) => {
    try {
      updateOverduePayments();

      const loans =
        db
          .prepare(
            `
            SELECT
              customer_loans.*,

              customers.full_name,

              customers.customer_code

            FROM customer_loans

            JOIN customers
              ON customers.id =
                 customer_loans.customer_id

            ORDER BY
              customer_loans.id DESC
            `
          )
          .all();

      const result =
        loans.map(
          (loan) => {
            const remaining =
              Math.max(
                0,
                Number(
                  loan.principal_remaining ??
                    loan.remaining_balance ??
                    0
                )
              );

            return {
              ...loan,

              principal_remaining:
                remaining,

              remaining,

              is_paid_off:
                remaining <= 0 ||
                loan.status ===
                  "paid_off" ||
                loan.loan_status ===
                  "paid_off",
            };
          }
        );

      res.json(result);
    } catch (error) {
      console.error(
        "GET /loans error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load loans",
      });
    }
  }
);

/* =========================================================
   GET CUSTOMER LOAN
========================================================= */

app.get(
  "/loans/customer/:customerId",
  (req, res) => {
    try {
      updateOverduePayments();

      const customerId =
        Number(
          req.params.customerId
        );

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      const loan =
        db
          .prepare(
            `
            SELECT
              customer_loans.*,

              customers.full_name,

              customers.customer_code

            FROM customer_loans

            JOIN customers
              ON customers.id =
                 customer_loans.customer_id

            WHERE
              customer_loans.customer_id = ?

            LIMIT 1
            `
          )
          .get(customerId);

      /*
        If no loan exists, return
        an empty loan object instead
        of 404.
      */

      if (!loan) {
        return res.json({
          enabled: false,

          total_amount: 0,

          paid_amount: 0,

          principal_remaining: 0,

          remaining: 0,

          interest_type:
            "fixed",

          interest_value: 0,

          weekly_interest: 0,

          start_date: null,

          end_date: null,

          payoff_date: null,

          status: null,

          loan_status: null,

          customer_id:
            customerId,
        });
      }

      const remaining =
        Math.max(
          0,
          Number(
            loan.principal_remaining ??
              loan.remaining_balance ??
              0
          )
        );

      const status =
        loan.status ||
        loan.loan_status ||
        "active";

      res.json({
        ...loan,

        enabled:
          Number(
            loan.enabled
          ) === 1 &&
          remaining > 0 &&
          status === "active",

        total_amount:
          Number(
            loan.total_amount ||
              0
          ),

        paid_amount:
          Number(
            loan.paid_amount ||
              0
          ),

        principal_remaining:
          remaining,

        remaining,

        is_paid_off:
          remaining <= 0 ||
          status === "paid_off",
      });
    } catch (error) {
      console.error(
        "GET customer loan error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load loan",
      });
    }
  }
);

/* =========================================================
   CREATE CUSTOMER LOAN
========================================================= */

app.post(
  "/loans/customer/:customerId",
  (req, res) => {
    try {
      const customerId =
        Number(
          req.params.customerId
        );

      const totalAmount =
        Number(
          req.body.total_amount
        );

      const interestType =
        req.body.interest_type ||
        "fixed";

      const interestValue =
        Number(
          req.body.interest_value ||
            0
        );

      const startDate =
        normalizeDateOnly(req.body.start_date);

      const endDate =
        normalizeDateOnly(req.body.end_date);

      const notes =
        req.body.notes || "";

      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      if (
        Number.isNaN(
          totalAmount
        ) ||
        totalAmount <= 0
      ) {
        return res.status(400).json({
          error:
            "Loan amount must be greater than 0",
        });
      }

      if (
        interestType !==
          "fixed" &&
        interestType !==
          "percentage"
      ) {
        return res.status(400).json({
          error:
            "Interest type must be fixed or percentage",
        });
      }

      if (
        Number.isNaN(
          interestValue
        ) ||
        interestValue < 0
      ) {
        return res.status(400).json({
          error:
            "Invalid interest value",
        });
      }

      if (!startDate) {
        return res.status(400).json({
          error:
            "Start date is required",
        });
      }

      if (!endDate) {
        return res.status(400).json({
          error:
            "End date is required",
        });
      }

      const start =
        new Date(
          `${startDate}T00:00:00`
        );

      const end =
        new Date(
          `${endDate}T00:00:00`
        );

      if (
        Number.isNaN(
          start.getTime()
        ) ||
        Number.isNaN(
          end.getTime()
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid loan date",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          error:
            "End date must be after start date",
        });
      }

      /* ---------------------------------------------------
         CUSTOMER
      --------------------------------------------------- */

      const customer =
        db
          .prepare(
            `
            SELECT
              id,
              full_name,
              customer_code
            FROM customers
            WHERE id = ?
            `
          )
          .get(customerId);

      if (!customer) {
        return res.status(404).json({
          error:
            "Customer not found",
        });
      }

      /* ---------------------------------------------------
         EXISTING LOAN
      --------------------------------------------------- */

      const existing =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE customer_id = ?
            LIMIT 1
            `
          )
          .get(customerId);

      if (existing) {
        const existingStatus =
          existing.status ||
          existing.loan_status;

        const existingRemaining =
          Number(
            existing.principal_remaining ??
              existing.remaining_balance ??
              0
          );

        if (
          existingStatus ===
            "active" &&
          existingRemaining > 0
        ) {
          return res.status(400).json({
            error:
              "This customer already has an active loan",
          });
        }

        /*
          Reuse old loan row because
          customer_id is unique.
        */

        const weeklyInterest =
          calculateWeeklyInterest(
            totalAmount,
            interestType,
            interestValue
          );

        const transaction =
          db.transaction(() => {
            db.prepare(
              `
              DELETE FROM loan_payments
              WHERE loan_id = ?
              `
            ).run(existing.id);

            db.prepare(
              `
              DELETE FROM loan_transactions
              WHERE loan_id = ?
              `
            ).run(existing.id);

            db.prepare(
              `
              UPDATE customer_loans
              SET
                enabled = 1,

                total_amount = ?,

                paid_amount = 0,

                notes = ?,

                start_date = ?,

                end_date = ?,

                interest_type = ?,

                interest_value = ?,

                weekly_interest = ?,

                principal_remaining = ?,

                payoff_date = NULL,

                status = 'active',

                loan_status = 'active',

                remaining_balance = ?,

                updated_at =
                  CURRENT_TIMESTAMP

              WHERE id = ?
              `
            ).run(
              totalAmount,

              String(
                notes
              ).trim(),

              startDate,

              endDate,

              interestType,

              interestValue,

              weeklyInterest,

              totalAmount,

              totalAmount,

              existing.id
            );

            createInterestSchedule(
              existing.id,
              startDate,
              endDate,
              weeklyInterest
            );
          });

        transaction();

        const loan =
          db
            .prepare(
              `
              SELECT
                customer_loans.*,

                customers.full_name,

                customers.customer_code

              FROM customer_loans

              JOIN customers
                ON customers.id =
                   customer_loans.customer_id

              WHERE customer_loans.id = ?
              `
            )
            .get(existing.id);

        return res
          .status(201)
          .json({
            success: true,

            loan: {
              ...loan,

              remaining:
                Number(
                  loan.principal_remaining ||
                    0
                ),

              is_paid_off: false,
            },
          });
      }

      /* ---------------------------------------------------
         CALCULATE INTEREST
      --------------------------------------------------- */

      const weeklyInterest =
        calculateWeeklyInterest(
          totalAmount,
          interestType,
          interestValue
        );

      /* ---------------------------------------------------
         CREATE LOAN
      --------------------------------------------------- */

      const createLoan =
        db.transaction(() => {
          const result =
            db
              .prepare(
                `
                INSERT INTO customer_loans
                (
                  customer_id,
                  enabled,
                  total_amount,
                  paid_amount,
                  notes,
                  start_date,
                  end_date,
                  interest_type,
                  interest_value,
                  weekly_interest,
                  principal_remaining,
                  remaining_balance,
                  loan_status,
                  status
                )
                VALUES
                (
                  ?,
                  1,
                  ?,
                  0,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  'active',
                  'active'
                )
                `
              )
              .run(
                customerId,

                totalAmount,

                String(
                  notes
                ).trim(),

                startDate,

                endDate,

                interestType,

                interestValue,

                weeklyInterest,

                totalAmount,

                totalAmount
              );

          const loanId =
            result.lastInsertRowid;

          createInterestSchedule(
            loanId,
            startDate,
            endDate,
            weeklyInterest
          );

          return loanId;
        });

      const loanId =
        createLoan();

      createCustomerNotification(
        customerId,
        "loan_activated",
        "Loan activated",
        `A $${totalAmount.toFixed(2)} loan has been activated for your account.`,
        { loan_id: loanId, total_amount: totalAmount, start_date: startDate, end_date: endDate }
      );

      /* ---------------------------------------------------
         GET CREATED LOAN
      --------------------------------------------------- */

      const loan =
        db
          .prepare(
            `
            SELECT
              customer_loans.*,

              customers.full_name,

              customers.customer_code

            FROM customer_loans

            JOIN customers
              ON customers.id =
                 customer_loans.customer_id

            WHERE customer_loans.id = ?
            `
          )
          .get(loanId);

      res.status(201).json({
        success: true,

        loan: {
          ...loan,

          remaining:
            Number(
              loan.principal_remaining ||
                0
            ),

          is_paid_off: false,
        },
      });
    } catch (error) {
      console.error(
        "POST /loans/customer/:customerId ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create loan",

        details:
          error.message,
      });
    }
  }
);

/* =========================================================
   RECORD PRINCIPAL PAYMENT
========================================================= */

app.post(
  "/loans/customer/:customerId/payment",
  (req, res) => {
    try {
      const customerId =
        Number(
          req.params.customerId
        );

      const amount =
        Number(
          req.body.amount
        );

      const notes =
        req.body.notes || "";

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      if (
        Number.isNaN(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid payment amount",
        });
      }

      const loan =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE customer_id = ?
            AND status = 'active'
            LIMIT 1
            `
          )
          .get(customerId);

      if (!loan) {
        return res.status(404).json({
          error:
            "No active loan found",
        });
      }

      const remaining =
        Math.max(
          0,
          Number(
            loan.principal_remaining ??
              loan.remaining_balance ??
              0
          )
        );

      if (
        remaining <= 0
      ) {
        return res.status(400).json({
          error:
            "Loan is already paid off",
        });
      }

      if (
        amount > remaining
      ) {
        return res.status(400).json({
          error:
            "Payment cannot be greater than remaining principal",
        });
      }

      const newRemaining =
        Number(
          (
            remaining -
            amount
          ).toFixed(2)
        );

      const paidOff =
        newRemaining <= 0;

      const paymentDate =
        getToday();

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE customer_loans
            SET
              paid_amount =
                paid_amount + ?,

              principal_remaining = ?,

              remaining_balance = ?,

              enabled = ?,

              status = ?,

              loan_status = ?,

              payoff_date = ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
            `
          ).run(
            amount,

            newRemaining,

            newRemaining,

            paidOff ? 0 : 1,

            paidOff
              ? "paid_off"
              : "active",

            paidOff
              ? "paid_off"
              : "active",

            paidOff
              ? paymentDate
              : null,

            loan.id
          );

          db.prepare(
            `
            INSERT INTO loan_transactions
            (
              loan_id,
              amount,
              type,
              description
            )
            VALUES (?, ?, ?, ?)
            `
          ).run(
            loan.id,

            amount,

            "principal_payment",

            String(
              notes
            ).trim() ||
              "Principal payment"
          );

          if (paidOff) {
            db.prepare(
              `
              UPDATE loan_payments
              SET status = 'cancelled'
              WHERE loan_id = ?
              AND payment_type = 'interest'
              AND status IN
                ('due', 'overdue')
              `
            ).run(loan.id);
          }
        });

      transaction();

      const updated =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE id = ?
            `
          )
          .get(loan.id);

      res.json({
        success: true,

        loan: {
          ...updated,

          remaining:
            Number(
              updated.principal_remaining ||
                0
            ),

          is_paid_off:
            updated.status ===
            "paid_off",
        },
      });
    } catch (error) {
      console.error(
        "Principal payment error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to record principal payment",
      });
    }
  }
);

/* =========================================================
   GET LOAN INTEREST PAYMENTS
========================================================= */

app.get(
  "/loans/customer/:customerId/payments",
  (req, res) => {
    try {
      updateOverduePayments();

      const customerId =
        Number(
          req.params.customerId
        );

      const payments =
        db
          .prepare(
            `
            SELECT
              loan_payments.*,

              customer_loans.customer_id

            FROM loan_payments

            JOIN customer_loans
              ON customer_loans.id =
                 loan_payments.loan_id

            WHERE
              customer_loans.customer_id = ?

            ORDER BY
              loan_payments.due_date ASC,

              loan_payments.id ASC
            `
          )
          .all(customerId);

      res.json(payments);
    } catch (error) {
      console.error(
        "GET loan payments error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load loan payments",
      });
    }
  }
);

/* =========================================================
   PAY WEEKLY INTEREST
========================================================= */

app.put(
  "/loans/payments/:paymentId/pay",
  (req, res) => {
    try {
      const paymentId =
        Number(
          req.params.paymentId
        );

      if (!paymentId) {
        return res.status(400).json({
          error:
            "Invalid payment",
        });
      }

      const payment =
        db
          .prepare(
            `
            SELECT
              loan_payments.*,

              customer_loans.customer_id,

              customer_loans.status
                AS loan_status

            FROM loan_payments

            JOIN customer_loans
              ON customer_loans.id =
                 loan_payments.loan_id

            WHERE
              loan_payments.id = ?
            `
          )
          .get(paymentId);

      if (!payment) {
        return res.status(404).json({
          error:
            "Interest payment not found",
        });
      }

      if (
        payment.status ===
        "paid"
      ) {
        return res.status(400).json({
          error:
            "This interest payment is already paid",
        });
      }

      if (
        payment.status ===
        "cancelled"
      ) {
        return res.status(400).json({
          error:
            "This interest payment was cancelled",
        });
      }

      if (
        payment.loan_status ===
        "paid_off"
      ) {
        return res.status(400).json({
          error:
            "The loan has already been paid off",
        });
      }

      const paidDate =
        getToday();

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE loan_payments
            SET
              status = 'paid',
              paid_date = ?
            WHERE id = ?
            `
          ).run(
            paidDate,
            paymentId
          );

          db.prepare(
            `
            INSERT INTO loan_transactions
            (
              loan_id,
              amount,
              type,
              description
            )
            VALUES (?, ?, ?, ?)
            `
          ).run(
            payment.loan_id,

            payment.amount,

            "interest_payment",

            `Weekly interest payment for ${payment.due_date}`
          );
        });

      transaction();

      res.json({
        success: true,

        message:
          "Weekly interest payment recorded",
      });
    } catch (error) {
      console.error(
        "Pay interest error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to record interest payment",
      });
    }
  }
);

/* =========================================================
   GET LOAN TRANSACTIONS
========================================================= */

app.get(
  "/loans/customer/:customerId/transactions",
  (req, res) => {
    try {
      const transactions =
        db
          .prepare(
            `
            SELECT
              loan_transactions.*,

              customer_loans.customer_id

            FROM loan_transactions

            JOIN customer_loans
              ON customer_loans.id =
                 loan_transactions.loan_id

            WHERE
              customer_loans.customer_id = ?

            ORDER BY
              loan_transactions.created_at DESC
            `
          )
          .all(
            req.params.customerId
          );

      res.json(
        transactions
      );
    } catch (error) {
      console.error(
        "Loan transactions error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load loan history",
      });
    }
  }
);

/* =========================================================
   UPDATE ACTIVE LOAN
========================================================= */

app.put(
  "/loans/customer/:customerId",
  (req, res) => {
    try {
      const customerId =
        Number(
          req.params.customerId
        );

      if (!customerId) {
        return res.status(400).json({
          error:
            "Invalid customer",
        });
      }

      const loan =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE customer_id = ?
            AND status = 'active'
            LIMIT 1
            `
          )
          .get(customerId);

      if (!loan) {
        return res.status(404).json({
          error:
            "No active loan found",
        });
      }

      const totalAmount =
        Number(
          req.body.total_amount ??
            loan.total_amount
        );

      const interestType =
        req.body.interest_type ||
        loan.interest_type ||
        "fixed";

      const interestValue =
        Number(
          req.body.interest_value ??
            loan.interest_value ??
            0
        );

      const startDate =
        req.body.start_date ||
        loan.start_date;

      const endDate =
        req.body.end_date ||
        loan.end_date;

      const notes =
        req.body.notes ??
        loan.notes ??
        "";

      if (
        Number.isNaN(
          totalAmount
        ) ||
        totalAmount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid loan amount",
        });
      }

      if (
        interestType !==
          "fixed" &&
        interestType !==
          "percentage"
      ) {
        return res.status(400).json({
          error:
            "Invalid interest type",
        });
      }

      if (
        Number.isNaN(
          interestValue
        ) ||
        interestValue < 0
      ) {
        return res.status(400).json({
          error:
            "Invalid interest value",
        });
      }

      const weeklyInterest =
        calculateWeeklyInterest(
          totalAmount,
          interestType,
          interestValue
        );

      const paidAmount =
        Number(
          loan.paid_amount || 0
        );

      const principalRemaining =
        Math.max(
          0,
          Number(
            (
              totalAmount -
              paidAmount
            ).toFixed(2)
          )
        );

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            DELETE FROM loan_payments
            WHERE loan_id = ?
            AND status IN
              ('due', 'overdue')
            `
          ).run(loan.id);

          db.prepare(
            `
            UPDATE customer_loans
            SET
              total_amount = ?,

              principal_remaining = ?,

              remaining_balance = ?,

              interest_type = ?,

              interest_value = ?,

              weekly_interest = ?,

              start_date = ?,

              end_date = ?,

              notes = ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
            `
          ).run(
            totalAmount,

            principalRemaining,

            principalRemaining,

            interestType,

            interestValue,

            weeklyInterest,

            startDate,

            endDate,

            String(
              notes
            ).trim(),

            loan.id
          );

          createInterestSchedule(
            loan.id,
            startDate,
            endDate,
            weeklyInterest
          );
        });

      transaction();

      const updated =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE id = ?
            `
          )
          .get(loan.id);

      res.json({
        success: true,

        loan: {
          ...updated,

          remaining:
            Number(
              updated.principal_remaining ||
                0
            ),
        },
      });
    } catch (error) {
      console.error(
        "Update loan error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update loan",
      });
    }
  }
);

/* =========================================================
   DISABLE / CANCEL LOAN
========================================================= */

app.put(
  "/loans/customer/:customerId/disable",
  (req, res) => {
    try {
      const customerId =
        Number(
          req.params.customerId
        );

      const loan =
        db
          .prepare(
            `
            SELECT *
            FROM customer_loans
            WHERE customer_id = ?
            AND status = 'active'
            LIMIT 1
            `
          )
          .get(customerId);

      if (!loan) {
        return res.status(404).json({
          error:
            "No active loan found",
        });
      }

      const transaction =
        db.transaction(() => {
          db.prepare(
            `
            UPDATE customer_loans
            SET
              enabled = 0,

              status = 'cancelled',

              loan_status =
                'cancelled',

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
            `
          ).run(loan.id);

          db.prepare(
            `
            UPDATE loan_payments
            SET status = 'cancelled'
            WHERE loan_id = ?
            AND status IN
              ('due', 'overdue')
            `
          ).run(loan.id);
        });

      transaction();

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Disable loan error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to cancel loan",
      });
    }
  }
);

/* =========================================================
   END OF PART 4
========================================================= *//* =========================================================
LOANS
========================================================= */

/* ---------------------------------------------------------
   DATE HELPERS
--------------------------------------------------------- */

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}


function addDays(dateString, days) {
  const date = new Date(
    `${dateString}T00:00:00`
  );

  date.setDate(
    date.getDate() + days
  );

  return date
}


function calculateNumberOfWeeks(
  startDate,
  endDate
) {
  const start = new Date(
    `${startDate}T00:00:00`
  );

  const end = new Date(
    `${endDate}T00:00:00`
  );

  const difference =
    end.getTime() -
    start.getTime();

  if (difference <= 0) {
    return 0;
  }

  return Math.ceil(
    difference /
      (1000 * 60 * 60 * 24 * 7)
  );
}


/* ---------------------------------------------------------
   CALCULATE WEEKLY INTEREST
--------------------------------------------------------- */

function calculateWeeklyInterest(
  totalAmount,
  interestType,
  interestValue
) {
  const amount =
    Number(totalAmount) || 0;

  const value =
    Number(interestValue) || 0;

  if (
    interestType ===
    "percentage"
  ) {
    return Number(
      (
        (amount * value) /
        100
      ).toFixed(2)
    );
  }

  return Number(
    value.toFixed(2)
  );
}


/* =========================================================
   CREATE INTEREST SCHEDULE
   SAFE SQLITE VERSION
========================================================= */

function createInterestSchedule(
  loanId,
  startDate,
  endDate,
  weeklyInterest
) {
  const safeLoanId = Number(loanId);
  const safeWeeklyInterest = Number(weeklyInterest);

  // Never send undefined / NaN / objects to SQLite.
  if (!Number.isFinite(safeLoanId)) {
    console.error(
      "CREATE INTEREST SCHEDULE: invalid loanId",
      loanId
    );
    return;
  }

  if (
    !Number.isFinite(safeWeeklyInterest) ||
    safeWeeklyInterest <= 0
  ) {
    // A zero-interest loan does not need an interest schedule.
    return;
  }

  const safeStartDate =
    startDate == null
      ? null
      : String(startDate);

  const safeEndDate =
    endDate == null
      ? null
      : String(endDate);

  if (!safeStartDate || !safeEndDate) {
    console.log(
      "Skipping interest schedule because dates are missing.",
      {
        loanId: safeLoanId,
        startDate: safeStartDate,
        endDate: safeEndDate,
      }
    );

    return;
  }

  const weeksRaw =
    calculateNumberOfWeeks(
      safeStartDate,
      safeEndDate
    );

  const weeks = Number(weeksRaw);

  if (
    !Number.isFinite(weeks) ||
    weeks <= 0
  ) {
    console.log(
      "Skipping interest schedule because loan duration is invalid.",
      {
        loanId: safeLoanId,
        startDate: safeStartDate,
        endDate: safeEndDate,
        weeks: weeksRaw,
      }
    );

    return;
  }

  const insertPayment =
    db.prepare(`
      INSERT INTO loan_payments
      (
        loan_id,
        payment_type,
        amount,
        due_date,
        paid_date,
        status
      )
      VALUES
      (
        ?,
        'interest',
        ?,
        ?,
        ?,
        'due'
      )
    `);

  for (
    let week = 1;
    week <= weeks;
    week++
  ) {
    const rawDueDate =
      addDays(
        safeStartDate,
        week * 7
      );

    const safeDueDate =
      rawDueDate == null
        ? null
        : String(rawDueDate);

    if (!safeDueDate) {
      console.error(
        "Skipping invalid interest payment date.",
        {
          loanId: safeLoanId,
          week,
          rawDueDate,
        }
      );

      continue;
    }

    insertPayment.run(
  safeLoanId,
  safeWeeklyInterest,
  safeDueDate,
  safeDueDate
);
  }
}
/* =========================================================
UPDATE OVERDUE PAYMENTS
========================================================= */

/* =========================================================
   ADMIN - GET CUSTOMER REQUESTS
   ========================================================= */

app.get(
  "/api/admin/customer-requests",
  (req, res) => {
    try {
      const requests = db
        .prepare(`
          SELECT
            r.*,

            c.full_name AS customer_name,
            c.customer_code,

            s.name AS service_name,
            s.category AS service_category,
            s.description AS service_description

          FROM customer_requests r

          LEFT JOIN customers c
            ON c.id = r.customer_id

          LEFT JOIN services s
            ON s.id = r.service_id

          ORDER BY
            CASE
              WHEN r.quote_status = 'pending'
                   AND r.status = 'open'
              THEN 0

              WHEN r.quote_status = 'quoted'
              THEN 1

              ELSE 2
            END,

            r.created_at DESC,
            r.id DESC
        `)
        .all();

      /* -----------------------------------------------------
         LAST MESSAGE
      ----------------------------------------------------- */

      const getLastMessage = db.prepare(`
        SELECT
          id,
          sender_type,
          sender_id,
          message,
          created_at

        FROM customer_request_messages

        WHERE request_id = ?

        ORDER BY
          created_at DESC,
          id DESC

        LIMIT 1
      `);

      /* -----------------------------------------------------
         FILES
      ----------------------------------------------------- */

      const getFiles = db.prepare(`
        SELECT
          id,
          file_name,
          file_type,
          file_size,
          created_at

        FROM customer_request_files

        WHERE request_id = ?

        ORDER BY
          id ASC
      `);

      const result = requests.map((request) => ({
        ...request,

        last_message:
          getLastMessage.get(request.id) || null,

        files:
          getFiles.all(request.id),
      }));

      res.json({
        success: true,
        requests: result,
      });

    } catch (error) {

      console.error(
        "GET ADMIN CUSTOMER REQUESTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load customer requests.",
        error: error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - GET SINGLE CUSTOMER REQUEST
   ========================================================= */

app.get(
  "/api/admin/customer-requests/:id",
  (req, res) => {
    try {

      const requestId =
        Number(req.params.id);

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      /* -----------------------------------------------------
         REQUEST
      ----------------------------------------------------- */

      const request =
        db.prepare(`
          SELECT
            r.*,

            c.full_name AS customer_name,
            c.customer_code,
            c.email AS customer_email,
            c.phone AS customer_phone,

            s.name AS service_name,
            s.category AS service_category,
            s.description AS service_description,
            s.price AS service_price

          FROM customer_requests r

          LEFT JOIN customers c
            ON c.id = r.customer_id

          LEFT JOIN services s
            ON s.id = r.service_id

          WHERE r.id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      /* -----------------------------------------------------
         MESSAGES
      ----------------------------------------------------- */

      const messages =
        db.prepare(`
          SELECT
            id,
            sender_type,
            sender_id,
            message,
            created_at

          FROM customer_request_messages

          WHERE request_id = ?

          ORDER BY
            created_at ASC,
            id ASC
        `)
        .all(requestId);

      /* -----------------------------------------------------
         FILES
      ----------------------------------------------------- */

      const files =
        db.prepare(`
          SELECT
            id,
            file_name,
            file_type,
            file_size,
            created_at

          FROM customer_request_files

          WHERE request_id = ?

          ORDER BY
            id ASC
        `)
        .all(requestId);

      res.json({
        success: true,

        request: {
          ...request,
          messages,
          files,
        },
      });

    } catch (error) {

      console.error(
        "GET ADMIN CUSTOMER REQUEST ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load customer request.",
        error: error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - SEND MESSAGE TO CUSTOMER
   ========================================================= */

app.post(
  "/api/admin/customer-requests/:id/messages",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      const message =
        String(
          req.body.message || ""
        ).trim();

      /* -----------------------------------------------------
         VALIDATE
      ----------------------------------------------------- */

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          message:
            "Message cannot be empty.",
        });
      }

      /* -----------------------------------------------------
         REQUEST
      ----------------------------------------------------- */

      const request =
        db.prepare(`
          SELECT
            id,
            customer_id,
            status,
            quote_status

          FROM customer_requests

          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      if (
        request.status === "closed" ||
        request.status === "completed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This request is closed.",
        });
      }

      /* -----------------------------------------------------
         SAVE MESSAGE
      ----------------------------------------------------- */

      const result =
        db.prepare(`
          INSERT INTO
          customer_request_messages
          (
            request_id,
            sender_type,
            sender_id,
            message
          )

          VALUES
          (
            ?,
            'admin',
            NULL,
            ?
          )
        `)
        .run(
          requestId,
          message
        );

      /* -----------------------------------------------------
         UPDATE REQUEST
      ----------------------------------------------------- */

      db.prepare(`
        UPDATE customer_requests

        SET
          status = 'open',
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(requestId);

      const createdMessage =
        db.prepare(`
          SELECT
            id,
            sender_type,
            sender_id,
            message,
            created_at

          FROM customer_request_messages

          WHERE id = ?
        `)
        .get(
          Number(result.lastInsertRowid)
        );

      res.status(201).json({
        success: true,
        message:
          "Message sent successfully.",
        data: createdMessage,
      });

    } catch (error) {

      console.error(
        "ADMIN SEND MESSAGE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to send message.",
        error: error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - SEND QUOTE
   ========================================================= */

app.post(
  "/api/admin/customer-requests/:id/quote",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      const amount =
        Number(req.body.amount);

      const currency =
        String(
          req.body.currency || "USD"
        )
        .trim()
        .toUpperCase();

      const quoteNote =
        String(
          req.body.note || ""
        ).trim();

      /* -----------------------------------------------------
         VALIDATE REQUEST ID
      ----------------------------------------------------- */

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      /* -----------------------------------------------------
         VALIDATE AMOUNT
      ----------------------------------------------------- */

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid quotation amount.",
        });
      }

      /* -----------------------------------------------------
         VALIDATE CURRENCY
      ----------------------------------------------------- */

      const allowedCurrencies = [
        "USD",
        "KHR",
      ];

      if (
        !allowedCurrencies.includes(
          currency
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Currency must be USD or KHR.",
        });
      }

      /* -----------------------------------------------------
         FIND REQUEST
      ----------------------------------------------------- */

      const request =
        db.prepare(`
          SELECT
            id,
            customer_id,
            status,
            quote_status

          FROM customer_requests

          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      if (
        request.status === "closed" ||
        request.status === "completed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This request is closed.",
        });
      }

      /* -----------------------------------------------------
         SAVE QUOTE
      ----------------------------------------------------- */

      db.prepare(`
        UPDATE customer_requests

        SET
          quote_amount = ?,
          quote_currency = ?,
          quote_status = 'quoted',
          quote_note = ?,
          quoted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(
        amount,
        currency,
        quoteNote || null,
        requestId
      );

      /* -----------------------------------------------------
         CREATE QUOTE MESSAGE
      ----------------------------------------------------- */

      let quoteMessage =
        `Quotation: ${currency} ${amount.toFixed(2)}`;

      if (quoteNote) {
        quoteMessage +=
          `\n\n${quoteNote}`;
      }

      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'admin',
          NULL,
          ?
        )
      `)
      .run(
        requestId,
        quoteMessage
      );

      /* -----------------------------------------------------
         GET UPDATED REQUEST
      ----------------------------------------------------- */

      const updatedRequest =
        db.prepare(`
          SELECT
            r.*,

            c.full_name AS customer_name,
            c.customer_code,

            s.name AS service_name

          FROM customer_requests r

          LEFT JOIN customers c
            ON c.id = r.customer_id

          LEFT JOIN services s
            ON s.id = r.service_id

          WHERE r.id = ?
        `)
        .get(requestId);

      res.json({
        success: true,
        message:
          "Quotation sent successfully.",
        request:
          updatedRequest,
      });

    } catch (error) {

      console.error(
        "ADMIN SEND QUOTE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to send quotation.",
        error: error.message,
      });
    }
  }
);


/* =========================================================
   ADMIN - CLOSE / REJECT CUSTOMER REQUEST
   ========================================================= */

app.post(
  "/api/admin/customer-requests/:id/reject",
  (req, res) => {

    try {

      const requestId =
        Number(req.params.id);

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid request ID.",
        });
      }

      const request =
        db.prepare(`
          SELECT id
          FROM customer_requests
          WHERE id = ?
        `)
        .get(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message:
            "Customer request not found.",
        });
      }

      db.prepare(`
        UPDATE customer_requests

        SET
          status = 'closed',
          quote_status = 'declined',
          declined_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .run(requestId);

      db.prepare(`
        INSERT INTO
        customer_request_messages
        (
          request_id,
          sender_type,
          sender_id,
          message
        )

        VALUES
        (
          ?,
          'system',
          NULL,
          'This request was closed by YN Studio.'
        )
      `)
      .run(requestId);

      res.json({
        success: true,
        message:
          "Customer request closed.",
      });

    } catch (error) {

      console.error(
        "ADMIN REJECT REQUEST ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to close customer request.",
      });
    }
  }
);

// =========================================================
// GET ALL ORDERS
// =========================================================

// =========================================================
// GET ALL ORDERS
// Includes customer request information so
// VietnamOrders.jsx and ChinaOrders.jsx can
// correctly identify their orders.
// =========================================================

app.get("/orders", (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT
        o.id,
        o.customer_id,
        o.service_id,
        o.quantity,
        o.price,
        o.total,
        o.status,
        o.notes,
        o.created_at,
        o.public_order_number,
        o.payment_amount,
        o.payment_submitted_at,
        o.payment_status,
        o.updated_at,
        o.file_name,
        o.file_type,
        o.file_size,
        o.china_status,
        o.china_proof_uploaded_at,
        o.vietnam_status,
        o.vietnam_proof_uploaded_at,
        o.order_type,
        o.order_date,

        customers.full_name AS customer_name,
        customers.customer_code,
        customers.customer_type,
        customers.phone,

        cr.request_type,
        cr.product_link,
        cr.quantity AS request_quantity,
        cr.details AS request_details,
        cr.deadline AS request_deadline,
        cr.quote_amount,
        cr.quote_status

      FROM orders o

      LEFT JOIN customers
        ON customers.id = o.customer_id

      LEFT JOIN customer_requests cr
        ON cr.order_id = o.id

      ORDER BY
        o.created_at DESC,
        o.id DESC
    `).all();

    const getServices = db.prepare(`
      SELECT
        oi.id,
        oi.order_id,
        oi.service_id,
        oi.quantity,
        oi.price,
        oi.total,
        oi.approved_date,
        oi.notes,
        oi.file_name,
        oi.file_type,
        oi.file_size,
        oi.created_at,
        s.name AS service_name,
        s.price AS service_price,
        s.allow_file_upload

      FROM order_items oi

      LEFT JOIN services s
        ON s.id = oi.service_id

      WHERE oi.order_id = ?

      ORDER BY oi.id ASC
    `);

    const result = orders.map((order) => {
      const services =
        getServices.all(order.id);

      let serviceName =
        services[0]?.service_name;

      if (!serviceName) {
        if (
          String(order.request_type || "")
            .toLowerCase() === "vietnam"
        ) {
          serviceName = "Vietnam Purchase";
        } else if (
          String(order.request_type || "")
            .toLowerCase() === "china"
        ) {
          serviceName = "China Purchase";
        } else {
          serviceName = "YN Studio Order";
        }
      }

      return {
        ...order,

        services,

        service_name:
          order.service_name ||
          serviceName,

        // Make sure frontend always receives
        // these fields.
        request_type:
          order.request_type ||
          null,

        product_link:
          order.product_link ||
          null,

        details:
          order.request_details ||
          order.details ||
          null,

        customer_name:
          order.customer_name ||
          order.full_name ||
          "Unknown Customer",

        payment_amount:
          Number(
            order.payment_amount ??
            order.total ??
            0
          ),

        payment_status:
          order.payment_status ||
          "unpaid",

        vietnam_status:
          order.vietnam_status ||
          (
            String(order.request_type || "")
              .toLowerCase() === "vietnam"
              ? (
                  order.payment_status === "paid"
                    ? "ordered"
                    : "pending_payment"
                )
              : null
          ),

        china_status:
          order.china_status ||
          (
            String(order.request_type || "")
              .toLowerCase() === "china"
                ? (
                    order.payment_status === "paid"
                      ? "ordered"
                      : "pending_payment"
                  )
                : null
          ),
      };
    });

    res.json({
      success: true,
      orders: result,
    });

  } catch (error) {
    console.error(
      "GET /orders ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Failed to load orders",
      details:
        error.message,
    });
  }
});
// =========================================================
// GET ONE ORDER
// =========================================================

app.get("/orders/:id", (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        error: "Invalid order ID",
      });
    }

    const order = db.prepare(`
      SELECT
        orders.id,
        orders.customer_id,
        orders.service_id,
        orders.quantity,
        orders.price,
        orders.total,
        orders.status,
        orders.notes,
        orders.created_at,
        orders.public_order_number,
        orders.payment_amount,
        orders.payment_submitted_at,
        orders.payment_status,
        orders.updated_at,
        orders.file_name,
        orders.file_type,
        orders.file_size,
        orders.china_status,
        orders.china_proof_uploaded_at,
        orders.vietnam_status,
        orders.vietnam_proof_uploaded_at,
        orders.order_type,
        orders.order_date,
        customers.full_name AS customer_name,
        customers.customer_code,
        customers.customer_type
      FROM orders
      LEFT JOIN customers
        ON customers.id = orders.customer_id
      WHERE orders.id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const services = db.prepare(`
      SELECT
        order_items.id,
        order_items.order_id,
        order_items.service_id,
        order_items.quantity,
        order_items.price,
        order_items.total,
        order_items.approved_date,
        order_items.notes,
        order_items.file_name,
        order_items.file_type,
        order_items.file_size,
        order_items.file_data,
        order_items.created_at,
        services.name AS service_name,
        services.price AS service_price,
        services.allow_file_upload
      FROM order_items
      LEFT JOIN services
        ON services.id = order_items.service_id
      WHERE order_items.order_id = ?
      ORDER BY order_items.id ASC
    `).all(orderId);

    res.json({
      ...order,
      services,
    });

  } catch (error) {
    console.error(
      "GET /orders/:id ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to load order",
      details: error.message,
    });
  }
});
/* =========================================================
   DELETE ORDER
   ========================================================= */

app.delete("/orders/:id", (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        error: "Invalid order ID",
      });
    }

    const existing = db
      .prepare(`
        SELECT id
        FROM orders
        WHERE id = ?
      `)
      .get(orderId);

    if (!existing) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    // Delete the services belonging to this order first
    db.prepare(`
      DELETE FROM order_items
      WHERE order_id = ?
    `).run(orderId);

    // Then delete the main order
    db.prepare(`
      DELETE FROM orders
      WHERE id = ?
    `).run(orderId);

    res.json({
      success: true,
      message: "Order deleted successfully",
    });

  } catch (error) {
    console.error(
      "DELETE /orders/:id ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to delete order",
      details: error.message,
    });
  }
});
// =========================================================
// CREATE ORDER
// ONE ORDER CAN CONTAIN MULTIPLE SERVICES
// =========================================================

app.post("/orders", async (req, res) => {

  try {

    const body = req.body || {};

    const customer_id = Number(body.customer_id);

    let servicesList = Array.isArray(body.services)
      ? [...body.services]
      : [];


    // -----------------------------------------------------
    // CUSTOMER
    // -----------------------------------------------------

    if (!customer_id) {

      return res.status(400).json({
        error: "Customer is required",
      });

    }


    const customer = db.prepare(`
      SELECT
        id,
        full_name,
        customer_code,
        customer_type

      FROM customers

      WHERE id = ?
    `).get(customer_id);


    if (!customer) {

      return res.status(404).json({
        error: "Customer not found",
      });

    }


    // -----------------------------------------------------
    // DIRECT CHINA / VIETNAM ORDER
    // -----------------------------------------------------

    const orderType = String(body.order_type || "service").toLowerCase();
    const normalizedOrderDate = normalizeDateOnly(body.order_date);

    if (["china", "vietnam"].includes(orderType)) {
      const customPrice = Number(body.custom_price);
      const orderDate = normalizeDateOnly(body.order_date);

      if (!Number.isFinite(customPrice) || customPrice < 0) {
        return res.status(400).json({
          error: "A valid order price is required.",
        });
      }

      if (!orderDate) {
        return res.status(400).json({
          error: "Order date is required.",
        });
      }

      const systemServiceName =
        orderType === "china" ? "China Purchase" : "Vietnam Purchase";

      let systemService = db.prepare(`
        SELECT id, name, price, allow_file_upload
        FROM services
        WHERE name = ?
        ORDER BY id ASC
        LIMIT 1
      `).get(systemServiceName);

      if (!systemService) {
        // Supabase projects created from older YN Studio schemas can have
        // services.active / services.allow_file_upload as either BOOLEAN
        // or INTEGER. Detect the actual PostgreSQL type before inserting so
        // a direct China/Vietnam order cannot fail on a type mismatch.
        const serviceColumns = db
          .prepare(`PRAGMA table_info(services)`)
          .all();

        const activeColumn = serviceColumns.find(
          (column) => column.name === "active"
        );
        const uploadColumn = serviceColumns.find(
          (column) => column.name === "allow_file_upload"
        );

        const activeIsBoolean =
          String(activeColumn?.type || "").toLowerCase() === "boolean";
        const uploadIsBoolean =
          String(uploadColumn?.type || "").toLowerCase() === "boolean";

        const activeValue = activeIsBoolean ? true : 1;
        const uploadValue = uploadIsBoolean ? true : 1;

        const created = db.prepare(`
          INSERT INTO services
          (name, price, description, active, service_code, category, allow_file_upload)
          VALUES (?, 0, ?, ?, ?, ?, ?)
        `).run(
          systemServiceName,
          `System service used for ${orderType} orders created by admin.`,
          activeValue,
          orderType === "china" ? "CHINA-PURCHASE" : "VIETNAM-PURCHASE",
          orderType,
          uploadValue
        );

        systemService = db.prepare(`
          SELECT id, name, price, allow_file_upload
          FROM services
          WHERE id = ?
        `).get(created.lastInsertRowid);
      }

      // Direct China/Vietnam orders may include a product picture.
      // Ensure the internal system service accepts that file using the
      // actual PostgreSQL type in the existing Supabase database.
      if (
        systemService &&
        Number(systemService.allow_file_upload) !== 1 &&
        systemService.allow_file_upload !== true
      ) {
        const serviceColumns = db
          .prepare(`PRAGMA table_info(services)`)
          .all();

        const uploadColumn = serviceColumns.find(
          (column) => column.name === "allow_file_upload"
        );

        const uploadIsBoolean =
          String(uploadColumn?.type || "").toLowerCase() === "boolean";

        db.prepare(
          `UPDATE services SET allow_file_upload = ? WHERE id = ?`
        ).run(uploadIsBoolean ? true : 1, systemService.id);

        systemService.allow_file_upload = uploadIsBoolean ? true : 1;
      }

      servicesList = [{
        service_id: Number(systemService.id),
        quantity: 1,
        approved_date: orderDate,
        notes: body.notes || "",
        price: customPrice,
        file_data: body.product_image || null,
        file_name: body.product_image_name || null,
        file_type: body.product_image_type || null,
        file_size: Number(body.product_image_size || 0),
      }];
    }

    // -----------------------------------------------------
    // STORE UPLOADED FILES IN SUPABASE STORAGE
    // Keep only small URLs in PostgreSQL/Render memory.
    // -----------------------------------------------------
    if (body.product_image) {
      body.product_image = await uploadDataUrl(
        body.product_image,
        body.product_image_type || "image/jpeg",
        `orders/${customer_id}`
      );
    }

    servicesList = await Promise.all(
      servicesList.map(async (item) => ({
        ...item,
        file_data: item.file_data
          ? await uploadDataUrl(
              item.file_data,
              item.file_type || "application/octet-stream",
              `orders/${customer_id}/items`
            )
          : null,
      }))
    );

    // -----------------------------------------------------
    // SERVICES
    // -----------------------------------------------------

    if (servicesList.length === 0) {

      return res.status(400).json({
        error: "At least one service is required",
      });

    }


    // -----------------------------------------------------
    // PREPARE INSERTS
    // -----------------------------------------------------

    const createOrder = db.transaction(() => {

      let orderTotal = 0;


      // ---------------------------------------------------
      // CREATE THE MAIN ORDER
      // ---------------------------------------------------

      // -----------------------------------------------------
// GENERATE RANDOM PUBLIC ORDER NUMBER
// -----------------------------------------------------

function generatePublicOrderNumber() {
  let number;
  let exists;

  do {
    // 6-digit random number
    number = String(
      Math.floor(
        100000 + Math.random() * 900000
      )
    );

    exists = db
      .prepare(`
        SELECT id
        FROM orders
        WHERE public_order_number = ?
      `)
      .get(number);

  } while (exists);

  return number;
}

const publicOrderNumber =
  generatePublicOrderNumber();


// -----------------------------------------------------
// CREATE MAIN ORDER
// -----------------------------------------------------

const orderResult = db.prepare(`
  INSERT INTO orders
  (
    customer_id,
    status,
    total,
    notes,
    public_order_number,
    order_type,
    order_date,
    product_image
  )

  VALUES
  (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  customer_id,
  body.status || "pending",
  0,
  body.notes || "",
  publicOrderNumber,
  orderType,
  normalizedOrderDate || null,
  body.product_image || null
);

const orderId =
  Number(orderResult.lastInsertRowid);


      // ---------------------------------------------------
      // INSERT EACH SERVICE
      // ---------------------------------------------------

      const insertItem = db.prepare(`
        INSERT INTO order_items
        (
          order_id,
          service_id,
          quantity,
          price,
          total,
          approved_date,
          notes,
          file_name,
          file_type,
          file_size,
          file_data
        )

        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);


      for (const item of servicesList) {

        const service_id =
          Number(item.service_id);


        const quantity =
          Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1;


        // -----------------------------------------------
        // SERVICE
        // -----------------------------------------------

        const service = db.prepare(`
          SELECT
            id,
            name,
            price,
            allow_file_upload

          FROM services

          WHERE id = ?
        `).get(service_id);


        if (!service) {

          throw new Error(
            `Service not found: ${service_id}`
          );

        }


        // -----------------------------------------------
        // PRICE
        // -----------------------------------------------

        const requestedPrice = Number(item.price);
        const price =
          Number.isFinite(requestedPrice) && requestedPrice >= 0
            ? requestedPrice
            : (Number(service.price) || 0);


        const itemTotal =
          Number(
            (price * quantity).toFixed(2)
          );


        // -----------------------------------------------
        // FILE
        // -----------------------------------------------

        const fileData =
          item.file_data || null;


        if (
          fileData &&
          Number(service.allow_file_upload) !== 1
        ) {

          throw new Error(
            `File upload is disabled for service: ${service.name}`
          );

        }


        const fileName =
          item.file_name || null;


        const fileType =
          item.file_type || null;


        const fileSize =
          Number(item.file_size) || 0;


        // -----------------------------------------------
        // APPROVED DATE
        // -----------------------------------------------

        const approvedDate =
          item.approved_date || null;


        // -----------------------------------------------
        // NOTES
        // -----------------------------------------------

        const notes =
          item.notes == null
            ? ""
            : String(item.notes);


        // -----------------------------------------------
        // INSERT ITEM
        // -----------------------------------------------

        insertItem.run(
          orderId,
          service_id,
          quantity,
          price,
          itemTotal,
          approvedDate,
          notes,
          fileName,
          fileType,
          fileSize,
          fileData
        );


        orderTotal += itemTotal;

      }


      // ---------------------------------------------------
      // UPDATE MAIN ORDER TOTAL
      // ---------------------------------------------------

      db.prepare(`
        UPDATE orders

        SET total = ?,
            order_type = ?,
            order_date = ?,
            product_image = ?

        WHERE id = ?
      `).run(
        Number(orderTotal.toFixed(2)),
        orderType,
        normalizedOrderDate || null,
        body.product_image || null,
        orderId
      );

      if (["china", "vietnam"].includes(orderType)) {
        const systemServiceId = Number(servicesList[0].service_id);

        db.prepare(`
          INSERT INTO customer_requests
          (
            customer_id,
            request_type,
            service_id,
            quantity,
            details,
            status,
            quote_amount,
            quote_currency,
            quote_status,
            order_id
          )
          VALUES (?, ?, ?, 1, ?, 'closed', ?, 'USD', 'accepted', ?)
        `).run(
          customer_id,
          orderType,
          systemServiceId,
          body.notes || `${orderType} order created by admin.`,
          Number(orderTotal.toFixed(2)),
          orderId
        );
      }

      createCustomerNotification(
        customer_id,
        "order_created",
        "New order created",
        `${orderType === "china" ? "China" : orderType === "vietnam" ? "Vietnam" : "Service"} order #${publicOrderNumber} was created for you.`,
        { order_id: orderId, order_type: orderType, public_order_number: publicOrderNumber }
      );

      return orderId;

    });


    const orderId = createOrder();


    // -----------------------------------------------------
    // RETURN ORDER
    // -----------------------------------------------------

    const orders = db.prepare(`
      SELECT
        orders.*,

        customers.full_name AS customer_name,
        customers.customer_code,
        customers.customer_type

      FROM orders

      LEFT JOIN customers
        ON customers.id = orders.customer_id

      WHERE orders.id = ?
    `).get(orderId);


    const services = db.prepare(`
      SELECT
        order_items.*,

        services.name AS service_name,
        services.price AS service_price,
        services.allow_file_upload

      FROM order_items

      LEFT JOIN services
        ON services.id = order_items.service_id

      WHERE order_items.order_id = ?

      ORDER BY order_items.id ASC
    `).all(orderId);


    res.status(201).json({

      success: true,

      order: {
        ...orders,
        services,
      },

    });

  } catch (error) {

    console.error(
      "POST /orders ERROR:",
      error
    );

    res.status(500).json({
      error:
        error.message ||
        "Failed to create order",

      details: error.message,
    });

  }

});



/* =========================================================
   CUSTOMER NOTIFICATIONS
========================================================= */
app.get("/api/customer/notifications", authenticateToken, (req, res) => {
  try {
    if (req.user.type !== "customer") {
      return res.status(401).json({ message: "Customer authentication required." });
    }
    const customerId = Number(req.user.id);
    const notifications = db.prepare(`
      SELECT id, type, title, message, data, read_at, created_at
      FROM customer_notifications
      WHERE customer_id = ?
      ORDER BY id DESC
      LIMIT 100
    `).all(customerId).map((item) => ({
      ...item,
      data: item.data ? (() => { try { return JSON.parse(item.data); } catch { return null; } })() : null,
      read: Boolean(item.read_at),
    }));
    res.json({ success: true, notifications, unread_count: notifications.filter((n) => !n.read).length });
  } catch (error) {
    console.error("CUSTOMER NOTIFICATIONS LOAD ERROR:", error);
    res.status(500).json({ message: "Failed to load notifications." });
  }
});

app.patch("/api/customer/notifications/:id/read", authenticateToken, (req, res) => {
  try {
    if (req.user.type !== "customer") {
      return res.status(401).json({ message: "Customer authentication required." });
    }
    const id = Number(req.params.id);
    const customerId = Number(req.user.id);
    if (!id) return res.status(400).json({ message: "Invalid notification." });
    db.prepare(`
      UPDATE customer_notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id = ?
    `).run(id, customerId);
    res.json({ success: true });
  } catch (error) {
    console.error("CUSTOMER NOTIFICATION READ ERROR:", error);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

app.patch("/api/customer/notifications/read-all", authenticateToken, (req, res) => {
  try {
    if (req.user.type !== "customer") {
      return res.status(401).json({ message: "Customer authentication required." });
    }
    db.prepare(`
      UPDATE customer_notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE customer_id = ? AND read_at IS NULL
    `).run(Number(req.user.id));
    res.json({ success: true });
  } catch (error) {
    console.error("CUSTOMER NOTIFICATIONS READ ALL ERROR:", error);
    res.status(500).json({ message: "Failed to update notifications." });
  }
});

/* =========================================================
   CUSTOMER COUPONS
   Customer-facing read/validate endpoints.
========================================================= */

app.get(
  "/api/customer/coupons",
  authenticateToken,
  (req, res) => {
    try {
      const customerId = Number(req.user.id);

      if (!customerId || req.user.type !== "customer") {
        return res.status(401).json({ message: "Customer authentication required." });
      }

      const coupons = db.prepare(`
        SELECT
          id,
          code,
          discount_type,
          discount_value,
          expires_at,
          notes,
          created_at
        FROM customer_coupons
        WHERE customer_id = ?
          AND (
            expires_at IS NULL
            OR NULLIF(TRIM(expires_at::text), '') IS NULL
            OR TRIM(expires_at::text) >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          )
        ORDER BY id DESC
      `).all(customerId);

      res.json({
        success: true,
        coupons,
      });
    } catch (error) {
      console.error("CUSTOMER COUPONS LOAD ERROR:", error);
      res.status(500).json({ message: "Failed to load coupons." });
    }
  }
);

app.post(
  "/api/customer/coupons/validate",
  authenticateToken,
  (req, res) => {
    try {
      const customerId = Number(req.user.id);
      const code = String(req.body?.code || "").trim().toUpperCase();

      if (!customerId || req.user.type !== "customer") {
        return res.status(401).json({ message: "Customer authentication required." });
      }

      if (!code) {
        return res.status(400).json({ message: "Coupon code is required." });
      }

      const coupon = db.prepare(`
        SELECT
          id,
          code,
          discount_type,
          discount_value,
          expires_at,
          notes
        FROM customer_coupons
        WHERE customer_id = ?
          AND UPPER(code) = UPPER(?)
        LIMIT 1
      `).get(customerId, code);

      if (!coupon) {
        return res.status(404).json({
          valid: false,
          message: "Coupon not found.",
        });
      }

      if (
        coupon.expires_at &&
        String(coupon.expires_at).trim() &&
        new Date(coupon.expires_at).getTime() < Date.now()
      ) {
        return res.status(400).json({
          valid: false,
          message: "This coupon has expired.",
        });
      }

      res.json({
        valid: true,
        coupon,
      });
    } catch (error) {
      console.error("CUSTOMER COUPON VALIDATE ERROR:", error);
      res.status(500).json({ message: "Failed to validate coupon." });
    }
  }
);

/* =========================================================
   CUSTOMER COUPONS
========================================================= */



/* =========================================================
   UPDATE ORDER
   ========================================================= */

app.put("/orders/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const body = req.body || {};

    const customer_id = Number(body.customer_id);
    const servicesList = Array.isArray(body.services)
      ? body.services
      : [];

    // -----------------------------------------------
    // VALIDATE ORDER ID
    // -----------------------------------------------

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID",
      });
    }

    // -----------------------------------------------
    // CHECK ORDER EXISTS
    // -----------------------------------------------

    const existingOrder = db
      .prepare(`
        SELECT id
        FROM orders
        WHERE id = ?
      `)
      .get(orderId);

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // -----------------------------------------------
    // VALIDATE CUSTOMER
    // -----------------------------------------------

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: "Customer is required",
      });
    }

    const customer = db
      .prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
      `)
      .get(customer_id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
      });
    }

    // -----------------------------------------------
    // VALIDATE SERVICES
    // -----------------------------------------------

    if (servicesList.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one service is required",
      });
    }

    // -----------------------------------------------
    // STORE UPDATED FILES IN SUPABASE STORAGE
    // -----------------------------------------------
    if (body.product_image) {
      body.product_image = await uploadDataUrl(
        body.product_image,
        body.product_image_type || "image/jpeg",
        `orders/${customer_id}`
      );
    }

    const storedServicesList = await Promise.all(
      servicesList.map(async (item) => ({
        ...item,
        file_data: item.file_data
          ? await uploadDataUrl(
              item.file_data,
              item.file_type || "application/octet-stream",
              `orders/${customer_id}/items`
            )
          : null,
      }))
    );

    // -----------------------------------------------
    // UPDATE ORDER
    // -----------------------------------------------

    const updateOrder = db.transaction(() => {

      let orderTotal = 0;

      // ---------------------------------------------
      // UPDATE MAIN ORDER
      // ---------------------------------------------

      db.prepare(`
        UPDATE orders
        SET
          customer_id = ?,
          notes = ?
        WHERE id = ?
      `).run(
        customer_id,
        body.notes || "",
        orderId
      );

      // ---------------------------------------------
      // REMOVE OLD ORDER ITEMS
      // ---------------------------------------------

      db.prepare(`
        DELETE FROM order_items
        WHERE order_id = ?
      `).run(orderId);

      // ---------------------------------------------
      // PREPARE NEW ORDER ITEMS
      // ---------------------------------------------

      const insertItem = db.prepare(`
        INSERT INTO order_items
        (
          order_id,
          service_id,
          quantity,
          price,
          total,
          approved_date,
          notes,
          file_name,
          file_type,
          file_size,
          file_data
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // ---------------------------------------------
      // INSERT NEW SERVICES
      // ---------------------------------------------

      for (const item of storedServicesList) {

        const service_id = Number(item.service_id);

        const quantity =
          Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1;

        // -------------------------------------------
        // GET SERVICE
        // -------------------------------------------

        const service = db
          .prepare(`
            SELECT
              id,
              name,
              price,
              allow_file_upload
            FROM services
            WHERE id = ?
          `)
          .get(service_id);

        if (!service) {
          throw new Error(
            `Service not found: ${service_id}`
          );
        }

        // -------------------------------------------
        // PRICE
        // -------------------------------------------

        const price =
          Number(service.price) || 0;

        const itemTotal =
          Number(
            (price * quantity).toFixed(2)
          );

        // -------------------------------------------
        // FILE
        // -------------------------------------------

        const fileData =
          item.file_data || null;

        const fileName =
          item.file_name || null;

        const fileType =
          item.file_type || null;

        const fileSize =
          Number(item.file_size) || 0;

        // -------------------------------------------
        // APPROVED DATE
        // -------------------------------------------

        const approvedDate =
          item.approved_date || null;

        // -------------------------------------------
        // NOTES
        // -------------------------------------------

        const notes =
          item.notes == null
            ? ""
            : String(item.notes);

        // -------------------------------------------
        // INSERT
        // -------------------------------------------

        insertItem.run(
          orderId,
          service_id,
          quantity,
          price,
          itemTotal,
          approvedDate,
          notes,
          fileName,
          fileType,
          fileSize,
          fileData
        );

        orderTotal += itemTotal;
      }

      // ---------------------------------------------
      // UPDATE TOTAL
      // ---------------------------------------------

      db.prepare(`
        UPDATE orders
        SET total = ?
        WHERE id = ?
      `).run(
        Number(orderTotal.toFixed(2)),
        orderId
      );
    });

    // Run transaction
    updateOrder();

    // -----------------------------------------------
    // GET UPDATED ORDER
    // -----------------------------------------------

    const order = db
      .prepare(`
        SELECT
          orders.*,
          customers.full_name AS customer_name,
          customers.customer_code,
          customers.customer_type
        FROM orders
        LEFT JOIN customers
          ON customers.id = orders.customer_id
        WHERE orders.id = ?
      `)
      .get(orderId);

    // -----------------------------------------------
    // GET UPDATED SERVICES
    // -----------------------------------------------

    const services = db
      .prepare(`
        SELECT
          order_items.*,
          services.name AS service_name,
          services.price AS service_price,
          services.allow_file_upload
        FROM order_items
        LEFT JOIN services
          ON services.id = order_items.service_id
        WHERE order_items.order_id = ?
        ORDER BY order_items.id ASC
      `)
      .all(orderId);

    // -----------------------------------------------
    // RESPONSE
    // -----------------------------------------------

    console.log(
      `ORDER #${orderId} UPDATED SUCCESSFULLY`
    );

    res.json({
      success: true,
      message: "Order updated successfully",
      order: {
        ...order,
        services,
      },
    });

  } catch (error) {

    console.error(
      "PUT /orders/:id ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to update order",
      details: error.message,
    });
  }
});


/* =========================================================
   CUSTOMER COUPONS
========================================================= */
/* GET CUSTOMER COUPONS */

app.get("/customers/:customerId/coupons", (req, res) => {
  try {
    const customerId = Number(req.params.customerId);

    if (!customerId) {
      return res.status(400).json({
        error: "Invalid customer",
      });
    }

    const customer = db
      .prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
      `)
      .get(customerId);

    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    const coupons = db
      .prepare(`
        SELECT *
        FROM customer_coupons
        WHERE customer_id = ?
        ORDER BY id DESC
      `)
      .all(customerId);

    res.json(coupons);

  } catch (error) {
    console.error(
      "GET CUSTOMER COUPONS ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to load coupons",
    });
  }
});


/* ADD CUSTOMER COUPON */

app.post("/customers/:customerId/coupons", (req, res) => {
  try {
    const customerId = Number(req.params.customerId);

    const code = String(
      req.body.code || ""
    ).trim().toUpperCase();

    const discountType =
      req.body.discount_type || "fixed";

    const discountValue =
      Number(req.body.discount_value);

    const expiresAt =
      req.body.expires_at || null;

    const notes =
      String(req.body.notes || "").trim();

    if (!customerId) {
      return res.status(400).json({
        error: "Invalid customer",
      });
    }

    if (!code) {
      return res.status(400).json({
        error: "Coupon code is required",
      });
    }

    if (
      discountType !== "fixed" &&
      discountType !== "percentage"
    ) {
      return res.status(400).json({
        error: "Invalid discount type",
      });
    }

    if (
      !Number.isFinite(discountValue) ||
      discountValue <= 0
    ) {
      return res.status(400).json({
        error: "Discount value must be greater than 0",
      });
    }

    if (
      discountType === "percentage" &&
      discountValue > 100
    ) {
      return res.status(400).json({
        error: "Percentage discount cannot exceed 100%",
      });
    }

    const customer = db
      .prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
      `)
      .get(customerId);

    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO customer_coupons
        (
          customer_id,
          code,
          discount_type,
          discount_value,
          expires_at,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        customerId,
        code,
        discountType,
        discountValue,
        expiresAt,
        notes
      );

    createCustomerNotification(
      customerId,
      "coupon",
      "You received a coupon",
      `Coupon ${code} is now available in your YN Studio account.`,
      { coupon_code: code }
    );

    const coupon = db
      .prepare(`
        SELECT *
        FROM customer_coupons
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json(coupon);

  } catch (error) {
    console.error(
      "ADD CUSTOMER COUPON ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to add coupon",
    });
  }
});


/* DELETE CUSTOMER COUPON */

app.delete("/customers/:customerId/coupons/:couponId", (req, res) => {
  try {
    const customerId =
      Number(req.params.customerId);

    const couponId =
      Number(req.params.couponId);

    if (!customerId || !couponId) {
      return res.status(400).json({
        error: "Invalid customer or coupon",
      });
    }

    const coupon = db
      .prepare(`
        SELECT id
        FROM customer_coupons
        WHERE id = ?
          AND customer_id = ?
      `)
      .get(
        couponId,
        customerId
      );

    if (!coupon) {
      return res.status(404).json({
        error: "Coupon not found",
      });
    }

    db.prepare(`
      DELETE FROM customer_coupons
      WHERE id = ?
        AND customer_id = ?
    `).run(
      couponId,
      customerId
    );

    res.json({
      success: true,
    });

  } catch (error) {
    console.error(
      "DELETE CUSTOMER COUPON ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to remove coupon",
    });
  }
});



/* =========================================================
   CUSTOMER LOAN PAYMENT REQUESTS
   Customer submits amount + method + receipt. The loan balance
   is NOT changed here. Admin approval performs the deduction.
========================================================= */

try {
  ensureColumn("payments", "loan_id", "INTEGER");
  ensureColumn("payments", "payment_method", "TEXT");
} catch (migrationError) {
  console.error("PAYMENT COLUMN MIGRATION ERROR:", migrationError);
}

app.post(
  "/loans/customer/:customerId/payment-request",
  authenticateToken,
  requestUpload.single("payment_proof"),
  async (req, res) => {
    try {
      const customerId = Number(req.params.customerId);
      const tokenCustomerId = Number(req.user?.customerId || req.user?.id);
      const amount = Number(req.body?.amount);
      const paymentMethod = String(req.body?.payment_method || "").trim().toLowerCase();

      if (!Number.isInteger(customerId) || customerId <= 0 || customerId !== tokenCustomerId) {
        return res.status(403).json({ error: "You can only submit a payment for your own loan." });
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Payment receipt is required." });
      }

      if (!["qr", "bank"].includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment method." });
      }

      const loan = db.prepare(`
        SELECT *
        FROM customer_loans
        WHERE customer_id = ?
          AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `).get(customerId);

      if (!loan) {
        return res.status(404).json({ error: "No active loan found." });
      }

      const remaining = Math.max(0, Number(loan.principal_remaining ?? loan.remaining_balance ?? 0));
      if (remaining <= 0) {
        return res.status(400).json({ error: "Loan is already paid off." });
      }
      if (amount > remaining) {
        return res.status(400).json({ error: "Payment cannot be greater than the remaining balance." });
      }

      const pending = db.prepare(`
        SELECT id
        FROM payments
        WHERE customer_id = ?
          AND type = 'loan'
          AND loan_id = ?
          AND status = 'pending'
        LIMIT 1
      `).get(customerId, loan.id);

      if (pending) {
        return res.status(400).json({ error: "You already have a loan payment waiting for approval." });
      }

      const paymentImage = await uploadBuffer(
        req.file.buffer,
        req.file.mimetype,
        `loan-payments/${customerId}`
      );
      const result = db.prepare(`
        INSERT INTO payments
          (customer_id, type, amount, payment_image, status, loan_id, payment_method)
        VALUES (?, 'loan', ?, ?, 'pending', ?, ?)
      `).run(customerId, amount, paymentImage, loan.id, paymentMethod);

      res.status(201).json({
        success: true,
        id: Number(result.lastInsertRowid),
        loan_id: Number(loan.id),
        amount,
        payment_method: paymentMethod,
        status: "pending",
        message: "Loan payment submitted for approval."
      });
    } catch (error) {
      console.error("LOAN PAYMENT REQUEST ERROR:", error);
      res.status(500).json({ error: "Failed to submit loan payment.", details: error.message });
    }
  }
);

app.get(
  "/loans/customer/:customerId/payment-requests",
  authenticateToken,
  (req, res) => {
    try {
      const customerId = Number(req.params.customerId);
      const tokenCustomerId = Number(req.user?.customerId || req.user?.id);
      if (!Number.isInteger(customerId) || customerId !== tokenCustomerId) {
        return res.status(403).json({ error: "Access denied." });
      }
      const rows = db.prepare(`
        SELECT id, customer_id, amount, payment_image, status, created_at, loan_id, payment_method
        FROM payments
        WHERE customer_id = ? AND type = 'loan'
        ORDER BY created_at DESC, id DESC
      `).all(customerId);
      res.json(rows);
    } catch (error) {
      console.error("GET LOAN PAYMENT REQUESTS ERROR:", error);
      res.status(500).json({ error: "Failed to load loan payment requests." });
    }
  }
);

/* =========================================================
   ADMIN LOAN PAYMENT APPROVAL
========================================================= */

app.get("/admin/loan-payments", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.customer_id, p.loan_id, p.amount, p.status, p.created_at,
             c.full_name, c.customer_code, c.email, c.phone,
             l.total_amount AS loan_total,
             COALESCE(l.principal_remaining, l.remaining_balance, l.total_amount - l.paid_amount, 0) AS loan_remaining,
             l.repayment_frequency
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      LEFT JOIN customer_loans l ON l.id = p.loan_id
      WHERE p.type = 'loan'
      ORDER BY p.created_at DESC, p.id DESC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error("GET ADMIN LOAN PAYMENTS ERROR:", error);
    res.status(500).json({ error: "Failed to load loan payments." });
  }
});

app.put("/admin/loan-payments/:id/approve", (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: "Invalid payment ID." });
    }

    const payment = db.prepare(`
      SELECT * FROM payments WHERE id = ? AND type = 'loan' LIMIT 1
    `).get(paymentId);
    if (!payment) return res.status(404).json({ error: "Loan payment not found." });
    if (payment.status !== "pending") return res.status(400).json({ error: "This payment has already been processed." });

    const loan = db.prepare(`
      SELECT * FROM customer_loans WHERE id = ? AND customer_id = ? LIMIT 1
    `).get(payment.loan_id, payment.customer_id);
    if (!loan || loan.status !== "active") return res.status(400).json({ error: "The linked loan is no longer active." });

    const remaining = Math.max(0, Number(loan.principal_remaining ?? loan.remaining_balance ?? 0));
    const amount = Number(payment.amount || 0);
    if (amount <= 0 || amount > remaining) return res.status(400).json({ error: "The payment amount is no longer valid for this loan." });

    const newRemaining = Number((remaining - amount).toFixed(2));
    const paidOff = newRemaining <= 0;

    db.transaction(() => {
      db.prepare("UPDATE payments SET status = 'approved' WHERE id = ?").run(paymentId);
      db.prepare(`
        UPDATE customer_loans
        SET paid_amount = paid_amount + ?,
            principal_remaining = ?,
            remaining_balance = ?,
            enabled = ?,
            status = ?,
            loan_status = ?,
            payoff_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        amount, newRemaining, newRemaining,
        paidOff ? 0 : 1,
        paidOff ? "paid_off" : "active",
        paidOff ? "paid_off" : "active",
        paidOff ? getToday() : null,
        loan.id
      );
      db.prepare(`
        INSERT INTO loan_transactions (loan_id, amount, type, description)
        VALUES (?, ?, 'principal_payment', ?)
      `).run(loan.id, amount, `Approved loan payment #${paymentId}`);
      if (paidOff) {
        db.prepare(`
          UPDATE loan_payments
          SET status = 'cancelled'
          WHERE loan_id = ? AND payment_type = 'interest'
            AND status IN ('due', 'overdue')
        `).run(loan.id);
      }
    });

    const updatedLoan = db.prepare("SELECT * FROM customer_loans WHERE id = ?").get(loan.id);
    const remainingAfterApproval = Number(updatedLoan.principal_remaining ?? updatedLoan.remaining_balance ?? 0);
    res.json({
      success: true,
      message: "Loan payment approved.",
      loan: {
        ...updatedLoan,
        principal_remaining: remainingAfterApproval,
        remaining_balance: remainingAfterApproval,
        remaining: remainingAfterApproval,
        loan_status: updatedLoan.status || updatedLoan.loan_status || "active",
      },
    });
  } catch (error) {
    console.error("APPROVE LOAN PAYMENT ERROR:", error);
    res.status(500).json({ error: "Failed to approve loan payment.", details: error.message });
  }
});

app.put("/admin/loan-payments/:id/reject", (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND type = 'loan' LIMIT 1").get(paymentId);
    if (!payment) return res.status(404).json({ error: "Loan payment not found." });
    if (payment.status !== "pending") return res.status(400).json({ error: "This payment has already been processed." });
    db.prepare("UPDATE payments SET status = 'rejected' WHERE id = ?").run(paymentId);
    res.json({ success: true, message: "Loan payment rejected." });
  } catch (error) {
    console.error("REJECT LOAN PAYMENT ERROR:", error);
    res.status(500).json({ error: "Failed to reject loan payment.", details: error.message });
  }
});

/* =========================================================
   CUSTOMER SAVINGS GOALS
   Customers can save toward an item/goal, optionally paste a
   Taobao/Pinduoduo/Shein link for an item image, and manually
   enter the goal name and price.
========================================================= */

function isSupportedShoppingUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").trim());
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host === "taobao.com" || host.endsWith(".taobao.com") ||
      host === "pinduoduo.com" || host.endsWith(".pinduoduo.com") ||
      host === "shein.com" || host.endsWith(".shein.com") ||
      host.endsWith("shein.com.cn");
  } catch { return false; }
}

async function getShoppingItemImage(rawUrl) {
  if (!isSupportedShoppingUrl(rawUrl)) {
    throw new Error("Only Taobao, Pinduoduo, and Shein links are supported.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(String(rawUrl).trim(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; YNStudio/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`Shopping page returned ${response.status}.`);
    if (!isSupportedShoppingUrl(response.url)) throw new Error("The link redirected outside a supported shopping site.");
    const html = (await response.text()).slice(0, 2_000_000);
    const candidates = [];
    const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = metaRe.exec(html))) candidates.push(m[1]);
    const reverseMetaRe = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi;
    while ((m = reverseMetaRe.exec(html))) candidates.push(m[1]);
    const jsonImageRe = /["']image["']\s*:\s*["'](https?:\\?\/\\?\/[^"']+)["']/gi;
    while ((m = jsonImageRe.exec(html))) candidates.push(m[1].replace(/\\\//g, "/"));
    for (const candidate of candidates) {
      try {
        const imageUrl = new URL(candidate, response.url).toString();
        const imageHost = new URL(imageUrl).hostname.toLowerCase();
        if (/^https?:$/.test(new URL(imageUrl).protocol) && !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(imageHost)) {
          return imageUrl;
        }
      } catch {}
    }
    throw new Error("Could not find an item image on that product page.");
  } finally { clearTimeout(timeout); }
}

function assertCustomerOwns(req, customerId) {
  return req.user?.type === "customer" && Number(req.user.customerId || req.user.id) === Number(customerId);
}


// =========================================================
// ADMIN AI / YN STUDIO COPILOT
// The AI can inspect app data and perform administrator actions.
// Financial/destructive actions always require a second confirmation
// from the logged-in administrator before they are executed.
// =========================================================
const ADMIN_AI_INSTRUCTIONS = [
  "You are JARVIS, YN Studio's private administrator AI.",
  "You are exceptionally capable, knowledgeable, concise, observant, witty and confident.",
  "Speak like a polished British digital butler: dry humour, subtle attitude, never rude or insulting.",
  "You are an original YN Studio assistant named JARVIS; do not imitate or claim to be any actor or copyrighted fictional character. You may use the familiar digital-butler archetype, with your own personality.",
  "You have access to YN Studio through tools. Use tools instead of guessing app data.",
  "You can navigate the admin dashboard, inspect customers, orders, payments, savings and wallet activity, and perform supported admin actions.",
  "Never invent a successful action. Report the exact tool result.",
  "For any write action, the tool will require administrator confirmation. Explain what will happen and ask the administrator to confirm.",
  "Never ask for passwords, JWTs, API keys, card numbers, or other secrets.",
  "When an action is financially consequential, clearly state the customer, amount, and record ID before confirmation.",
  "If the requested operation is not supported by a tool, say so rather than pretending.",
].join("\n");

const ADMIN_AI_TOOLS = [
  { type:"function", name:"get_dashboard", description:"Get current YN Studio dashboard counts.", parameters:{type:"object",properties:{},additionalProperties:false} },
  { type:"function", name:"search_customers", description:"Search customers by name, customer code, phone, Telegram or Facebook.", parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false} },
  { type:"function", name:"get_customer", description:"Get one customer's profile and wallet/savings summary.", parameters:{type:"object",properties:{customer_id:{type:"integer"}},required:["customer_id"],additionalProperties:false} },
  { type:"function", name:"list_orders", description:"List recent orders with customer names and statuses. Optional status filter.", parameters:{type:"object",properties:{status:{type:"string"}},additionalProperties:false} },
  { type:"function", name:"list_pending_payments", description:"List pending wallet, loan and savings payments awaiting administrator review.", parameters:{type:"object",properties:{limit:{type:"integer"}},additionalProperties:false} },
  { type:"function", name:"list_savings", description:"List savings goals and their pending payments/requests.", parameters:{type:"object",properties:{status:{type:"string"}},additionalProperties:false} },
  { type:"function", name:"navigate", description:"Navigate the administrator UI to a page.", parameters:{type:"object",properties:{page:{type:"string",enum:["dashboard","customers","services","orders","receipts","wallet","payments","savings","loans","china-orders","vietnam-orders","settings"]}},required:["page"],additionalProperties:false} },
  { type:"function", name:"approve_saving_payment", description:"Approve a pending savings payment. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"reject_saving_payment", description:"Reject a pending savings payment. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"},note:{type:"string"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"approve_saving_request", description:"Approve a pending savings withdrawal or savings purchase request. Requires administrator confirmation.", parameters:{type:"object",properties:{request_id:{type:"integer"},note:{type:"string"}},required:["request_id"],additionalProperties:false} },
  { type:"function", name:"reject_saving_request", description:"Reject a pending savings request. Requires administrator confirmation.", parameters:{type:"object",properties:{request_id:{type:"integer"},note:{type:"string"}},required:["request_id"],additionalProperties:false} },
  { type:"function", name:"approve_wallet_payment", description:"Approve a pending customer wallet top-up payment. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"reject_wallet_payment", description:"Reject a pending customer wallet top-up payment. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"},note:{type:"string"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"approve_wallet_withdrawal", description:"Approve a pending wallet withdrawal. Requires administrator confirmation.", parameters:{type:"object",properties:{withdrawal_id:{type:"integer"}},required:["withdrawal_id"],additionalProperties:false} },
  { type:"function", name:"reject_wallet_withdrawal", description:"Reject a pending wallet withdrawal. Requires administrator confirmation.", parameters:{type:"object",properties:{withdrawal_id:{type:"integer"},note:{type:"string"}},required:["withdrawal_id"],additionalProperties:false} },
  { type:"function", name:"approve_loan_payment", description:"Approve a pending loan payment and update the loan balance. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"reject_loan_payment", description:"Reject a pending loan payment. Requires administrator confirmation.", parameters:{type:"object",properties:{payment_id:{type:"integer"}},required:["payment_id"],additionalProperties:false} },
  { type:"function", name:"confirm_action", description:"Confirm a previously proposed administrator action using its confirmation token.", parameters:{type:"object",properties:{confirmation_token:{type:"string"}},required:["confirmation_token"],additionalProperties:false} },
];

function adminAiPagePath(page) {
  const map = { dashboard:"/dashboard", customers:"/customers", services:"/services", orders:"/orders", receipts:"/receipts", wallet:"/wallet", payments:"/payments", savings:"/savings", loans:"/loans", "china-orders":"/china-orders", "vietnam-orders":"/vietnam-orders", settings:"/settings" };
  return map[page] || "/dashboard";
}

function adminAiRead(action, args) {
  switch (action) {
    case "get_dashboard": {
      const q=(sql)=>Number(db.prepare(sql).get().count||0);
      return { customers:q("SELECT COUNT(*) AS count FROM customers"), services:q("SELECT COUNT(*) AS count FROM services WHERE active = 1"), orders:q("SELECT COUNT(*) AS count FROM orders"), receipts:q("SELECT COUNT(*) AS count FROM receipts") };
    }
    case "search_customers": {
      const q=`%${String(args.query||"").trim()}%`;
      return db.prepare(`SELECT id,customer_code,full_name,customer_type,phone,telegram,facebook,address,notes,created_at FROM customers WHERE full_name LIKE ? OR customer_code LIKE ? OR phone LIKE ? OR telegram LIKE ? OR facebook LIKE ? ORDER BY id DESC LIMIT 25`).all(q,q,q,q,q);
    }
    case "get_customer": {
      const id=Number(args.customer_id); const c=db.prepare(`SELECT id,customer_code,full_name,customer_type,phone,telegram,facebook,address,notes,created_at FROM customers WHERE id=?`).get(id);
      if(!c) throw new Error("Customer not found.");
      const wallet=db.prepare(`SELECT balance FROM wallets WHERE customer_id=?`).get(id);
      const savings=db.prepare(`SELECT id,name,target_amount,current_amount,status,created_at,updated_at FROM savings_goals WHERE customer_id=? ORDER BY id DESC`).all(id);
      return {customer:c,wallet:{balance:Number(wallet?.balance||0)},savings};
    }
    case "list_orders": {
      const status=String(args.status||"").trim();
      if(status) return db.prepare(`SELECT o.id,o.public_order_number,o.customer_id,o.status,o.total,o.order_type,o.order_date,o.created_at,c.full_name,c.customer_code FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.status=? ORDER BY o.created_at DESC,o.id DESC LIMIT 50`).all(status);
      return db.prepare(`SELECT o.id,o.public_order_number,o.customer_id,o.status,o.total,o.order_type,o.order_date,o.created_at,c.full_name,c.customer_code FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC,o.id DESC LIMIT 50`).all();
    }
    case "list_pending_payments": {
      const limit=Math.min(100,Math.max(1,Number(args.limit||50)));
      const wallet=db.prepare(`SELECT p.id,p.customer_id,p.amount,p.status,p.created_at,c.full_name,c.customer_code,'wallet' AS payment_type FROM payments p JOIN customers c ON c.id=p.customer_id WHERE p.type='wallet' AND p.status='pending' ORDER BY p.created_at DESC LIMIT ?`).all(limit);
      const loans=db.prepare(`SELECT p.id,p.customer_id,p.loan_id,p.amount,p.status,p.created_at,c.full_name,c.customer_code,'loan' AS payment_type FROM payments p JOIN customers c ON c.id=p.customer_id WHERE p.type='loan' AND p.status='pending' ORDER BY p.created_at DESC LIMIT ?`).all(limit);
      const savings=db.prepare(`SELECT p.id,p.customer_id,p.saving_id,p.amount,p.payment_method,p.status,p.created_at,c.full_name,c.customer_code,s.name AS saving_name,'savings' AS payment_type FROM saving_payments p JOIN customers c ON c.id=p.customer_id JOIN savings_goals s ON s.id=p.saving_id WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT ?`).all(limit);
      return {wallet,loans,savings};
    }
    case "list_savings": {
      const status=String(args.status||"").trim();
      const goals=status?db.prepare(`SELECT s.*,c.full_name,c.customer_code FROM savings_goals s JOIN customers c ON c.id=s.customer_id WHERE s.status=? ORDER BY s.updated_at DESC,s.id DESC LIMIT 100`).all(status):db.prepare(`SELECT s.*,c.full_name,c.customer_code FROM savings_goals s JOIN customers c ON c.id=s.customer_id ORDER BY s.updated_at DESC,s.id DESC LIMIT 100`).all();
      const payments=db.prepare(`SELECT p.id,p.saving_id,p.customer_id,p.amount,p.payment_method,p.status,p.created_at,c.full_name,c.customer_code,s.name AS saving_name FROM saving_payments p JOIN customers c ON c.id=p.customer_id JOIN savings_goals s ON s.id=p.saving_id WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT 100`).all();
      const requests=db.prepare(`SELECT r.id,r.saving_id,r.customer_id,r.request_type,r.amount,r.note,r.status,r.created_at,c.full_name,c.customer_code,s.name AS saving_name FROM saving_requests r JOIN customers c ON c.id=r.customer_id JOIN savings_goals s ON s.id=r.saving_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 100`).all();
      return {goals,pendingPayments:payments,pendingRequests:requests};
    }
    case "navigate": return {navigate:adminAiPagePath(args.page)};
    default: return null;
  }
}

function createAiConfirmation(userId, action, args, summary) {
  const token=`ai_${userId}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  pendingAiActions.set(token,{userId:Number(userId),action,args,summary,createdAt:Date.now()});
  return token;
}

function performAdminAiWrite(action,args) {
  const n=(v)=>Number(v);
  switch(action) {
    case "approve_saving_payment": {
      const id=n(args.payment_id), payment=db.prepare(`SELECT * FROM saving_payments WHERE id=?`).get(id);
      if(!payment) throw new Error("Saving payment not found."); if(payment.status!=="pending") throw new Error("Saving payment already processed.");
      db.transaction(()=>{ const saving=db.prepare(`SELECT * FROM savings_goals WHERE id=?`).get(payment.saving_id); if(!saving) throw new Error("Saving goal not found."); const newAmount=Number((Number(saving.current_amount)+Number(payment.amount)).toFixed(2)); const newStatus=newAmount>=Number(saving.target_amount)?"completed":"active"; db.prepare(`UPDATE saving_payments SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(id); db.prepare(`UPDATE savings_goals SET current_amount=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(newAmount,newStatus,saving.id); });
      createCustomerNotification(payment.customer_id,'saving_payment','Saving payment approved',`$${Number(payment.amount).toFixed(2)} was added to your saving goal.`,{saving_id:payment.saving_id,amount:Number(payment.amount)}); return {success:true,action,message:`Saving payment #${id} approved.`};
    }
    case "reject_saving_payment": { const id=n(args.payment_id),p=db.prepare(`SELECT * FROM saving_payments WHERE id=?`).get(id); if(!p)throw new Error("Saving payment not found."); if(p.status!=="pending")throw new Error("Saving payment already processed."); const note=String(args.note||"").trim()||null; db.prepare(`UPDATE saving_payments SET status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id); createCustomerNotification(p.customer_id,'saving_payment','Saving payment rejected',note||'Your saving payment was rejected.',{saving_id:p.saving_id}); return {success:true,action,message:`Saving payment #${id} rejected.`}; }
    case "approve_wallet_payment": { const id=n(args.payment_id),p=db.prepare(`SELECT * FROM payments WHERE id=? AND type='wallet'`).get(id); if(!p)throw new Error("Wallet payment not found."); if(p.status!=="pending")throw new Error("Wallet payment already processed."); const amount=Number(p.amount); db.transaction(()=>{db.prepare(`INSERT OR IGNORE INTO wallets(customer_id,balance) VALUES(?,0)`).run(p.customer_id); db.prepare(`UPDATE wallets SET balance=ROUND(balance+?,2),updated_at=CURRENT_TIMESTAMP WHERE customer_id=?`).run(amount,p.customer_id); db.prepare(`UPDATE payments SET status='approved' WHERE id=? AND status='pending'`).run(id); db.prepare(`INSERT INTO wallet_transactions(customer_id,amount,type,description) VALUES(?,?,?,?)`).run(p.customer_id,amount,'deposit',`Wallet deposit approved by JARVIS (#${id})`);}); createCustomerNotification(p.customer_id,'wallet_payment','Wallet payment approved',`$${amount.toFixed(2)} was added to your wallet.`,{payment_id:id,amount}); return {success:true,message:`Wallet payment #${id} approved.`}; }
    case "reject_wallet_payment": { const id=n(args.payment_id),p=db.prepare(`SELECT * FROM payments WHERE id=? AND type='wallet'`).get(id); if(!p)throw new Error("Wallet payment not found."); if(p.status!=="pending")throw new Error("Wallet payment already processed."); const note=String(args.note||"").trim()||null; db.prepare(`UPDATE payments SET status='rejected' WHERE id=? AND status='pending'`).run(id); createCustomerNotification(p.customer_id,'wallet_payment','Wallet payment rejected',note||'Your wallet payment was rejected.',{payment_id:id}); return {success:true,message:`Wallet payment #${id} rejected.`}; }
    case "approve_wallet_withdrawal": { const id=n(args.withdrawal_id),w=db.prepare(`SELECT * FROM wallet_withdrawals WHERE id=?`).get(id); if(!w)throw new Error("Withdrawal not found."); if(w.status!=="pending")throw new Error("Withdrawal already processed."); db.transaction(()=>{const wallet=db.prepare(`SELECT balance FROM wallets WHERE customer_id=?`).get(w.customer_id); const bal=Number(wallet?.balance||0),amount=Number(w.amount); if(amount>bal)throw new Error("Customer no longer has enough wallet balance."); db.prepare(`UPDATE wallet_withdrawals SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(id); db.prepare(`UPDATE wallets SET balance=ROUND(balance-?,2),updated_at=CURRENT_TIMESTAMP WHERE customer_id=?`).run(amount,w.customer_id); db.prepare(`INSERT INTO wallet_transactions(customer_id,amount,type,description) VALUES(?,?,?,?)`).run(w.customer_id,-amount,'customer_withdrawal',`Wallet withdrawal approved by JARVIS (#${id})`);}); createCustomerNotification(w.customer_id,'wallet_withdrawal','Withdrawal approved',`$${Number(w.amount).toFixed(2)} withdrawal approved.`,{amount:Number(w.amount)}); return {success:true,message:`Wallet withdrawal #${id} approved.`}; }
    case "reject_wallet_withdrawal": { const id=n(args.withdrawal_id),w=db.prepare(`SELECT * FROM wallet_withdrawals WHERE id=?`).get(id); if(!w)throw new Error("Withdrawal not found."); if(w.status!=="pending")throw new Error("Withdrawal already processed."); const note=String(args.note||"").trim()||null; db.prepare(`UPDATE wallet_withdrawals SET status='rejected',note=COALESCE(?,note),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(note,id); createCustomerNotification(w.customer_id,'wallet_withdrawal','Withdrawal rejected',note||'Your withdrawal request was rejected.',{amount:Number(w.amount)}); return {success:true,message:`Wallet withdrawal #${id} rejected.`}; }
    case "approve_loan_payment": { const id=n(args.payment_id),p=db.prepare(`SELECT * FROM payments WHERE id=? AND type='loan'`).get(id); if(!p)throw new Error("Loan payment not found."); if(p.status!=="pending")throw new Error("Loan payment already processed."); const loan=db.prepare(`SELECT * FROM customer_loans WHERE id=? AND customer_id=?`).get(p.loan_id,p.customer_id); if(!loan||loan.status!=="active")throw new Error("Linked loan is not active."); const remaining=Number(loan.principal_remaining??loan.remaining_balance??0),amount=Number(p.amount); if(amount<=0||amount>remaining)throw new Error("Payment amount is no longer valid for this loan."); const nr=Number((remaining-amount).toFixed(2)),off=nr<=0; db.transaction(()=>{db.prepare(`UPDATE payments SET status='approved' WHERE id=? AND status='pending'`).run(id); db.prepare(`UPDATE customer_loans SET paid_amount=paid_amount+?,principal_remaining=?,remaining_balance=?,enabled=?,status=?,loan_status=?,payoff_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(amount,nr,nr,off?0:1,off?'paid_off':'active',off?'paid_off':'active',off?getToday():null,loan.id); db.prepare(`INSERT INTO loan_transactions(loan_id,amount,type,description) VALUES(?,?,?,?)`).run(loan.id,amount,`principal_payment`,`Approved by JARVIS (#${id})`); if(off)db.prepare(`UPDATE loan_payments SET status='cancelled' WHERE loan_id=? AND payment_type='interest' AND status IN ('due','overdue')`).run(loan.id);}); return {success:true,message:`Loan payment #${id} approved. Remaining balance: $${nr.toFixed(2)}.`}; }
    case "reject_loan_payment": { const id=n(args.payment_id),p=db.prepare(`SELECT * FROM payments WHERE id=? AND type='loan'`).get(id); if(!p)throw new Error("Loan payment not found."); if(p.status!=="pending")throw new Error("Loan payment already processed."); db.prepare(`UPDATE payments SET status='rejected' WHERE id=? AND status='pending'`).run(id); return {success:true,message:`Loan payment #${id} rejected.`}; }
    case "approve_saving_request": { const id=n(args.request_id),r=db.prepare(`SELECT * FROM saving_requests WHERE id=?`).get(id); if(!r)throw new Error("Saving request not found."); if(r.status!=="pending")throw new Error("Request already processed."); const note=String(args.note||"").trim()||null; db.transaction(()=>{const saving=db.prepare(`SELECT * FROM savings_goals WHERE id=?`).get(r.saving_id); if(!saving)throw new Error("Saving goal not found."); if(Number(r.amount)>Number(saving.current_amount))throw new Error("Insufficient saved amount."); const remaining=Number((Number(saving.current_amount)-Number(r.amount)).toFixed(2)); db.prepare(`UPDATE saving_requests SET status='approved',admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(note,id); db.prepare(`UPDATE savings_goals SET current_amount=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(remaining,remaining>0?'active':'withdrawn',saving.id); if(r.request_type==='withdrawal')db.prepare(`INSERT INTO wallet_withdrawals(customer_id,amount,qr_code,note,status) VALUES(?,?,?,?,?)`).run(r.customer_id,r.amount,r.qr_code,r.note,'approved'); }); createCustomerNotification(r.customer_id,'saving_request','Saving request approved',note||'Your saving request was approved.',{saving_id:r.saving_id,amount:Number(r.amount)}); return {success:true,message:`Saving request #${id} approved.`}; }
    case "reject_saving_request": { const id=n(args.request_id),r=db.prepare(`SELECT * FROM saving_requests WHERE id=?`).get(id); if(!r)throw new Error("Saving request not found."); if(r.status!=="pending")throw new Error("Request already processed."); const note=String(args.note||"").trim()||null; db.prepare(`UPDATE saving_requests SET status='rejected',admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(note,id); createCustomerNotification(r.customer_id,'saving_request','Saving request rejected',note||'Your saving request was rejected.',{saving_id:r.saving_id}); return {success:true,message:`Saving request #${id} rejected.`}; }
    default: throw new Error("Unsupported administrator action.");
  }
}

async function adminAiExecuteTool(req, name, args) {
  if (name === "confirm_action") {
    const item=pendingAiActions.get(String(args.confirmation_token||""));
    if(!item || item.userId!==Number(req.user.id) || Date.now()-item.createdAt>10*60*1000) throw new Error("That confirmation has expired or is not valid for this administrator.");
    pendingAiActions.delete(String(args.confirmation_token));
    return performAdminAiWrite(item.action,item.args);
  }
  const readActions=new Set(["get_dashboard","search_customers","get_customer","list_orders","list_pending_payments","list_savings","navigate"]);
  if(readActions.has(name)) return adminAiRead(name,args);
  const summaries={
    approve_saving_payment:`Approve savings payment #${args.payment_id}.`, reject_saving_payment:`Reject savings payment #${args.payment_id}.`,
    approve_saving_request:`Approve savings request #${args.request_id}.`, reject_saving_request:`Reject savings request #${args.request_id}.`,
    approve_wallet_payment:`Approve wallet payment #${args.payment_id}.`, reject_wallet_payment:`Reject wallet payment #${args.payment_id}.`,
    approve_wallet_withdrawal:`Approve wallet withdrawal #${args.withdrawal_id}.`, reject_wallet_withdrawal:`Reject wallet withdrawal #${args.withdrawal_id}.`,
    approve_loan_payment:`Approve loan payment #${args.payment_id}.`, reject_loan_payment:`Reject loan payment #${args.payment_id}.`,
  };
  const token=createAiConfirmation(req.user.id,name,args,summaries[name]||"Perform this administrator action.");
  return {confirmation_required:true,confirmation_token:token,summary:summaries[name]};
}

app.get("/api/admin/ai/status", authenticateToken, (req,res)=>{
  try {
    if(req.user?.type!=="admin"&&req.user?.type!=="administrator") return res.status(403).json({message:"Administrator access required"});
    return res.json({
      configured: Boolean(GEMINI_API_KEY || openai),
      provider: GEMINI_API_KEY ? "gemini-free" : (openai ? "openai" : "none"),
      textModel: GEMINI_API_KEY ? GEMINI_MODEL : OPENAI_MODEL,
      voice: "browser",
      name: "JARVIS"
    });
  } catch (error) {
    return res.status(500).json({configured:false,message:"Unable to check JARVIS configuration."});
  }
});

function geminiTools() {
  // Gemini's Schema format is similar to JSON Schema, but it does not accept
  // JSON Schema's additionalProperties keyword. Convert the existing tool
  // definitions without mutating the OpenAI definitions used elsewhere.
  const cleanSchema = (schema) => {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "additionalProperties") continue;
      if (key === "properties" && value && typeof value === "object") {
        out.properties = Object.fromEntries(
          Object.entries(value).map(([name, child]) => [name, cleanSchema(child)])
        );
      } else if (key === "items") {
        out.items = cleanSchema(value);
      } else {
        out[key] = value;
      }
    }
    // Gemini Schema uses uppercase enum values for primitive/object types.
    if (typeof out.type === "string") out.type = out.type.toUpperCase();
    return out;
  };

  return [{
    functionDeclarations: ADMIN_AI_TOOLS
      .filter(t => t.type === "function" && t.name !== "confirm_action")
      .map(t => ({
        name: t.name,
        description: t.description,
        parameters: cleanSchema(t.parameters)
      }))
  }];
}

function geminiHistory(messages) {
  return messages.map(m=>({
    role:m.role==="assistant"?"model":"user",
    parts:[{text:String(m.content||"").slice(0,6000)}]
  }));
}

async function callGeminiAdmin(req, messages) {
  let contents=geminiHistory(messages);
  for(let round=0; round<4; round++) {
    const body={
      systemInstruction:{parts:[{text:ADMIN_AI_INSTRUCTIONS+"\\nKeep spoken replies concise because they may be read aloud by a browser voice."}]},
      contents,
      tools:geminiTools(),
      generationConfig:{temperature:0.45,maxOutputTokens:900}
    };
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error?.message||`Gemini request failed (${response.status}).`);
    const candidate=data?.candidates?.[0];
    const parts=candidate?.content?.parts||[];
    const calls=parts.filter(p=>p.functionCall?.name);
    if(!calls.length) return parts.filter(p=>p.text).map(p=>p.text).join("\\n").trim() || "Consider it done.";

    contents.push(candidate.content);
    for(const part of calls){
      const call=part.functionCall;
      let result;
      try { result=await adminAiExecuteTool(req,call.name,call.args||{}); }
      catch(e){ result={error:e.message||"Tool failed."}; }
      contents.push({role:"user",parts:[{functionResponse:{name:call.name,response:{result}}}]});
    }
  }
  return "I have the information, but I need another moment to finish that request.";
}

app.post("/api/admin/ai/chat", authenticateToken, async (req,res)=>{
  try{
    if(req.user?.type!=="admin"&&req.user?.type!=="administrator") return res.status(403).json({message:"Administrator access required"});
    if(!GEMINI_API_KEY) return res.status(503).json({message:"JARVIS is not configured yet. Add GEMINI_API_KEY to the server environment."});
    if(!checkAiRateLimit(`admin:${req.user.id}`)) return res.status(429).json({message:"JARVIS needs a breather. Please wait a minute."});
    const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-16).map(m=>({role:m?.role==="assistant"?"assistant":"user",content:String(m?.content||"").slice(0,6000)})).filter(m=>m.content):[];
    if(!messages.length||messages[messages.length-1].role!=="user") return res.status(400).json({message:"Send a message first."});

    if(GEMINI_API_KEY){
      const message=await callGeminiAdmin(req,messages);
      return res.json({success:true,message,provider:"gemini-free"});
    }


  }catch(error){console.error("JARVIS ERROR:",error);return res.status(502).json({success:false,message:"JARVIS is temporarily unavailable.",details:error.message});}
});

app.post("/api/admin/ai/tool", authenticateToken, async (req,res)=>{
  try{if(req.user?.type!=="admin"&&req.user?.type!=="administrator")return res.status(403).json({message:"Administrator access required"}); const name=String(req.body?.name||""); const args=req.body?.arguments&&typeof req.body.arguments==='object'?req.body.arguments:{}; const result=await adminAiExecuteTool(req,name,args); return res.json({success:true,result});}
  catch(error){return res.status(400).json({success:false,error:error.message||"Tool failed."});}
});

// Paid OpenAI Realtime/WebRTC is intentionally disabled in the free build.
// Voice is handled in the browser with SpeechRecognition + speechSynthesis.

app.post("/api/customer/savings/image", authenticateToken, async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!isSupportedShoppingUrl(url)) return res.status(400).json({ message: "Paste a valid Taobao, Pinduoduo, or Shein product link." });
    const image = await getShoppingItemImage(url);
    return res.json({ success: true, image });
  } catch (error) {
    return res.status(422).json({ success: false, message: error.message || "Unable to get the item image." });
  }
});

app.get("/api/customer/savings", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const rows = db.prepare(`SELECT * FROM savings_goals WHERE customer_id = ? ORDER BY created_at DESC, id DESC`).all(customerId);
    return res.json({ success: true, savings: rows });
  } catch (error) { return res.status(500).json({ message: "Failed to load savings goals.", details: error.message }); }
});

app.post("/api/customer/savings", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const name = String(req.body?.name || "").trim();
    const target = Number(req.body?.target_amount);
    const link = String(req.body?.product_link || "").trim() || null;
    const image = String(req.body?.product_image || "").trim() || null;
    if (!name || name.length > 120) return res.status(400).json({ message: "Enter a valid saving name." });
    if (!Number.isFinite(target) || target <= 0) return res.status(400).json({ message: "Enter a valid target price." });
    if (link && !isSupportedShoppingUrl(link)) return res.status(400).json({ message: "Only Taobao, Pinduoduo, and Shein links are supported." });
    const result = db.prepare(`INSERT INTO savings_goals (customer_id, name, target_amount, current_amount, product_link, product_image, status) VALUES (?, ?, ?, 0, ?, ?, 'active')`).run(customerId, name, target, link, image);
    const saving = db.prepare(`SELECT * FROM savings_goals WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json({ success: true, saving });
  } catch (error) { return res.status(500).json({ message: "Failed to create saving goal.", details: error.message }); }
});

app.post("/api/customer/savings/:id/payment", authenticateToken, requestUpload.single("payment_proof"), async (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    const savingId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const method = String(req.body?.payment_method || "").trim().toLowerCase();
    if (!Number.isInteger(savingId) || savingId <= 0) return res.status(400).json({ message: "Invalid saving goal." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Enter a valid amount." });
    if (!["qr", "bank"].includes(method)) return res.status(400).json({ message: "Choose QR Payment or Bank Transfer." });
    if (!req.file) return res.status(400).json({ message: "Payment proof is required." });
    const saving = db.prepare(`SELECT * FROM savings_goals WHERE id = ? AND customer_id = ?`).get(savingId, customerId);
    if (!saving) return res.status(404).json({ message: "Saving goal not found." });
    if (String(saving.status) === "withdrawn") return res.status(400).json({ message: "This saving is no longer active." });
    const remaining = Math.max(0, Number(saving.target_amount) - Number(saving.current_amount));
    if (amount > remaining + 0.0001) return res.status(400).json({ message: `Maximum amount for this goal is $${remaining.toFixed(2)}.` });
    // Keep payment proofs in Supabase Storage. Retry once for transient failures
    // instead of silently storing multi-megabyte images in PostgreSQL.
    let image = null;
    let storageError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        image = await uploadBuffer(req.file.buffer, req.file.mimetype, `saving-payments/${customerId}`, req.file.originalname);
        storageError = null;
        break;
      } catch (error) {
        storageError = error;
        console.error(`SAVING PAYMENT STORAGE ERROR (attempt ${attempt}/2):`, error);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    if (!image) {
      return res.status(500).json({
        success: false,
        message: "Payment proof could not be prepared.",
        code: "PAYMENT_PROOF_PREPARE_FAILED",
      });
    }

    let result;
    try {
      result = db.prepare(`INSERT INTO saving_payments (saving_id, customer_id, amount, payment_method, payment_image, status) VALUES (?, ?, ?, ?, ?, 'pending')`).run(savingId, customerId, amount, method, image);
    } catch (dbError) {
      console.error("SAVING PAYMENT DATABASE INSERT ERROR:", dbError);
      return res.status(500).json({ success: false, message: "Payment proof uploaded, but the payment could not be saved to the database.", code: "SAVING_PAYMENT_DATABASE_FAILED" });
    }
    return res.status(201).json({ success: true, id: result.lastInsertRowid, status: "pending" });
  } catch (error) {
    console.error("SAVING PAYMENT REQUEST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Saving payment request failed.",
      code: "SAVING_PAYMENT_FAILED",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

app.get("/api/customer/savings/:id/payments", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id), savingId = Number(req.params.id);
    if (!assertCustomerOwns(req, customerId)) return res.status(403).json({ message: "Forbidden" });
    const saving = db.prepare(`SELECT id FROM savings_goals WHERE id = ? AND customer_id = ?`).get(savingId, customerId);
    if (!saving) return res.status(404).json({ message: "Saving goal not found." });
    return res.json({ success: true, payments: db.prepare(`SELECT id, amount, payment_method, status, created_at, updated_at FROM saving_payments WHERE saving_id = ? ORDER BY created_at DESC, id DESC`).all(savingId) });
  } catch (error) { return res.status(500).json({ message: "Failed to load saving payments.", details: error.message }); }
});

app.post("/api/customer/savings/:id/request", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id), savingId = Number(req.params.id);
    const type = String(req.body?.request_type || "").toLowerCase();
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note || "").trim() || null;
    const qr = String(req.body?.qr_code || "").trim() || null;
    if (!['withdrawal','order'].includes(type)) return res.status(400).json({ message: "Choose withdrawal or order." });
    const saving = db.prepare(`SELECT * FROM savings_goals WHERE id = ? AND customer_id = ?`).get(savingId, customerId);
    if (!saving) return res.status(404).json({ message: "Saving goal not found." });
    const available = Number(saving.current_amount) || 0;
    if (saving.status !== 'completed') return res.status(400).json({ message: "You can request a withdrawal or order after the saving goal is reached." });
    if (!Number.isFinite(amount) || amount <= 0 || amount > available) return res.status(400).json({ message: `Amount must be between $0.01 and $${available.toFixed(2)}.` });
    const pending = db.prepare(`SELECT id FROM saving_requests WHERE saving_id = ? AND status = 'pending' LIMIT 1`).get(savingId);
    if (pending) return res.status(409).json({ message: "You already have a pending request for this saving." });
    const result = db.prepare(`INSERT INTO saving_requests (saving_id, customer_id, request_type, amount, note, qr_code, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(savingId, customerId, type, amount, note, qr);
    return res.status(201).json({ success: true, id: result.lastInsertRowid, status: 'pending' });
  } catch (error) { return res.status(500).json({ message: "Failed to create request.", details: error.message }); }
});

app.get("/api/customer/savings/requests", authenticateToken, (req, res) => {
  try {
    const customerId = Number(req.user.customerId || req.user.id);
    return res.json({ success: true, requests: db.prepare(`SELECT r.*, s.name AS saving_name FROM saving_requests r JOIN savings_goals s ON s.id = r.saving_id WHERE r.customer_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(customerId) });
  } catch (error) { return res.status(500).json({ message: "Failed to load saving requests.", details: error.message }); }
});

/* ADMIN: saving payment approvals and final withdrawal/order requests. */
app.get("/admin/savings", (req, res) => {
  try {
    const payments = db.prepare(`SELECT p.id, p.saving_id, p.customer_id, p.amount, p.payment_method, p.status, p.created_at, p.updated_at, s.name AS saving_name, c.full_name AS customer_name, c.customer_code FROM saving_payments p JOIN savings_goals s ON s.id = p.saving_id JOIN customers c ON c.id = p.customer_id ORDER BY p.created_at DESC, p.id DESC`).all();
    const requests = db.prepare(`SELECT r.*, s.name AS saving_name, c.full_name AS customer_name, c.customer_code FROM saving_requests r JOIN savings_goals s ON s.id = r.saving_id JOIN customers c ON c.id = r.customer_id ORDER BY r.created_at DESC, r.id DESC`).all();
    return res.json({ success: true, payments, requests });
  } catch (error) { return res.status(500).json({ message: "Failed to load savings admin data.", details: error.message }); }
});

app.get("/admin/savings/payments/:id/proof", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid payment." });
    const row = db.prepare(`SELECT payment_image FROM saving_payments WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ message: "Saving payment not found." });
    if (!row.payment_image) return res.status(404).json({ message: "This payment has no proof." });
    return res.json({ success: true, proof: row.payment_image });
  } catch { return res.status(500).json({ message: "Failed to load payment proof." }); }
});

app.put("/admin/savings/payments/:id/approve", (req, res) => {
  try {
    const id = Number(req.params.id);
    const payment = db.prepare(`SELECT * FROM saving_payments WHERE id = ?`).get(id);
    if (!payment) return res.status(404).json({ message: "Saving payment not found." });
    if (payment.status !== 'pending') return res.status(400).json({ message: "Saving payment already processed." });
    db.transaction(() => {
      const saving = db.prepare(`SELECT * FROM savings_goals WHERE id = ? FOR UPDATE`).get(payment.saving_id);
      if (!saving) throw new Error("Saving goal not found.");
      const newAmount = Number((Number(saving.current_amount) + Number(payment.amount)).toFixed(2));
      const newStatus = newAmount >= Number(saving.target_amount) ? 'completed' : 'active';
      const updatedPayment = db.prepare(`UPDATE saving_payments SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`).run(id);
      if (Number(updatedPayment.changes || updatedPayment.rowCount || 0) !== 1) throw new Error('Saving payment was already processed.');
      db.prepare(`UPDATE savings_goals SET current_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newAmount, newStatus, saving.id);
    });
    createCustomerNotification(payment.customer_id, 'saving_payment', 'Saving payment approved', `$${Number(payment.amount).toFixed(2)} was added to your saving goal.`, { saving_id: payment.saving_id, amount: Number(payment.amount) });
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ message: "Failed to approve saving payment.", details: error.message }); }
});

app.put("/admin/savings/payments/:id/reject", (req, res) => {
  try {
    const id = Number(req.params.id), note = String(req.body?.admin_note || '').trim() || null;
    const payment = db.prepare(`SELECT * FROM saving_payments WHERE id = ?`).get(id);
    if (!payment) return res.status(404).json({ message: "Saving payment not found." });
    if (payment.status !== 'pending') return res.status(400).json({ message: "Saving payment already processed." });
    db.prepare(`UPDATE saving_payments SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    createCustomerNotification(payment.customer_id, 'saving_payment', 'Saving payment rejected', note || 'Your saving payment was rejected. Please review your payment proof and try again.', { saving_id: payment.saving_id });
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ message: "Failed to reject saving payment.", details: error.message }); }
});

app.put("/admin/savings/requests/:id/approve", (req, res) => {
  try {
    const id = Number(req.params.id), note = String(req.body?.admin_note || '').trim() || null;
    const request = db.prepare(`SELECT * FROM saving_requests WHERE id = ?`).get(id);
    if (!request) return res.status(404).json({ message: "Saving request not found." });
    if (request.status !== 'pending') return res.status(400).json({ message: "Request already processed." });
    db.transaction(() => {
      const saving = db.prepare(`SELECT * FROM savings_goals WHERE id = ? FOR UPDATE`).get(request.saving_id);
      if (!saving) throw new Error("Saving goal not found.");
      if (Number(request.amount) > Number(saving.current_amount)) throw new Error("Insufficient saved amount.");
      const remaining = Number((Number(saving.current_amount) - Number(request.amount)).toFixed(2));
      db.prepare(`UPDATE saving_requests SET status = 'approved', admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(note, id);
      db.prepare(`UPDATE savings_goals SET current_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(remaining, remaining > 0 ? 'active' : 'withdrawn', saving.id);
      if (request.request_type === 'withdrawal') {
        db.prepare(`INSERT INTO wallet_withdrawals (customer_id, amount, qr_code, note, status) VALUES (?, ?, ?, ?, 'approved')`).run(request.customer_id, request.amount, request.qr_code, request.note);
      } else if (request.request_type === 'order') {
        // Convert an approved savings order request into a normal pending order
        // so it appears in the admin Orders workflow for manual placement.
        let savingsService = db.prepare(`
          SELECT id, name, price, allow_file_upload
          FROM services
          WHERE name = 'Savings Purchase'
          ORDER BY id ASC
          LIMIT 1
        `).get();

        if (!savingsService) {
          const columns = db.prepare(`PRAGMA table_info(services)`).all();
          const activeColumn = columns.find((column) => column.name === 'active');
          const uploadColumn = columns.find((column) => column.name === 'allow_file_upload');
          const activeIsBoolean = String(activeColumn?.type || '').toLowerCase() === 'boolean';
          const uploadIsBoolean = String(uploadColumn?.type || '').toLowerCase() === 'boolean';
          const created = db.prepare(`
            INSERT INTO services (name, price, description, active, service_code, category, allow_file_upload)
            VALUES (?, 0, ?, ?, ?, ?, ?)
          `).run(
            'Savings Purchase',
            'System service used for orders created from approved saving goals.',
            activeIsBoolean ? true : 1,
            'SAVINGS-PURCHASE',
            'savings',
            uploadIsBoolean ? true : 1
          );
          savingsService = db.prepare(`SELECT id, name, price, allow_file_upload FROM services WHERE id = ?`).get(created.lastInsertRowid);
        }

        const publicOrderNumber = generatePublicOrderNumber();
        const orderNote = [
          `Created from approved savings request #${request.id}.`,
          `Saving goal: ${saving.name}.`,
          request.note ? `Customer note: ${request.note}` : null,
          saving.product_link ? `Product link: ${saving.product_link}` : null,
        ].filter(Boolean).join(' ');

        const orderResult = db.prepare(`
          INSERT INTO orders
            (customer_id, status, total, notes, public_order_number, order_type, order_date, product_image)
          VALUES (?, 'pending', ?, ?, ?, 'service', ?, ?)
        `).run(
          request.customer_id,
          Number(request.amount),
          orderNote,
          publicOrderNumber,
          getToday(),
          saving.product_image || null
        );
        const orderId = Number(orderResult.lastInsertRowid);

        db.prepare(`
          INSERT INTO order_items
            (order_id, service_id, quantity, price, total, notes, created_at)
          VALUES (?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          orderId,
          Number(savingsService.id),
          Number(request.amount),
          Number(request.amount),
          orderNote
        );

        createCustomerNotification(
          request.customer_id,
          'order_created',
          'Savings order created',
          `Order #${publicOrderNumber} was created from your saving goal and is now pending admin processing.`,
          { order_id: orderId, saving_id: request.saving_id, public_order_number: publicOrderNumber }
        );
      }
    });
    createCustomerNotification(request.customer_id, request.request_type === 'order' ? 'saving_order' : 'saving_withdrawal', request.request_type === 'order' ? 'Saving order approved' : 'Saving withdrawal approved', note || (request.request_type === 'order' ? 'Your saving has been approved for an order.' : 'Your saving withdrawal has been approved.'), { saving_id: request.saving_id, amount: Number(request.amount) });
    return res.json({ success: true });
  } catch (error) { return res.status(400).json({ message: error.message || "Failed to approve saving request." }); }
});

app.put("/admin/savings/requests/:id/reject", (req, res) => {
  try {
    const id = Number(req.params.id), note = String(req.body?.admin_note || '').trim() || null;
    const request = db.prepare(`SELECT * FROM saving_requests WHERE id = ?`).get(id);
    if (!request) return res.status(404).json({ message: "Saving request not found." });
    if (request.status !== 'pending') return res.status(400).json({ message: "Request already processed." });
    db.prepare(`UPDATE saving_requests SET status = 'rejected', admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(note, id);
    createCustomerNotification(request.customer_id, 'saving_request', 'Saving request rejected', note || 'Your saving request was rejected.', { saving_id: request.saving_id });
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ message: "Failed to reject saving request.", details: error.message }); }
});


/* =========================================================
   TELEGRAM / PAYWAY AUTOMATIC PAYMENT VERIFICATION
   Supports Wallet, Savings and Order payments.

   PayWay notification example:
   ៛4,000 ត្រូវបានបង់ដោយ PHEA BARANG (*716) ...

   We extract the amount from the FRONT of the message, identify
   the payer by name, and only auto-approve when exactly one safe
   destination can be determined. If no destination is pending,
   an unambiguous customer match becomes a wallet deposit.
========================================================= */
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const TELEGRAM_WEBHOOK_URL = String(process.env.TELEGRAM_WEBHOOK_URL || "").trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const TELEGRAM_PAYMENT_CURRENCIES = String(process.env.TELEGRAM_PAYMENT_CURRENCIES || "KHR,USD")
  .split(",").map(v => v.trim().toUpperCase()).filter(Boolean);
const TELEGRAM_AUTO_APPROVE_WINDOW_MINUTES = Math.max(1, Number(process.env.TELEGRAM_AUTO_APPROVE_WINDOW_MINUTES || 60));

function normalizeTelegramName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[.。၊၊]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function telegramTextFromUpdate(update) {
  const message = update?.message || update?.channel_post || update?.edited_message || update?.edited_channel_post || update?.business_message || null;
  if (!message) return null;
  return {
    chatId: String(message.chat?.id ?? ""),
    messageId: String(message.message_id ?? ""),
    text: String(message.text || message.caption || ""),
    date: Number(message.date || 0),
    fromName: String(message.from?.first_name || message.from?.username || ""),
    fromIsBot: Boolean(message.from?.is_bot),
  };
}

function extractTelegramPayment(text) {
  const raw = String(text || "").normalize("NFKC").trim();
  if (!raw) return null;

  // PayWay/ABA incoming KHR format: ៛4,000 ...
  // USD formats supported: $10, USD 10, 10 USD.
  let currency = null;
  let amount = null;

  const front = raw.match(/^\s*(?:៛\s*([0-9][0-9,]*(?:\.[0-9]+)?)|\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)|USD\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(USD|KHR))/i);
  if (front) {
    if (front[1]) { currency = "KHR"; amount = front[1]; }
    else if (front[2]) { currency = "USD"; amount = front[2]; }
    else if (front[3]) { currency = "USD"; amount = front[3]; }
    else if (front[4]) { currency = String(front[5] || "").toUpperCase(); amount = front[4]; }
  }
  if (!amount) return null;
  amount = Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!TELEGRAM_PAYMENT_CURRENCIES.includes(currency)) return null;

  // PayWay payer: ... បង់ដោយ PHEA BARANG (*716) ...
  const payerMatch = raw.match(/(?:បង់ដោយ|paid by|received from)\s+(.+?)\s+\(\*([0-9]{2,8})\)/i);
  const payerName = payerMatch ? payerMatch[1].trim() : null;
  const accountEnding = payerMatch ? payerMatch[2] : null;

  const reference =
    raw.match(/(?:លេខប្រតិបត្តិការ|transaction|txn|reference|ref|trace)[\s:#-]*([A-Z0-9-]{5,})/i)?.[1] ||
    raw.match(/(?:trx|trans)[\s:#-]*([A-Z0-9-]{5,})/i)?.[1] || null;
  const apv = raw.match(/\bAPV\s*:\s*([A-Z0-9-]+)/i)?.[1] || null;
  const merchantMatch = raw.match(/(?:នៅ|at)\s+([^。.!\n]+?)(?:。|\.|$)/i);

  return { amount: Number(amount.toFixed(2)), currency, payerName, accountEnding, reference, apv, merchant: merchantMatch?.[1]?.trim() || null };
}

function customerMatchesForTelegram(payerName) {
  const wanted = normalizeTelegramName(payerName);
  if (!wanted) return [];
  const customers = db.prepare(`SELECT id, full_name, customer_code FROM customers WHERE full_name IS NOT NULL`).all();
  return customers.filter(c => normalizeTelegramName(c.full_name) === wanted);
}

function ensureTelegramColumns() {
  try { ensureColumn("payments", "currency", "TEXT"); } catch {}
  try { ensureColumn("saving_payments", "currency", "TEXT"); } catch {}
  try { ensureColumn("orders", "payment_currency", "TEXT"); } catch {}
  try { ensureColumn("payments", "telegram_verified_at", "TEXT"); } catch {}
  try { ensureColumn("payments", "telegram_transaction_id", "TEXT"); } catch {}
  try { ensureColumn("payments", "telegram_update_id", "TEXT"); } catch {}
}
ensureTelegramColumns();

function ensureTelegramPaymentEventsTable() {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS telegram_payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      update_id TEXT,
      chat_id TEXT,
      message_id TEXT,
      message_date INTEGER,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP,
      text TEXT NOT NULL,
      payer_name TEXT,
      account_ending TEXT,
      amount REAL,
      currency TEXT,
      reference TEXT,
      apv TEXT,
      merchant TEXT,
      processed INTEGER DEFAULT 0
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_telegram_payment_events_received ON telegram_payment_events(received_at DESC)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_telegram_payment_events_reference ON telegram_payment_events(reference)`).run();
  } catch (e) { console.error('TELEGRAM EVENT TABLE ERROR:', e.message); }
}
ensureTelegramPaymentEventsTable();

function telegramAlreadyProcessed(reference, updateId) {
  if (reference) {
    const p = db.prepare(`SELECT id FROM payments WHERE telegram_transaction_id = ? LIMIT 1`).get(reference);
    if (p) return true;
  }
  if (updateId) {
    const p = db.prepare(`SELECT id FROM payments WHERE telegram_update_id = ? LIMIT 1`).get(updateId);
    if (p) return true;
  }
  return false;
}

function approveWalletTelegram(payment, parsed, updateId) {
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO wallets(customer_id,balance) VALUES(?,0)`).run(payment.customer_id);
    db.prepare(`UPDATE wallets SET balance=ROUND(balance+?,2),updated_at=CURRENT_TIMESTAMP WHERE customer_id=?`).run(Number(payment.amount), payment.customer_id);
    db.prepare(`UPDATE payments SET status='approved',currency=?,telegram_verified_at=CURRENT_TIMESTAMP,telegram_transaction_id=?,telegram_update_id=?,verification_source='telegram' WHERE id=? AND status='pending'`)
      .run(parsed.currency, parsed.reference, updateId, payment.id);
    db.prepare(`INSERT INTO wallet_transactions(customer_id,amount,type,description) VALUES(?,?,?,?)`)
      .run(payment.customer_id, Number(payment.amount), 'deposit', `Automatic ${parsed.currency} deposit verified from PayWay Telegram`);
  })();
  createCustomerNotification(payment.customer_id, 'wallet_payment', 'Payment verified automatically', `${parsed.currency} ${Number(payment.amount).toFixed(2)} was added to your wallet.`, { payment_id: payment.id, currency: parsed.currency, amount: Number(payment.amount), telegram_transaction_id: parsed.reference });
}

function approveSavingTelegram(payment, parsed, updateId) {
  db.transaction(() => {
    const saving = db.prepare(`SELECT * FROM savings_goals WHERE id=? AND customer_id=?`).get(payment.saving_id, payment.customer_id);
    if (!saving) throw new Error('Saving goal not found.');
    const newAmount = Number((Number(saving.current_amount || 0) + Number(payment.amount)).toFixed(2));
    const newStatus = newAmount >= Number(saving.target_amount) ? 'completed' : 'active';
    db.prepare(`UPDATE saving_payments SET status='approved',currency=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(parsed.currency, payment.id);
    db.prepare(`UPDATE savings_goals SET current_amount=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(newAmount, newStatus, saving.id);
  })();
  createCustomerNotification(payment.customer_id, 'saving_payment', 'Saving payment verified automatically', `${parsed.currency} ${Number(payment.amount).toFixed(2)} was added to your saving goal.`, { saving_id: payment.saving_id, amount: Number(payment.amount), currency: parsed.currency });
}

function approveOrderTelegram(order, parsed) {
  const requestInfo = db.prepare(`SELECT request_type FROM customer_requests WHERE order_id=? LIMIT 1`).get(order.id);
  const type = String(requestInfo?.request_type || '').toLowerCase();
  const nextStatus = type === 'vietnam' || type === 'china' ? 'ordered' : 'processing';
  db.prepare(`UPDATE orders SET payment_status='paid', status=?, payment_currency=? WHERE id=? AND payment_status='submitted'`).run(nextStatus, parsed.currency, order.id);
  createCustomerNotification(order.customer_id, 'order_payment', 'Order payment verified automatically', `Payment for order #${order.id} was verified through PayWay Telegram.`, { order_id: order.id, amount: Number(order.payment_amount || 0), currency: parsed.currency });
}

function saveTelegramUpdate(update) {
  const incoming = telegramTextFromUpdate(update);
  if (!incoming || incoming.chatId !== TELEGRAM_CHAT_ID) return { ok:true, ignored:true, reason:'chat_not_configured' };
  const parsed = extractTelegramPayment(incoming.text);
  if (!parsed) return { ok:true, ignored:true, reason:'front_amount_or_currency_not_supported' };
  const updateId = String(update?.update_id ?? '');
  try {
    db.prepare(`INSERT INTO telegram_payment_events (id,update_id,chat_id,message_id,message_date,text,payer_name,account_ending,amount,currency,reference,apv,merchant,processed)
      VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM telegram_payment_events),?,?,?,?,?,?,?,?,?,?,?,?,0)`).run(
      updateId, incoming.chatId, incoming.messageId, incoming.date, incoming.text,
      parsed.payerName, parsed.accountEnding, parsed.amount, parsed.currency,
      parsed.reference, parsed.apv, parsed.merchant
    );
  } catch (e) {
    // Telegram may redeliver an update. Existing transaction/reference protection handles it.
    if (!String(e.message || '').toLowerCase().includes('unique')) console.error('TELEGRAM EVENT SAVE ERROR:', e.message);
  }
  console.log('TELEGRAM PAYMENT RECEIVED:', {
    chatId: incoming.chatId, text: incoming.text, payerName: parsed.payerName,
    accountEnding: parsed.accountEnding, amount: parsed.amount, currency: parsed.currency,
    reference: parsed.reference, updateId
  });
  return { ok:true, parsed, updateId };
}

/*
 * Telegram polling mode.
 * We intentionally use api.telegram.org/getUpdates rather than a webhook so
 * the customer's "I've Paid" action can verify against the latest PayWay
 * messages that have been pulled from Telegram into telegram_payment_events.
 */
let telegramPolling = false;
let telegramPollPromise = null;
let telegramOffset = 0;
const TELEGRAM_POLL_INTERVAL_MS = Math.max(1000, Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 2000));

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok:false, error:'not_configured' };
  if (telegramPollPromise) return telegramPollPromise;

  telegramPollPromise = (async () => {
    telegramPolling = true;
    try {
      const url = `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/getUpdates?timeout=10&allowed_updates=${encodeURIComponent(JSON.stringify(['message','channel_post','edited_message','edited_channel_post']))}${telegramOffset ? `&offset=${telegramOffset}` : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.ok) {
        console.error('TELEGRAM GETUPDATES ERROR:', data);
        return data;
      }
      for (const update of (data.result || [])) {
        telegramOffset = Math.max(telegramOffset, Number(update.update_id || 0) + 1);
        saveTelegramUpdate(update);
      }
      return data;
    } catch (error) {
      console.error('TELEGRAM POLLING ERROR:', error.message);
      return { ok:false, error:error.message };
    } finally {
      telegramPolling = false;
      telegramPollPromise = null;
    }
  })();

  return telegramPollPromise;
}

app.post(["/telegram/webhook", "/api/telegram/webhook"], (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return res.status(503).json({ok:false,error:'Telegram payment verification is not configured.'});
    if (TELEGRAM_WEBHOOK_SECRET) {
      const supplied = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      if (supplied !== TELEGRAM_WEBHOOK_SECRET) return res.status(401).json({ok:false,error:'Invalid webhook secret.'});
    }
    return res.json(saveTelegramUpdate(req.body));
  } catch (error) {
    console.error('TELEGRAM WEBHOOK ERROR:', error);
    return res.status(500).json({ok:false,error:'Telegram payment verification failed.'});
  }
});

app.post("/api/customer/wallet/verify-telegram", authenticateToken, async (req, res) => {
  try {
    const customerId = Number(req.user?.customerId || req.user?.id);
    const amount = Number(req.body?.amount);
    const paymentId = Number(req.body?.payment_id || 0);
    const currency = String(req.body?.currency || "").trim().toUpperCase();
    if (!customerId || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({success:false,message:"Invalid payment details."});
    if (!currency || !TELEGRAM_PAYMENT_CURRENCIES.includes(currency)) return res.status(400).json({success:false,message:"Unsupported currency."});

    const customer = db.prepare(`SELECT id,full_name,payment_name FROM customers WHERE id=?`).get(customerId);
    if (!customer) return res.status(404).json({success:false,message:"Customer not found."});

    // Pull fresh Telegram updates immediately before searching the event table.
    // This is the key difference from the old implementation: verification does
    // not depend on a webhook having already populated the database.
    await pollTelegramUpdates();

    const cutoff = new Date(Date.now() - TELEGRAM_AUTO_APPROVE_WINDOW_MINUTES*60000).toISOString();
    const events = db.prepare(`SELECT * FROM telegram_payment_events WHERE received_at>=? AND chat_id=? AND currency=? AND ABS(amount-?)<0.005 AND processed=0 ORDER BY received_at DESC,id DESC LIMIT 25`).all(cutoff, TELEGRAM_CHAT_ID, currency, amount);
    const customerName = normalizeTelegramName(customer.payment_name || "");
    if (!customerName) {
      return res.status(409).json({success:false,code:"payment_name_required",message:"Set your payment name before making a payment."});
    }
    const matches = events.filter(e => normalizeTelegramName(e.payer_name) === customerName);
    if (!matches.length) return res.json({success:true,verified:false,status:'not_found',message:'We could not find your payment yet. Please try again in a moment.'});

    for (const event of matches) {
      if (telegramAlreadyProcessed(event.reference, event.update_id)) continue;
      const parsed = {amount:Number(event.amount),currency:event.currency,payerName:event.payer_name,accountEnding:event.account_ending,reference:event.reference,apv:event.apv,merchant:event.merchant};

      let wallet = null;
      if (paymentId) {
        wallet = db.prepare(`SELECT id,customer_id,amount,status,created_at FROM payments WHERE id=? AND customer_id=? AND type='wallet' AND ABS(CAST(amount AS DOUBLE PRECISION)-?)<0.005`).get(paymentId, customerId, amount);
      } else {
        wallet = db.prepare(`SELECT id,customer_id,amount,status,created_at FROM payments WHERE type='wallet' AND customer_id=? AND status='pending' AND ABS(CAST(amount AS DOUBLE PRECISION)-?)<0.005 AND created_at>=? ORDER BY created_at ASC,id ASC LIMIT 1`).get(customerId, amount, cutoff);
      }

      if (wallet) {
        if (wallet.status !== 'approved') approveWalletTelegram(wallet, parsed, event.update_id);
        db.prepare(`UPDATE telegram_payment_events SET processed=1 WHERE id=?`).run(event.id);
        return res.json({success:true,verified:true,status:'approved',message:'Payment successful. Your wallet has been updated.',transaction_id:event.reference || event.update_id,payment_id:wallet.id});
      }

      // No pending request is required. A uniquely matched customer + exact
      // amount/currency can be credited directly to the wallet.
      const paymentResult = db.prepare(`INSERT INTO payments (customer_id,type,amount,payment_image,status,payment_method,verification_source,currency,telegram_verified_at,telegram_transaction_id,telegram_update_id) VALUES (?,'wallet',?,NULL,'approved','telegram','telegram',?,CURRENT_TIMESTAMP,?,?)`).run(customerId, amount, currency, event.reference, event.update_id);
      db.prepare(`INSERT OR IGNORE INTO wallets(customer_id,balance) VALUES(?,0)`).run(customerId);
      db.prepare(`UPDATE wallets SET balance=ROUND(balance+?,2),updated_at=CURRENT_TIMESTAMP WHERE customer_id=?`).run(amount, customerId);
      db.prepare(`INSERT INTO wallet_transactions(customer_id,amount,type,description) VALUES(?,?,?,?)`).run(customerId, amount, 'deposit', `Automatic ${currency} deposit from PayWay Telegram`);
      createCustomerNotification(customerId, 'wallet_payment', 'Wallet deposit received', `${currency} ${amount.toFixed(2)} was verified automatically from your ABA payment.`, {payment_id:paymentResult.lastInsertRowid,currency,telegram_transaction_id:event.reference});
      db.prepare(`UPDATE telegram_payment_events SET processed=1 WHERE id=?`).run(event.id);
      console.log('TELEGRAM WALLET DEPOSIT AUTO-APPROVED:', {customerId,amount,currency,reference:event.reference,payer:event.payer_name});
      return res.json({success:true,verified:true,status:'approved',message:'Payment successful. Your wallet has been updated.',transaction_id:event.reference || event.update_id,payment_id:paymentResult.lastInsertRowid});
    }
    return res.json({success:true,verified:false,status:'not_found',message:'We could not find a new matching payment yet. Please try again.'});
  } catch (error) {
    console.error('VERIFY TELEGRAM PAYMENT ERROR:', error);
    return res.status(500).json({success:false,message:'Unable to verify the payment right now.'});
  }
});

app.get("/admin/telegram/status", (req,res)=>res.json({configured:Boolean(TELEGRAM_BOT_TOKEN&&TELEGRAM_CHAT_ID),webhookUrlConfigured:Boolean(TELEGRAM_WEBHOOK_URL),chatConfigured:Boolean(TELEGRAM_CHAT_ID),currencies:TELEGRAM_PAYMENT_CURRENCIES,autoApproveWindowMinutes:TELEGRAM_AUTO_APPROVE_WINDOW_MINUTES}));

async function configureTelegramPolling() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram payment verification disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
    return;
  }
  try {
    // getUpdates cannot run while a webhook is configured. Remove the old
    // webhook from previous deployments, then start polling directly from
    // api.telegram.org.
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/deleteWebhook?drop_pending_updates=false`);
    const data = await response.json();
    console.log('TELEGRAM WEBHOOK REMOVED FOR POLLING:', data);
    pollTelegramUpdates();
    setInterval(pollTelegramUpdates, TELEGRAM_POLL_INTERVAL_MS);
    console.log('TELEGRAM API POLLING ENABLED:', { chatId: TELEGRAM_CHAT_ID, intervalMs: TELEGRAM_POLL_INTERVAL_MS });
  } catch (error) {
    console.error('TELEGRAM POLLING SETUP ERROR:', error.message);
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "yn-studio-api",
    database: process.env.SUPABASE_DATABASE_URL ? "supabase" : "sqlite",
  });
});
/* =========================================================
404 HANDLER
========================================================= */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

/* =========================================================
GLOBAL ERROR HANDLER
========================================================= */
app.use((error, req, res, next) => {
  console.error("UNHANDLED SERVER ERROR:", error);
  res.status(500).json({ error: "Internal server error" });
});

/* =========================================================
START SERVER
========================================================= */
// =========================================================
// UPDATE ORDER STATUS
// =========================================================

app.put(
  "/orders/:id/status",
  authenticateToken,
  (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status } = req.body;

      if (!Number.isInteger(orderId)) {
        return res.status(400).json({
          message: "Invalid order ID.",
        });
      }

      const allowedStatuses = [
        "pending",
        "pending_payment",
        "processing",
        "completed",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid order status.",
          allowedStatuses,
        });
      }

      const existingOrder = db
        .prepare(`
          SELECT
            id,
            status
          FROM orders
          WHERE id = ?
        `)
        .get(orderId);

      if (!existingOrder) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      db.prepare(`
        UPDATE orders
        SET status = ?
        WHERE id = ?
      `).run(status, orderId);

      const updatedOrder = db
        .prepare(`
          SELECT
            id,
            customer_id,
            status,
            total,
            notes,
            created_at
          FROM orders
          WHERE id = ?
        `)
        .get(orderId);

      console.log(
        `ORDER ${orderId} STATUS UPDATED:`,
        existingOrder.status,
        "->",
        status
      );

      res.json({
        success: true,
        message: "Order status updated successfully.",
        order: updatedOrder,
      });

    } catch (error) {
      console.error(
        "UPDATE ORDER STATUS ERROR:",
        error
      );

      res.status(500).json({
        message: "Failed to update order status.",
      });
    }
  }
);
/* =========================================================
   ADMIN CUSTOMER REQUESTS
========================================================= */

/* =========================================================
   ADMIN CUSTOMER REQUEST SYSTEM
   =========================================================
   
   Customer request flow:

   CUSTOMER
      ↓
   /api/customer/requests
      ↓
   customer_requests table
      ↓
   ADMIN
      ↓
   /admin/customer-requests
      ↓
   Chat + Quote
      ↓
   Customer accepts quote
      ↓
   Real order is created
========================================================= */


  // ============================================================
  // ADMIN WALLET WITHDRAWALS
  // ============================================================
  app.get("/admin/wallet/withdrawals", (req, res) => {
    try {
      const withdrawals = db.prepare(`
        SELECT w.*, c.full_name, c.customer_code
        FROM wallet_withdrawals w
        LEFT JOIN customers c ON c.id = w.customer_id
        ORDER BY w.created_at DESC, w.id DESC
      `).all();
      return res.json(withdrawals);
    } catch (error) {
      console.error("GET /admin/wallet/withdrawals error:", error);
      return res.status(500).json({ error: "Failed to load wallet withdrawals", details: error.message });
    }
  });

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `YN Studio API running on http://localhost:${PORT}`
  );
  configureTelegramPolling();
});




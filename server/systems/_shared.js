require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const db = require("../database");

const JWT_SECRET = process.env.JWT_SECRET;
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
/* =========================================================
   CUSTOMER REQUEST FILE UPLOAD
========================================================= */

const requestUpload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
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




/* =========================================================
   ADMIN - GET ONE CUSTOMER REQUEST
========================================================= */




/* =========================================================
   ADMIN - SEND MESSAGE
========================================================= */




/* =========================================================
   ADMIN - SEND QUOTE
========================================================= */




/* =========================================================
   ADMIN - CLOSE REQUEST
========================================================= */


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
   AUTH MIDDLEWARE
========================================================= */

function authenticateToken(req, res, next) {
  const authHeader =
    req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const parts =
    authHeader.split(" ");

  if (
    parts.length !== 2 ||
    parts[0] !== "Bearer"
  ) {
    return res.status(401).json({
      message:
        "Invalid authorization header",
    });
  }

  const token = parts[1];

  try {
    const user = jwt.verify(
      token,
      JWT_SECRET
    );

    req.user = user;

    next();
  } catch (error) {
    return res.status(403).json({
      message:
        "Invalid or expired token",
    });
  }
}

/* =========================================================
   BASIC ROUTE
========================================================= */



/* =========================================================
   AUTH - LOGIN
========================================================= */



/* =========================================================
CUSTOMER - REGISTER
========================================================= */



/* =========================================================
CUSTOMER - LOGIN
========================================================= */



/* =========================================================
   CUSTOMER ORDERS
   ========================================================= */


/* =========================================================
   CUSTOMER ORDER DETAILS
========================================================= */


/* =========================================================
   CUSTOMER REQUESTS
========================================================= */


/* =========================================================
   CREATE CUSTOMER REQUEST
========================================================= */

/* =========================================================
   GET CUSTOMER REQUESTS
========================================================= */

/* =========================================================
   GET CUSTOMER REQUEST DETAILS
========================================================= */

/* =========================================================
   CUSTOMER SEND REQUEST MESSAGE
========================================================= */

/* =========================================================
   CUSTOMER ACCEPT QUOTE
========================================================= */

/* =========================================================
   CUSTOMER DECLINE QUOTE
========================================================= */


/* =========================================================
   CUSTOMER ORDER PAYMENT
========================================================= */


/* =========================================================
   CURRENT USER
========================================================= */



/* =========================================================
   DASHBOARD
========================================================= */



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



/* =========================================================
   GET ONE CUSTOMER
========================================================= */



/* =========================================================
   CREATE CUSTOMER
========================================================= */



/* =========================================================
   UPDATE CUSTOMER
========================================================= */



/* =========================================================
   DELETE CUSTOMER
========================================================= */



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



/* =========================================================
   GET ONE SERVICE
========================================================= */



/* =========================================================
   CREATE SERVICE
========================================================= */



/* =========================================================
   UPDATE SERVICE
========================================================= */



/* =========================================================
   DELETE SERVICE
========================================================= */



/* =========================================================
   END OF PART 2
========================================================= *//* =========================================================
   WALLET
========================================================= */

/* =========================================================
   GET CUSTOMER WALLET
========================================================= */



/* =========================================================
   ADD MONEY TO WALLET
========================================================= */



/* =========================================================
   ADMIN DEDUCT MONEY
========================================================= */



/* =========================================================
   WALLET TRANSACTIONS
========================================================= */



/* =========================================================
   CUSTOMER PAYMENT REQUESTS
========================================================= */

/* =========================================================
   CREATE PAYMENT REQUEST
========================================================= */



/* =========================================================
   GET PAYMENTS
========================================================= */



/* =========================================================
   APPROVE PAYMENT
========================================================= */



/* =========================================================
   REJECT PAYMENT
========================================================= */


// =========================================================
// ADMIN ORDER PAYMENT MANAGEMENT
// =========================================================

// GET CUSTOMER ORDER PAYMENTS



// =========================================================
// APPROVE CUSTOMER ORDER PAYMENT
// =========================================================




// =========================================================
// REJECT CUSTOMER ORDER PAYMENT
// =========================================================


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



/* =========================================================
   GET CUSTOMER LOAN
========================================================= */



/* =========================================================
   CREATE CUSTOMER LOAN
========================================================= */



/* =========================================================
   RECORD PRINCIPAL PAYMENT
========================================================= */



/* =========================================================
   GET LOAN INTEREST PAYMENTS
========================================================= */



/* =========================================================
   PAY WEEKLY INTEREST
========================================================= */



/* =========================================================
   GET LOAN TRANSACTIONS
========================================================= */



/* =========================================================
   UPDATE ACTIVE LOAN
========================================================= */



/* =========================================================
   DISABLE / CANCEL LOAN
========================================================= */



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
========================================================= */

function createInterestSchedule(
  loanId,
  startDate,
  endDate,
  weeklyInterest
) {
  if (
    !weeklyInterest ||
    weeklyInterest <= 0
  ) {
    return;
  }

  const weeks =
    calculateNumberOfWeeks(
      startDate,
      endDate
    );

  if (weeks <= 0) {
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

    const dueDate =
      addDays(
        startDate,
        week * 7
      );

    insertPayment.run(
      loanId,
      weeklyInterest,
      dueDate,
      null
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

    db.prepare(`
      UPDATE loan_payments

      SET status = 'overdue'

      WHERE status = 'due'

      AND due_date < ?

      AND loan_id IN (
        SELECT id
        FROM customer_loans
        WHERE status = 'active'
      )
    `).run(today);

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




/* =========================================================
GET CUSTOMER LOAN
========================================================= */




/* =========================================================
CREATE CUSTOMER LOAN
========================================================= */

/* =========================================================
RECORD PRINCIPAL PAYMENT
========================================================= */




/* =========================================================
GET LOAN INTEREST PAYMENTS
========================================================= */




/* =========================================================
PAY WEEKLY INTEREST
========================================================= */




/* =========================================================
GET LOAN TRANSACTIONS
========================================================= */




/* =========================================================
UPDATE ACTIVE LOAN
========================================================= */




/* =========================================================
DISABLE / CANCEL LOAN
========================================================= */


/* =========================================================
   ADMIN - GET CUSTOMER REQUESTS
   ========================================================= */




/* =========================================================
   ADMIN - GET SINGLE CUSTOMER REQUEST
   ========================================================= */




/* =========================================================
   ADMIN - SEND MESSAGE TO CUSTOMER
   ========================================================= */




/* =========================================================
   ADMIN - SEND QUOTE
   ========================================================= */




/* =========================================================
   ADMIN - CLOSE / REJECT CUSTOMER REQUEST
   ========================================================= */

// =========================================================
// GET ALL ORDERS
// =========================================================



/* =========================================================
   DELETE ORDER
   ========================================================= */

// =========================================================
// GET ONE ORDER
// =========================================================


// =========================================================
// UPDATE ORDER STATUS
// =========================================================



// =========================================================
// CREATE ORDER
// ONE ORDER CAN CONTAIN MULTIPLE SERVICES
// =========================================================




/* =========================================================
   CUSTOMER COUPONS
========================================================= */

/* GET CUSTOMER COUPONS */




/* ADD CUSTOMER COUPON */




/* DELETE CUSTOMER COUPON */




/* =========================================================
404 HANDLER
========================================================= */

/* =========================================================
GLOBAL ERROR HANDLER
========================================================= */

/* =========================================================
START SERVER
========================================================= */
// =========================================================
// UPDATE ORDER STATUS
// =========================================================


// =========================================================
// UPDATE ORDER STATUS
// Admin can change:
// pending
// processing
// completed
// cancelled
// =========================================================


/* =========================================================
   ADMIN CUSTOMER REQUESTS
========================================================= */

/* =========================================================
   GET ALL CUSTOMER REQUESTS
========================================================= */




/* =========================================================
   GET SINGLE CUSTOMER REQUEST
========================================================= */




/* =========================================================
   ADMIN SEND REQUEST MESSAGE
========================================================= */




/* =========================================================
   ADMIN SEND QUOTATION
========================================================= */




/* =========================================================
   ADMIN CLOSE REQUEST
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


/* =========================================================
   ADMIN - GET ALL CUSTOMER REQUESTS
========================================================= */




/* =========================================================
   ADMIN - GET ONE CUSTOMER REQUEST
========================================================= */




/* =========================================================
   ADMIN - SEND MESSAGE
========================================================= */




/* =========================================================
   ADMIN - SEND QUOTE
========================================================= */




/* =========================================================
   ADMIN - CLOSE REQUEST
========================================================= */


function generatePublicOrderNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  db,
  bcrypt,
  jwt,
  multer,
  JWT_SECRET,
  paymentUpload,
  requestUpload,
  ensureColumn,
  authenticateToken,
  generateCustomerCode,
  generateServiceCode,
  getToday,
  addDays,
  calculateNumberOfWeeks,
  calculateWeeklyInterest,
  createInterestSchedule,
  updateOverduePayments,
  generatePublicOrderNumber
};

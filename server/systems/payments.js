module.exports = function registerSystem({ app, ...shared }) {
  const {
    db,
    bcrypt,
    jwt,
    JWT_SECRET,
    paymentUpload,
    requestUpload,
    authenticateToken,
    generateCustomerCode,
    generateServiceCode,
    getToday,
    addDays,
    calculateNumberOfWeeks,
    calculateWeeklyInterest,
    createInterestSchedule,
    updateOverduePayments,
    generatePublicOrderNumber,
    ensureColumn,
  } = shared;
  /*
  =========================================================
  WALLET WITHDRAWAL TABLE
  =========================================================

  Withdrawals are kept separate from the existing
  payments table.

  This prevents withdrawal approval from interfering
  with wallet deposits or order payments.
  =========================================================
  */

  db.prepare(`
    CREATE TABLE IF NOT EXISTS wallet_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      customer_id INTEGER NOT NULL,

      amount REAL NOT NULL DEFAULT 0,

      qr_code TEXT,

      note TEXT,

      status TEXT NOT NULL DEFAULT 'pending',

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      approved_at DATETIME,

      rejected_at DATETIME,

      FOREIGN KEY (customer_id)
        REFERENCES customers(id)
    )
  `).run();

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
  if (payment.type !== "wallet") {
  return res.status(400).json({
    error:
      "This payment is not a wallet payment",
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
  /*
  =========================================================
  CUSTOMER - REQUEST WALLET WITHDRAWAL
  =========================================================

  Customer sends:

  {
    customer_id,
    amount,
    qr_code,
    note
  }

  QR code is stored as a data URL, for example:

  data:image/png;base64,...

  This allows the customer app to upload the QR
  without changing your existing multer configuration.
  =========================================================
  */

  app.post(
    "/wallet/withdrawal/request",
    (req, res) => {
      try {
        const customerId =
          Number(req.body.customer_id);

        const amount =
          Number(req.body.amount);

        const qrCode =
          req.body.qr_code || null;

        const note =
          String(req.body.note || "").trim();


        /*
        =====================================================
        VALIDATE CUSTOMER
        =====================================================
        */

        if (
          !Number.isInteger(customerId) ||
          customerId <= 0
        ) {
          return res.status(400).json({
            error:
              "Invalid customer account.",
          });
        }


        const customer =
          db.prepare(`
            SELECT
              id,
              full_name,
              customer_code
            FROM customers
            WHERE id = ?
          `).get(customerId);


        if (!customer) {
          return res.status(404).json({
            error:
              "Customer not found.",
          });
        }


        /*
        =====================================================
        VALIDATE AMOUNT
        =====================================================
        */

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return res.status(400).json({
            error:
              "Please enter a valid withdrawal amount.",
          });
        }


        /*
        =====================================================
        VALIDATE QR
        =====================================================
        */

        if (!qrCode) {
          return res.status(400).json({
            error:
              "Please upload your withdrawal QR code.",
          });
        }


        /*
        =====================================================
        PREVENT MULTIPLE PENDING REQUESTS
        =====================================================
        */

        const existingRequest =
          db.prepare(`
            SELECT
              id,
              amount
            FROM wallet_withdrawals
            WHERE customer_id = ?
              AND status = 'pending'
            LIMIT 1
          `).get(customerId);


        if (existingRequest) {
          return res.status(400).json({
            error:
              "You already have a withdrawal request waiting for approval.",
          });
        }


        /*
        =====================================================
        GET CURRENT BALANCE
        =====================================================
        */

        const wallet =
          db.prepare(`
            SELECT
              balance
            FROM wallets
            WHERE customer_id = ?
          `).get(customerId);


        const balance =
          Number(wallet?.balance || 0);


        /*
        =====================================================
        CHECK BALANCE
        =====================================================
        */

        if (amount > balance) {
          return res.status(400).json({
            error:
              `Insufficient wallet balance. Your available balance is $${balance.toFixed(2)}.`,
          });
        }


        /*
        =====================================================
        CREATE REQUEST
        =====================================================
        */

        const result =
          db.prepare(`
            INSERT INTO wallet_withdrawals
            (
              customer_id,
              amount,
              qr_code,
              note,
              status
            )
            VALUES (?, ?, ?, ?, 'pending')
          `).run(
            customerId,
            amount,
            qrCode,
            note
          );


        const withdrawal =
          db.prepare(`
            SELECT
              wallet_withdrawals.*,

              customers.full_name,

              customers.customer_code

            FROM wallet_withdrawals

            LEFT JOIN customers
              ON customers.id =
                 wallet_withdrawals.customer_id

            WHERE wallet_withdrawals.id = ?
          `).get(result.lastInsertRowid);


        console.log(
          "WALLET WITHDRAWAL REQUEST:",
          withdrawal
        );


        res.status(201).json({
          success: true,

          message:
            "Withdrawal request submitted successfully.",

          withdrawal,
        });

      } catch (error) {

        console.error(
          "POST /wallet/withdrawal/request ERROR:",
          error
        );

        res.status(500).json({
          error:
            "Failed to submit withdrawal request.",

          details:
            error.message,
        });
      }
    }
  );
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
            orders.payment_receipt,
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
  
          receipt:
            payment.payment_receipt ||
            null,
  
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
  
        db.prepare(`
          UPDATE orders
  
          SET
            payment_status = 'paid',
            status = 'processing'
  
          WHERE id = ?
        `).run(orderId);
  
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
};

module.exports = function registerSystem({ app, ...shared }) {
  console.log(
  "🔥🔥🔥 WALLET.JS LOADED 🔥🔥🔥"
);
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

  // ============================================================
  // WALLET
  // ============================================================

  /*
  ==============================================================
  GET CUSTOMER WALLET
  ==============================================================

  GET /wallet/:customerId
  */

  app.get("/wallet/:customerId", (req, res) => {
    try {
      const customerId = Number(req.params.customerId);

      if (!customerId) {
        return res.status(400).json({
          error: "Invalid customer",
        });
      }

      const wallet = db
        .prepare(`
          SELECT *
          FROM wallets
          WHERE customer_id = ?
        `)
        .get(customerId);

      if (!wallet) {
        return res.json({
          customer_id: customerId,
          balance: 0,
        });
      }

      return res.json(wallet);
    } catch (error) {
      console.error("GET WALLET ERROR:", error);

      return res.status(500).json({
        error: "Wallet error",
        details: error.message,
      });
    }
  });


  /*
  ==============================================================
  ADMIN ADD MONEY TO CUSTOMER WALLET
  ==============================================================

  POST /wallet/:customerId/add

  Body:
  {
    "amount": 100
  }
  */

  app.post("/wallet/:customerId/add", (req, res) => {
    try {
      const customerId = Number(req.params.customerId);
      const amount = Number(req.body?.amount);

      if (!customerId) {
        return res.status(400).json({
          error: "Invalid customer",
        });
      }

      if (Number.isNaN(amount) || amount <= 0) {
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

      // Make sure wallet exists.
      db.prepare(`
        INSERT OR IGNORE INTO wallets
        (
          customer_id,
          balance
        )
        VALUES (?, 0)
      `).run(customerId);

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE wallets
          SET balance = balance + ?
          WHERE customer_id = ?
        `).run(
          amount,
          customerId
        );

        /*
        Wallet transactions table may exist in your database.
        If it doesn't, don't break the wallet operation.
        */
        try {
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
            customerId,
            amount,
            "admin_add",
            "Money added by admin"
          );
        } catch (error) {
          console.log(
            "wallet_transactions table not available:",
            error.message
          );
        }
      });

      transaction();

      const wallet = db
        .prepare(`
          SELECT *
          FROM wallets
          WHERE customer_id = ?
        `)
        .get(customerId);

      return res.json({
        success: true,
        customer: customer.full_name,
        customer_code: customer.customer_code,
        amount,
        balance: Number(wallet.balance) || 0,
      });
    } catch (error) {
      console.error(
        "POST /wallet/:customerId/add ERROR:",
        error
      );

      return res.status(500).json({
        error: "Failed to add money",
        details: error.message,
      });
    }
  });


  /*
  ==============================================================
  ADMIN DEDUCT MONEY FROM CUSTOMER WALLET
  ==============================================================

  POST /wallet/:customerId/deduct

  Body:
  {
    "amount": 100,
    "description": "Payment for order"
  }
  */

  app.post("/wallet/:customerId/deduct", (req, res) => {
    try {
      const customerId = Number(req.params.customerId);
      const amount = Number(req.body?.amount);

      const description =
        req.body?.description ||
        "Money deducted by admin";

      if (!customerId) {
        return res.status(400).json({
          error: "Invalid customer",
        });
      }

      if (Number.isNaN(amount) || amount <= 0) {
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

      const wallet = db
        .prepare(`
          SELECT *
          FROM wallets
          WHERE customer_id = ?
        `)
        .get(customerId);

      if (!wallet) {
        return res.status(404).json({
          error: "Customer wallet not found",
        });
      }

      const currentBalance =
        Number(wallet.balance) || 0;

      if (amount > currentBalance) {
        return res.status(400).json({
          error: "Insufficient wallet balance",
          balance: currentBalance,
          requested: amount,
        });
      }

      const newBalance = Number(
        (currentBalance - amount).toFixed(2)
      );

      const deductMoney = db.transaction(() => {
        db.prepare(`
          UPDATE wallets
          SET balance = ?
          WHERE customer_id = ?
        `).run(
          newBalance,
          customerId
        );

        try {
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
            customerId,
            -amount,
            "admin_deduct",
            description
          );
        } catch (error) {
          console.log(
            "wallet_transactions table not available:",
            error.message
          );
        }
      });

      deductMoney();

      return res.json({
        success: true,
        customer: customer.full_name,
        customer_code: customer.customer_code,
        deducted: amount,
        balance: newBalance,
      });
    } catch (error) {
      console.error(
        "Admin wallet deduct error:",
        error
      );

      return res.status(500).json({
        error: "Failed to deduct money",
        details: error.message,
      });
    }
  });


  /*
  ==============================================================
  GET WALLET TRANSACTIONS
  ==============================================================

  GET /wallet/:customerId/transactions
  */

  app.get(
    "/wallet/:customerId/transactions",
    (req, res) => {
      try {
        const customerId =
          Number(req.params.customerId);

        if (!customerId) {
          return res.status(400).json({
            error: "Invalid customer",
          });
        }

        let transactions = [];

        try {
          transactions = db
            .prepare(`
              SELECT *
              FROM wallet_transactions
              WHERE customer_id = ?
              ORDER BY created_at DESC
            `)
            .all(customerId);
        } catch (error) {
          console.log(
            "Wallet transactions table not available:",
            error.message
          );
        }

        return res.json(transactions);
      } catch (error) {
        console.error(
          "Wallet transactions error:",
          error
        );

        return res.status(500).json({
          error: "Failed to load transactions",
          details: error.message,
        });
      }
    }
  );


  // ============================================================
  // WALLET PAYMENT REQUEST
  // ============================================================

  /*
  ==============================================================
  CUSTOMER REQUESTS WALLET TOP-UP
  ==============================================================

  POST /wallet/request

  multipart/form-data:

  customer_id
  amount
  payment_method
  payment_proof

  IMPORTANT:
  This DOES NOT add money to wallet.

  The payment stays pending until admin approves it.
  */

  app.post(
    "/wallet/request",
    requestUpload.single("payment_proof"),
    (req, res) => {
      try {
        const customerId =
          Number(req.body?.customer_id);

        const numericAmount =
          Number(req.body?.amount);

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

        /*
        ----------------------------------------------------------
        STORE PAYMENT PROOF AS BASE64 DATA URL
        ----------------------------------------------------------
        */

        const paymentImage = req.file
          ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
          : null;

        /*
        ----------------------------------------------------------
        CREATE PENDING PAYMENT
        ----------------------------------------------------------

        Wallet is NOT increased here.

        Admin must approve the payment first.
        */

        const result = db
          .prepare(`
            INSERT INTO payments
            (
              customer_id,
              type,
              amount,
              payment_image,
              status
            )
            VALUES
            (
              ?,
              'wallet',
              ?,
              ?,
              'pending'
            )
          `)
          .run(
            customerId,
            numericAmount,
            paymentImage
          );

        console.log(
          "WALLET PAYMENT SUBMITTED:",
          {
            paymentId:
              result.lastInsertRowid,

            customerId,

            customer:
              customer.full_name,

            customerCode:
              customer.customer_code,

            amount:
              numericAmount,

            paymentMethod,

            file:
              req.file.originalname,
          }
        );

        return res.status(201).json({
          success: true,

          id:
            result.lastInsertRowid,

          customer:
            customer.full_name,

          customer_code:
            customer.customer_code,

          amount:
            numericAmount,

          payment_method:
            paymentMethod,

          status:
            "pending",

          message:
            "Payment created. Pay ABA and Telegram will verify it automatically; receipt upload is optional.",
        });
      } catch (error) {
        console.error(
          "POST /wallet/request ERROR:",
          error
        );

        return res.status(500).json({
          error: "Payment request failed",
          details: error.message,
        });
      }
    }
  );


  // ============================================================
  // ADMIN WALLET WITHDRAWALS
  // ============================================================

  /*
  IMPORTANT:

  Your Payments.jsx is requesting:

      GET /admin/wallet/withdrawals

  The old server did not have this route.

  This route supports withdrawal records if your database
  contains a wallet_withdrawals table.

  If the table doesn't exist yet, it returns [] instead of
  crashing the Payments page.
  */

  app.get(
    "/admin/wallet/withdrawals",
    (req, res) => {
      try {
        let withdrawals = [];

        try {
          withdrawals = db
            .prepare(`
              SELECT *
              FROM wallet_withdrawals
              ORDER BY created_at DESC
            `)
            .all();
        } catch (error) {
          console.log(
            "wallet_withdrawals table not available:",
            error.message
          );

          withdrawals = [];
        }

        return res.json(withdrawals);
      } catch (error) {
        console.error(
          "GET /admin/wallet/withdrawals ERROR:",
          error
        );

        return res.status(500).json({
          error: "Failed to load wallet withdrawals",
          details: error.message,
        });
      }
    }
  );


  // ============================================================
  // ADMIN WALLET PAYMENT APPROVAL
  // ============================================================

  /*
  ==============================================================
  GET PENDING WALLET PAYMENTS
  ==============================================================

  This is useful for the Payments page.

  GET /admin/wallet/payments
  */

  app.get(
    "/admin/wallet/payments",
    (req, res) => {
      try {
        const payments = db
          .prepare(`
            SELECT
              p.*,
              c.full_name,
              c.customer_code
            FROM payments p
            LEFT JOIN customers c
              ON c.id = p.customer_id
            WHERE p.type = 'wallet'
            ORDER BY p.id DESC
          `)
          .all();

        return res.json(payments);
      } catch (error) {
        console.error(
          "GET ADMIN WALLET PAYMENTS ERROR:",
          error
        );

        return res.status(500).json({
          error: "Failed to load wallet payments",
          details: error.message,
        });
      }
    }
  );


  /*
  ==============================================================
  APPROVE WALLET PAYMENT
  ==============================================================

  POST /admin/wallet/payments/:paymentId/approve

  When approved:

  1. Payment status becomes approved.
  2. Wallet is increased.
  3. Wallet transaction is recorded.
  */

  app.post(
    "/admin/wallet/payments/:paymentId/approve",
    (req, res) => {
      try {
        const paymentId =
          Number(req.params.paymentId);

        if (!paymentId) {
          return res.status(400).json({
            error: "Invalid payment",
          });
        }

        const payment = db
          .prepare(`
            SELECT
              p.*,
              c.full_name,
              c.customer_code
            FROM payments p
            LEFT JOIN customers c
              ON c.id = p.customer_id
            WHERE p.id = ?
              AND p.type = 'wallet'
          `)
          .get(paymentId);

        if (!payment) {
          return res.status(404).json({
            error: "Wallet payment not found",
          });
        }

        if (payment.status === "approved") {
          return res.status(400).json({
            error: "Payment already approved",
          });
        }

        if (payment.status !== "pending") {
          return res.status(400).json({
            error:
              `Payment cannot be approved because its status is ${payment.status}`,
          });
        }

        const amount =
          Number(payment.amount);

        if (
          Number.isNaN(amount) ||
          amount <= 0
        ) {
          return res.status(400).json({
            error: "Invalid payment amount",
          });
        }

        const approvePayment =
          db.transaction(() => {
            /*
            ------------------------------------------------------
            MAKE SURE WALLET EXISTS
            ------------------------------------------------------
            */

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

            /*
            ------------------------------------------------------
            ADD MONEY TO WALLET
            ------------------------------------------------------
            */

            db.prepare(`
              UPDATE wallets
              SET balance = balance + ?
              WHERE customer_id = ?
            `).run(
              amount,
              payment.customer_id
            );

            /*
            ------------------------------------------------------
            UPDATE PAYMENT STATUS
            ------------------------------------------------------
            */

            db.prepare(`
              UPDATE payments
              SET status = 'approved'
              WHERE id = ?
            `).run(paymentId);

            /*
            ------------------------------------------------------
            RECORD WALLET TRANSACTION
            ------------------------------------------------------
            */

            try {
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
                "wallet_topup",
                `Wallet top-up payment #${paymentId}`
              );
            } catch (error) {
              console.log(
                "Could not record wallet transaction:",
                error.message
              );
            }
          });

        approvePayment();

        const wallet = db
          .prepare(`
            SELECT *
            FROM wallets
            WHERE customer_id = ?
          `)
          .get(payment.customer_id);

        console.log(
          "WALLET PAYMENT APPROVED:",
          {
            paymentId,
            customerId:
              payment.customer_id,
            amount,
          }
        );

        return res.json({
          success: true,

          payment_id:
            paymentId,

          customer:
            payment.full_name,

          customer_code:
            payment.customer_code,

          amount,

          status:
            "approved",

          balance:
            Number(wallet?.balance) || 0,
        });
      } catch (error) {
        console.error(
          "APPROVE WALLET PAYMENT ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Failed to approve wallet payment",

          details:
            error.message,
        });
      }
    }
  );


  /*
  ==============================================================
  REJECT WALLET PAYMENT
  ==============================================================

  POST /admin/wallet/payments/:paymentId/reject

  Body:

  {
    "reason": "Invalid payment proof"
  }

  Wallet is NOT changed.
  */

  app.post(
    "/admin/wallet/payments/:paymentId/reject",
    (req, res) => {
      try {
        const paymentId =
          Number(req.params.paymentId);

        const reason =
          req.body?.reason ||
          "Payment rejected by admin";

        if (!paymentId) {
          return res.status(400).json({
            error: "Invalid payment",
          });
        }

        const payment = db
          .prepare(`
            SELECT *
            FROM payments
            WHERE id = ?
              AND type = 'wallet'
          `)
          .get(paymentId);

        if (!payment) {
          return res.status(404).json({
            error:
              "Wallet payment not found",
          });
        }

        if (payment.status !== "pending") {
          return res.status(400).json({
            error:
              `Payment cannot be rejected because its status is ${payment.status}`,
          });
        }

        /*
        ----------------------------------------------------------
        Update payment status
        ----------------------------------------------------------
        */

        db.prepare(`
          UPDATE payments
          SET status = 'rejected'
          WHERE id = ?
        `).run(paymentId);

        /*
        ----------------------------------------------------------
        If your payments table has a notes/reason column,
        save the rejection reason.

        We intentionally don't assume the column exists.
        ----------------------------------------------------------
        */

        try {
          db.prepare(`
            UPDATE payments
            SET rejection_reason = ?
            WHERE id = ?
          `).run(
            reason,
            paymentId
          );
        } catch (error) {
          console.log(
            "rejection_reason column not available"
          );
        }

        return res.json({
          success: true,

          payment_id:
            paymentId,

          status:
            "rejected",

          reason,
        });
      } catch (error) {
        console.error(
          "REJECT WALLET PAYMENT ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Failed to reject wallet payment",

          details:
            error.message,
        });
      }
    }
  );


  // ============================================================
  // WALLET WITHDRAWAL REQUEST
  // ============================================================

  /*
  ==============================================================
  CUSTOMER WITHDRAWAL REQUEST

  POST /wallet/withdraw

  Body example:

  {
    "customer_id": 1,
    "amount": 100,
    "payment_method": "aba",
    "account_name": "Customer",
    "account_number": "000000000"
  }

  This creates a pending withdrawal.

  The wallet is NOT deducted until admin approves it.
  ==============================================================

  NOTE:

  We create the table automatically if it doesn't exist.
  */

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        payment_method TEXT,
        account_name TEXT,
        account_number TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error(
      "Could not create wallet_withdrawals table:",
      error.message
    );
  }


  app.post(
    "/wallet/withdraw",
    (req, res) => {
      try {
        const customerId =
          Number(req.body?.customer_id);

        const amount =
          Number(req.body?.amount);

        const paymentMethod =
          req.body?.payment_method ||
          "wallet";

        const accountName =
          req.body?.account_name ||
          "";

        const accountNumber =
          req.body?.account_number ||
          "";

        if (!customerId) {
          return res.status(400).json({
            error: "Invalid customer",
          });
        }

        if (
          Number.isNaN(amount) ||
          amount <= 0
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
            error:
              "Customer not found",
          });
        }

        const wallet = db
          .prepare(`
            SELECT *
            FROM wallets
            WHERE customer_id = ?
          `)
          .get(customerId);

        const balance =
          Number(wallet?.balance) || 0;

        if (amount > balance) {
          return res.status(400).json({
            error:
              "Insufficient wallet balance",

            balance,

            requested:
              amount,
          });
        }

        const result = db
          .prepare(`
            INSERT INTO wallet_withdrawals
            (
              customer_id,
              amount,
              payment_method,
              account_name,
              account_number,
              status
            )
            VALUES (?, ?, ?, ?, ?, 'pending')
          `)
          .run(
            customerId,
            amount,
            paymentMethod,
            accountName,
            accountNumber
          );

        return res.status(201).json({
          success: true,

          id:
            result.lastInsertRowid,

          customer:
            customer.full_name,

          customer_code:
            customer.customer_code,

          amount,

          status:
            "pending",
        });
      } catch (error) {
        console.error(
          "POST /wallet/withdraw ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Withdrawal request failed",

          details:
            error.message,
        });
      }
    }
  );


  // ============================================================
  // ADMIN WITHDRAWAL APPROVAL
  // ============================================================

  /*
  POST /admin/wallet/withdrawals/:withdrawalId/approve

  Money is deducted only when admin approves.
  */

  app.post(
    "/admin/wallet/withdrawals/:withdrawalId/approve",
    (req, res) => {
      try {
        const withdrawalId =
          Number(
            req.params.withdrawalId
          );

        if (!withdrawalId) {
          return res.status(400).json({
            error:
              "Invalid withdrawal",
          });
        }

        const withdrawal = db
          .prepare(`
            SELECT
              w.*,
              c.full_name,
              c.customer_code
            FROM wallet_withdrawals w
            LEFT JOIN customers c
              ON c.id = w.customer_id
            WHERE w.id = ?
          `)
          .get(withdrawalId);

        if (!withdrawal) {
          return res.status(404).json({
            error:
              "Withdrawal not found",
          });
        }

        if (
          withdrawal.status !==
          "pending"
        ) {
          return res.status(400).json({
            error:
              `Withdrawal is already ${withdrawal.status}`,
          });
        }

        const amount =
          Number(withdrawal.amount);

        const wallet = db
          .prepare(`
            SELECT *
            FROM wallets
            WHERE customer_id = ?
          `)
          .get(
            withdrawal.customer_id
          );

        const balance =
          Number(wallet?.balance) || 0;

        if (amount > balance) {
          return res.status(400).json({
            error:
              "Insufficient wallet balance",

            balance,

            requested:
              amount,
          });
        }

        const newBalance =
          Number(
            (
              balance -
              amount
            ).toFixed(2)
          );

        const approveWithdrawal =
          db.transaction(() => {
            db.prepare(`
              UPDATE wallets
              SET balance = ?
              WHERE customer_id = ?
            `).run(
              newBalance,
              withdrawal.customer_id
            );

            db.prepare(`
              UPDATE wallet_withdrawals
              SET
                status = 'approved',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              withdrawalId
            );

            try {
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
                withdrawal.customer_id,
                -amount,
                "wallet_withdrawal",
                `Wallet withdrawal #${withdrawalId}`
              );
            } catch (error) {
              console.log(
                "Could not record withdrawal transaction:",
                error.message
              );
            }
          });

        approveWithdrawal();

        return res.json({
          success: true,

          withdrawal_id:
            withdrawalId,

          customer:
            withdrawal.full_name,

          customer_code:
            withdrawal.customer_code,

          amount,

          status:
            "approved",

          balance:
            newBalance,
        });
      } catch (error) {
        console.error(
          "APPROVE WITHDRAWAL ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Failed to approve withdrawal",

          details:
            error.message,
        });
      }
    }
  );


  // ============================================================
  // ADMIN WITHDRAWAL REJECTION
  // ============================================================

  /*
  POST /admin/wallet/withdrawals/:withdrawalId/reject

  Body:

  {
    "reason": "Unable to process withdrawal"
  }

  Wallet is NOT changed.
  */

  app.post(
    "/admin/wallet/withdrawals/:withdrawalId/reject",
    (req, res) => {
      try {
        const withdrawalId =
          Number(
            req.params.withdrawalId
          );

        const reason =
          req.body?.reason ||
          "Withdrawal rejected by admin";

        if (!withdrawalId) {
          return res.status(400).json({
            error:
              "Invalid withdrawal",
          });
        }

        const withdrawal = db
          .prepare(`
            SELECT *
            FROM wallet_withdrawals
            WHERE id = ?
          `)
          .get(withdrawalId);

        if (!withdrawal) {
          return res.status(404).json({
            error:
              "Withdrawal not found",
          });
        }

        if (
          withdrawal.status !==
          "pending"
        ) {
          return res.status(400).json({
            error:
              `Withdrawal is already ${withdrawal.status}`,
          });
        }

        db.prepare(`
          UPDATE wallet_withdrawals
          SET
            status = 'rejected',
            reason = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          reason,
          withdrawalId
        );

        return res.json({
          success: true,

          withdrawal_id:
            withdrawalId,

          status:
            "rejected",

          reason,
        });
      } catch (error) {
        console.error(
          "REJECT WITHDRAWAL ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Failed to reject withdrawal",

          details:
            error.message,
        });
      }
    }
  );


  // ============================================================
  // CUSTOMER WITHDRAWAL HISTORY
  // ============================================================

  /*
  GET /wallet/:customerId/withdrawals
  */

  app.get(
    "/wallet/:customerId/withdrawals",
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

        const withdrawals = db
          .prepare(`
            SELECT *
            FROM wallet_withdrawals
            WHERE customer_id = ?
            ORDER BY created_at DESC
          `)
          .all(customerId);

        return res.json(
          withdrawals
        );
      } catch (error) {
        console.error(
          "GET CUSTOMER WITHDRAWALS ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Failed to load withdrawals",

          details:
            error.message,
        });
      }
    }
  );


  // ============================================================
  // END SYSTEM ROUTES
  // ============================================================
};
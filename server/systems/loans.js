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

  ensureColumn("customer_loans", "repayment_frequency", "TEXT DEFAULT 'weekly'");
  ensureColumn("payments", "loan_id", "INTEGER");
  ensureColumn("payments", "payment_method", "TEXT");

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


  app.post(
    "/loans/customer/:customerId",
    (req, res) => {
      try {
        const customerId = Number(req.params.customerId);
        const totalAmount = Number(req.body?.total_amount);
        const interestType = String(req.body?.interest_type || "fixed").trim();
        const interestValue = Number(req.body?.interest_value ?? 0);
        const repaymentFrequency = String(
          req.body?.repayment_frequency || "weekly"
        ).trim();
        const startDate = req.body?.start_date
          ? String(req.body.start_date)
          : null;
        const endDate = req.body?.end_date
          ? String(req.body.end_date)
          : null;
        const notes = String(req.body?.notes || "").trim();

        if (!Number.isInteger(customerId) || customerId <= 0) {
          return res.status(400).json({ error: "Invalid customer ID." });
        }

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
          return res.status(400).json({ error: "Loan amount must be greater than 0." });
        }

        if (!["fixed", "percentage"].includes(interestType)) {
          return res.status(400).json({
            error: "Interest type must be fixed or percentage."
          });
        }

        if (!["weekly", "one_time"].includes(repaymentFrequency)) {
          return res.status(400).json({
            error: "Repayment frequency must be weekly or one-time."
          });
        }

        if (!Number.isFinite(interestValue) || interestValue < 0) {
          return res.status(400).json({ error: "Invalid interest value." });
        }

        if (!startDate || !endDate) {
          return res.status(400).json({
            error: "Start date and end date are required."
          });
        }

        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);

        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime()) ||
          end <= start
        ) {
          return res.status(400).json({
            error: "End date must be after the start date."
          });
        }

        const customer = db.prepare(`
          SELECT id, full_name, customer_code
          FROM customers
          WHERE id = ?
        `).get(customerId);

        if (!customer) {
          return res.status(404).json({ error: "Customer not found." });
        }

        let weeklyInterest = Number(
          calculateWeeklyInterest(
            totalAmount,
            interestType,
            interestValue
          )
        );

        if (!Number.isFinite(weeklyInterest)) {
          weeklyInterest = 0;
        }

        weeklyInterest = Number(weeklyInterest.toFixed(2));

        const existing = db.prepare(`
          SELECT *
          FROM customer_loans
          WHERE customer_id = ?
          LIMIT 1
        `).get(customerId);

        if (
          existing &&
          String(existing.status || existing.loan_status || "") === "active" &&
          Number(existing.principal_remaining ?? existing.remaining_balance ?? 0) > 0
        ) {
          return res.status(400).json({
            error: "This customer already has an active loan."
          });
        }

        const transaction = db.transaction(() => {
          let loanId;

          if (existing) {
            loanId = Number(existing.id);

            db.prepare(`
              DELETE FROM loan_payments
              WHERE loan_id = ?
            `).run(loanId);

            db.prepare(`
              DELETE FROM loan_transactions
              WHERE loan_id = ?
            `).run(loanId);

            // Any old pending request for this old loan can no longer be
            // approved against the new loan.
            db.prepare(`
              UPDATE payments
              SET status = 'rejected'
              WHERE type = 'loan'
                AND loan_id = ?
                AND status = 'pending'
            `).run(loanId);

            db.prepare(`
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
                repayment_frequency = ?,
                principal_remaining = ?,
                remaining_balance = ?,
                payoff_date = NULL,
                status = 'active',
                loan_status = 'active',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              totalAmount,
              notes,
              startDate,
              endDate,
              interestType,
              interestValue,
              weeklyInterest,
              repaymentFrequency,
              totalAmount,
              totalAmount,
              loanId
            );
          } else {
            const result = db.prepare(`
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
                repayment_frequency,
                principal_remaining,
                remaining_balance,
                loan_status,
                status
              )
              VALUES (?, 1, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'active')
            `).run(
              customerId,
              totalAmount,
              notes,
              startDate,
              endDate,
              interestType,
              interestValue,
              weeklyInterest,
              repaymentFrequency,
              totalAmount,
              totalAmount
            );

            loanId = Number(result.lastInsertRowid);
          }

          if (
            repaymentFrequency === "weekly" &&
            weeklyInterest > 0
          ) {
            createInterestSchedule(
              loanId,
              startDate,
              endDate,
              weeklyInterest
            );
          }

          return loanId;
        });

        const loanId = transaction();

        const loan = db.prepare(`
          SELECT
            customer_loans.*,
            customers.full_name,
            customers.customer_code
          FROM customer_loans
          JOIN customers
            ON customers.id = customer_loans.customer_id
          WHERE customer_loans.id = ?
        `).get(loanId);

        res.status(201).json({
          success: true,
          loan: {
            ...loan,
            remaining: Number(loan.principal_remaining || 0),
            is_paid_off: false
          }
        });
      } catch (error) {
        console.error("CREATE LOAN ERROR:", error);
        res.status(500).json({
          error: "Failed to create loan",
          details: error.message
        });
      }
    }
  );


  /*
   * CUSTOMER LOAN PAYMENT REQUEST
   *
   * The customer never changes the loan balance directly.
   * They submit amount + payment method + receipt. The admin
   * approves the request before the loan balance is reduced.
   */
  app.post(
    "/loans/customer/:customerId/payment-request",
    requestUpload.single("payment_proof"),
    (req, res) => {
      try {
        const customerId = Number(req.params.customerId);
        const amount = Number(req.body?.amount);
        const paymentMethod = String(req.body?.payment_method || "qr").trim();

        if (!Number.isInteger(customerId) || customerId <= 0) {
          return res.status(400).json({ error: "Invalid customer." });
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

        const remaining = Math.max(
          0,
          Number(loan.principal_remaining ?? loan.remaining_balance ?? 0)
        );

        if (remaining <= 0) {
          return res.status(400).json({ error: "Loan is already paid off." });
        }

        if (amount > remaining) {
          return res.status(400).json({
            error: "Payment cannot be greater than the remaining balance."
          });
        }

        const existingPending = db.prepare(`
          SELECT id
          FROM payments
          WHERE customer_id = ?
            AND type = 'loan'
            AND loan_id = ?
            AND status = 'pending'
          LIMIT 1
        `).get(customerId, loan.id);

        if (existingPending) {
          return res.status(400).json({
            error: "You already have a loan payment waiting for approval."
          });
        }

        const base64File = req.file.buffer.toString("base64");
        const paymentImage = `data:${req.file.mimetype};base64,${base64File}`;

        const result = db.prepare(`
          INSERT INTO payments
          (
            customer_id,
            type,
            amount,
            payment_image,
            status,
            loan_id,
            payment_method
          )
          VALUES (?, 'loan', ?, ?, 'pending', ?, ?)
        `).run(
          customerId,
          amount,
          paymentImage,
          loan.id,
          paymentMethod
        );

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
        res.status(500).json({
          error: "Failed to submit loan payment.",
          details: error.message
        });
      }
    }
  );

  app.get(
    "/loans/customer/:customerId/payment-requests",
    (req, res) => {
      try {
        const customerId = Number(req.params.customerId);

        const rows = db.prepare(`
          SELECT
            p.id,
            p.customer_id,
            p.amount,
            p.payment_image,
            p.status,
            p.created_at,
            p.loan_id,
            p.payment_method
          FROM payments p
          WHERE p.customer_id = ?
            AND p.type = 'loan'
          ORDER BY p.created_at DESC, p.id DESC
        `).all(customerId);

        res.json(rows);
      } catch (error) {
        console.error("GET LOAN PAYMENT REQUESTS ERROR:", error);
        res.status(500).json({
          error: "Failed to load loan payment requests."
        });
      }
    }
  );

  app.get(
    "/admin/loan-payments",
    (req, res) => {
      try {
        const rows = db.prepare(`
          SELECT
            p.*,
            c.full_name,
            c.customer_code,
            c.email,
            c.phone,
            l.total_amount AS loan_total,
            l.principal_remaining AS loan_remaining,
            l.repayment_frequency
          FROM payments p
          JOIN customers c
            ON c.id = p.customer_id
          LEFT JOIN customer_loans l
            ON l.id = p.loan_id
          WHERE p.type = 'loan'
          ORDER BY p.created_at DESC, p.id DESC
        `).all();

        res.json(rows);
      } catch (error) {
        console.error("GET ADMIN LOAN PAYMENTS ERROR:", error);
        res.status(500).json({
          error: "Failed to load loan payments."
        });
      }
    }
  );

  app.put(
    "/admin/loan-payments/:id/approve",
    (req, res) => {
      try {
        const paymentId = Number(req.params.id);

        const payment = db.prepare(`
          SELECT *
          FROM payments
          WHERE id = ?
            AND type = 'loan'
          LIMIT 1
        `).get(paymentId);

        if (!payment) {
          return res.status(404).json({ error: "Loan payment not found." });
        }

        if (payment.status !== "pending") {
          return res.status(400).json({ error: "This payment has already been processed." });
        }

        const loan = db.prepare(`
          SELECT *
          FROM customer_loans
          WHERE id = ?
            AND customer_id = ?
          LIMIT 1
        `).get(payment.loan_id, payment.customer_id);

        if (!loan || loan.status !== "active") {
          return res.status(400).json({ error: "The linked loan is no longer active." });
        }

        const remaining = Math.max(
          0,
          Number(loan.principal_remaining ?? loan.remaining_balance ?? 0)
        );
        const amount = Number(payment.amount || 0);

        if (amount <= 0 || amount > remaining) {
          return res.status(400).json({
            error: "The payment amount is no longer valid for this loan."
          });
        }

        const newRemaining = Number((remaining - amount).toFixed(2));
        const paidOff = newRemaining <= 0;

        const transaction = db.transaction(() => {
          db.prepare(`
            UPDATE payments
            SET status = 'approved'
            WHERE id = ?
          `).run(paymentId);

          db.prepare(`
            UPDATE customer_loans
            SET
              paid_amount = paid_amount + ?,
              principal_remaining = ?,
              remaining_balance = ?,
              enabled = ?,
              status = ?,
              loan_status = ?,
              payoff_date = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            amount,
            newRemaining,
            newRemaining,
            paidOff ? 0 : 1,
            paidOff ? "paid_off" : "active",
            paidOff ? "paid_off" : "active",
            paidOff ? getToday() : null,
            loan.id
          );

          db.prepare(`
            INSERT INTO loan_transactions
            (
              loan_id,
              amount,
              type,
              description
            )
            VALUES (?, ?, 'principal_payment', ?)
          `).run(
            loan.id,
            amount,
            `Customer payment approved #${paymentId}`
          );

          if (paidOff) {
            db.prepare(`
              UPDATE loan_payments
              SET status = 'cancelled'
              WHERE loan_id = ?
                AND payment_type = 'interest'
                AND status IN ('due', 'overdue')
            `).run(loan.id);
          }
        });

        transaction();

        const updatedLoan = db.prepare(`
          SELECT *
          FROM customer_loans
          WHERE id = ?
        `).get(loan.id);

        res.json({
          success: true,
          payment_id: paymentId,
          loan: {
            ...updatedLoan,
            remaining: Number(updatedLoan.principal_remaining || 0),
            is_paid_off: updatedLoan.status === "paid_off"
          }
        });
      } catch (error) {
        console.error("APPROVE LOAN PAYMENT ERROR:", error);
        res.status(500).json({
          error: "Failed to approve loan payment.",
          details: error.message
        });
      }
    }
  );

  app.put(
    "/admin/loan-payments/:id/reject",
    (req, res) => {
      try {
        const paymentId = Number(req.params.id);

        const payment = db.prepare(`
          SELECT id, status
          FROM payments
          WHERE id = ?
            AND type = 'loan'
          LIMIT 1
        `).get(paymentId);

        if (!payment) {
          return res.status(404).json({ error: "Loan payment not found." });
        }

        if (payment.status !== "pending") {
          return res.status(400).json({ error: "This payment has already been processed." });
        }

        db.prepare(`
          UPDATE payments
          SET status = 'rejected'
          WHERE id = ?
        `).run(paymentId);

        res.json({ success: true });
      } catch (error) {
        console.error("REJECT LOAN PAYMENT ERROR:", error);
        res.status(500).json({
          error: "Failed to reject loan payment.",
          details: error.message
        });
      }
    }
  );

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

  app.get(
    "/loans",
    (req, res) => {
  
      try {
  
        updateOverduePayments();
  
  
        const loans =
          db.prepare(`
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
          `)
          .all();
  
  
        const result =
          loans.map((loan) => {
  
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
  
          });
  
  
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
          db.prepare(`
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
          `)
          .get(customerId);
  
  
        /*
          If the customer has no loan,
          return an empty loan object.
  
          This makes the frontend easier
          because it doesn't have to treat
          a missing loan as a server error.
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
              loan.total_amount || 0
            ),
  
          paid_amount:
            Number(
              loan.paid_amount || 0
            ),
  
          principal_remaining:
            remaining,
  
          remaining,
  
          is_paid_off:
            remaining <= 0 ||
            status ===
              "paid_off",
  
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
          req.body.start_date;
  
  
        const endDate =
          req.body.end_date;
  
  
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
          interestType !== "fixed" &&
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
          db.prepare(`
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
  
  
        /* ---------------------------------------------------
           CHECK EXISTING LOAN
        --------------------------------------------------- */
  
        const existing =
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE customer_id = ?
  
            LIMIT 1
          `)
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
  
  
          /*
            Don't create another active
            loan for the same customer.
          */
  
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
            If the previous loan was
            completed/cancelled, reuse
            the existing database row.
          */
  
          const weeklyInterest =
            calculateWeeklyInterest(
              totalAmount,
              interestType,
              interestValue
            );
  
  
          const transaction =
            db.transaction(() => {
  
              db.prepare(`
                DELETE FROM loan_payments
  
                WHERE loan_id = ?
              `)
              .run(existing.id);
  
  
              db.prepare(`
                DELETE FROM loan_transactions
  
                WHERE loan_id = ?
              `)
              .run(existing.id);
  
  
              db.prepare(`
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
              `)
              .run(
  
                totalAmount,
  
                String(notes).trim(),
  
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
            db.prepare(`
              SELECT
  
                customer_loans.*,
  
                customers.full_name,
  
                customers.customer_code
  
              FROM customer_loans
  
              JOIN customers
                ON customers.id =
                   customer_loans.customer_id
  
              WHERE customer_loans.id = ?
            `)
            .get(existing.id);
  
  
          return res.status(201).json({
  
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
           CREATE NEW LOAN
        --------------------------------------------------- */
  
        const createLoan =
          db.transaction(() => {
  
            const result =
              db.prepare(`
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
              `)
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
  
  
        /* ---------------------------------------------------
           GET CREATED LOAN
        --------------------------------------------------- */
  
        const loan =
          db.prepare(`
            SELECT
  
              customer_loans.*,
  
              customers.full_name,
  
              customers.customer_code
  
            FROM customer_loans
  
            JOIN customers
  
              ON customers.id =
                 customer_loans.customer_id
  
            WHERE customer_loans.id = ?
          `)
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
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE customer_id = ?
  
            AND status = 'active'
  
            LIMIT 1
          `)
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
  
  
        if (remaining <= 0) {
  
          return res.status(400).json({
            error:
              "Loan is already paid off",
          });
  
        }
  
  
        if (amount > remaining) {
  
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
  
            db.prepare(`
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
            `)
            .run(
  
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
  
  
            db.prepare(`
              INSERT INTO loan_transactions
              (
                loan_id,
  
                amount,
  
                type,
  
                description
              )
  
              VALUES
              (?, ?, ?, ?)
            `)
            .run(
  
              loan.id,
  
              amount,
  
              "principal_payment",
  
              String(
                notes
              ).trim() ||
                "Principal payment"
  
            );
  
  
            /*
              If the loan is fully paid,
              cancel unpaid interest payments.
            */
  
            if (paidOff) {
  
              db.prepare(`
                UPDATE loan_payments
  
                SET status = 'cancelled'
  
                WHERE loan_id = ?
  
                AND payment_type =
                  'interest'
  
                AND status IN
                  ('due', 'overdue')
              `)
              .run(loan.id);
  
            }
  
          });
  
  
        transaction();
  
  
        const updated =
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE id = ?
          `)
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
          db.prepare(`
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
          `)
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
          db.prepare(`
            SELECT
  
              loan_payments.*,
  
              customer_loans.customer_id,
  
              customer_loans.status
                AS loan_status
  
            FROM loan_payments
  
            JOIN customer_loans
  
              ON customer_loans.id =
                 loan_payments.loan_id
  
            WHERE loan_payments.id = ?
          `)
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
  
            db.prepare(`
              UPDATE loan_payments
  
              SET
  
                status = 'paid',
  
                paid_date = ?
  
              WHERE id = ?
            `)
            .run(
  
              paidDate,
  
              paymentId
  
            );
  
  
            db.prepare(`
              INSERT INTO loan_transactions
              (
                loan_id,
  
                amount,
  
                type,
  
                description
              )
  
              VALUES
              (?, ?, ?, ?)
            `)
            .run(
  
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

  app.get(
    "/loans/customer/:customerId/transactions",
    (req, res) => {
  
      try {
  
        const transactions =
          db.prepare(`
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
  
              loan_transactions.created_at
              DESC
          `)
          .all(
            req.params.customerId
          );
  
  
        res.json(transactions);
  
  
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
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE customer_id = ?
  
            AND status = 'active'
  
            LIMIT 1
          `)
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
          interestType !== "fixed" &&
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
  
            /*
              Remove only unpaid
              scheduled interest payments.
            */
  
            db.prepare(`
              DELETE FROM loan_payments
  
              WHERE loan_id = ?
  
              AND status IN
                ('due', 'overdue')
            `)
            .run(loan.id);
  
  
            db.prepare(`
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
            `)
            .run(
  
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
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE id = ?
          `)
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

  app.put(
    "/loans/customer/:customerId/disable",
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
          db.prepare(`
            SELECT *
  
            FROM customer_loans
  
            WHERE customer_id = ?
  
            AND status = 'active'
  
            LIMIT 1
          `)
          .get(customerId);
  
  
        if (!loan) {
  
          return res.status(404).json({
            error:
              "No active loan found",
          });
  
        }
  
  
        const transaction =
          db.transaction(() => {
  
            db.prepare(`
              UPDATE customer_loans
  
              SET
  
                enabled = 0,
  
                status = 'cancelled',
  
                loan_status = 'cancelled',
  
                updated_at =
                  CURRENT_TIMESTAMP
  
              WHERE id = ?
            `)
            .run(loan.id);
  
  
            db.prepare(`
              UPDATE loan_payments
  
              SET status = 'cancelled'
  
              WHERE loan_id = ?
  
              AND status IN
                ('due', 'overdue')
            `)
            .run(loan.id);
  
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
};

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
};

module.exports = function registerSystem({ app, ...shared }) {
  const {
    db,
    paymentUpload,
    authenticateToken,
  } = shared;

  // ============================================================
  // HELPER
  // ============================================================

  function generatePublicOrderNumber() {
    let number;
    let exists;

    do {
      number = String(
        Math.floor(100000 + Math.random() * 900000)
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

  function getOrderById(orderId) {
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

    if (!order) {
      return null;
    }

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

    return {
      ...order,
      services,
      service_name:
        services.length > 0
          ? services
              .map((item) => item.service_name)
              .filter(Boolean)
              .join(", ")
          : null,
    };
  }

  // ============================================================
  // CUSTOMER ORDERS
  // ============================================================

  app.get(
    "/api/customer/orders",
    authenticateToken,
    (req, res) => {
      try {
        const customerId = Number(req.user.id);

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
              o.total,
              o.notes,
              o.created_at,

              o.payment_amount,
              o.payment_receipt,
              o.payment_submitted_at,
              o.payment_status

            FROM orders o

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

  // ============================================================
  // CUSTOMER ORDER DETAILS
  // ============================================================

  app.get(
    "/api/customer/orders/:id",
    authenticateToken,
    (req, res) => {
      try {
        const customerId = Number(req.user.id);
        const orderId = Number(req.params.id);

        if (!customerId) {
          return res.status(401).json({
            message: "Invalid customer authentication.",
          });
        }

        if (!Number.isInteger(orderId) || orderId <= 0) {
          return res.status(400).json({
            message: "Invalid order ID.",
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
              o.total,
              o.notes,
              o.created_at,

              o.payment_amount,
              o.payment_receipt,
              o.payment_submitted_at,
              o.payment_status

            FROM orders o

            WHERE o.id = ?
              AND o.customer_id = ?
          `)
          .get(orderId, customerId);

        if (!order) {
          return res.status(404).json({
            message: "Order not found.",
          });
        }

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

        res.json({
          success: true,
          customer,
          order: {
            ...order,
            services,
          },
        });

      } catch (error) {
        console.error(
          "CUSTOMER ORDER DETAILS ERROR:",
          error
        );

        res.status(500).json({
          message: "Failed to load customer order.",
          details: error.message,
        });
      }
    }
  );

  // ============================================================
  // CUSTOMER PAYMENT RECEIPT
  // ============================================================

  app.post(
    "/api/customer/orders/:id/payment",
    authenticateToken,
    paymentUpload.single("receipt"),
    (req, res) => {
      try {
        const customerId = Number(req.user.id);
        const orderId = Number(req.params.id);

        if (!customerId) {
          return res.status(401).json({
            success: false,
            message: "Invalid customer authentication.",
          });
        }

        if (!Number.isInteger(orderId) || orderId <= 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid order ID.",
          });
        }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "Please upload your payment receipt.",
          });
        }

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

        if (order.status !== "pending_payment") {
          return res.status(400).json({
            success: false,
            message:
              "This order is not currently waiting for payment.",
          });
        }

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

        const receiptData =
          `data:${req.file.mimetype};base64,` +
          req.file.buffer.toString("base64");

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

  // ============================================================
  // ADMIN - GET ALL ORDERS
  // ============================================================

  app.get("/orders", (req, res) => {
    try {
      const orders = db
        .prepare(`
          SELECT
            orders.*,

            customers.full_name AS customer_name,
            customers.customer_code,
            customers.customer_type

          FROM orders

          LEFT JOIN customers
            ON customers.id = orders.customer_id

          ORDER BY orders.id DESC
        `)
        .all();

      const getItems = db.prepare(`
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
      `);

      const result = orders.map((order) => {
        const services = getItems.all(order.id);

        return {
          ...order,

          services,

          service_name:
            services.length > 0
              ? services
                  .map((item) => item.service_name)
                  .filter(Boolean)
                  .join(", ")
              : null,
        };
      });

      res.json(result);

    } catch (error) {
      console.error(
        "GET /orders ERROR:",
        error
      );

      res.status(500).json({
        error: "Failed to load orders",
        details: error.message,
      });
    }
  });

  // ============================================================
  // ADMIN - GET SINGLE ORDER
  // ============================================================

  app.get("/orders/:id", (req, res) => {
    try {
      const orderId = Number(req.params.id);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          error: "Invalid order ID",
        });
      }

      const order = getOrderById(orderId);

      if (!order) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      res.json(order);

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

  // ============================================================
  // ADMIN - CREATE ORDER
  // ============================================================

  app.post("/orders", (req, res) => {
    try {
      const body = req.body || {};

      const customer_id = Number(
        body.customer_id
      );

      const servicesList =
        Array.isArray(body.services)
          ? body.services
          : [];

      // --------------------------------------------------------
      // CUSTOMER
      // --------------------------------------------------------

      if (
        !Number.isInteger(customer_id) ||
        customer_id <= 0
      ) {
        return res.status(400).json({
          error: "Customer is required",
        });
      }

      const customer = db
        .prepare(`
          SELECT
            id,
            full_name,
            customer_code,
            customer_type
          FROM customers
          WHERE id = ?
        `)
        .get(customer_id);

      if (!customer) {
        return res.status(404).json({
          error: "Customer not found",
        });
      }

      // --------------------------------------------------------
      // SERVICES
      // --------------------------------------------------------

      if (servicesList.length === 0) {
        return res.status(400).json({
          error: "At least one service is required",
        });
      }

      // --------------------------------------------------------
      // CREATE ORDER TRANSACTION
      // --------------------------------------------------------

      const createOrder = db.transaction(() => {
        let orderTotal = 0;

        const publicOrderNumber =
          generatePublicOrderNumber();

        const orderResult = db
          .prepare(`
            INSERT INTO orders
            (
              customer_id,
              status,
              total,
              notes,
              public_order_number
            )
            VALUES
            (?, ?, ?, ?, ?)
          `)
          .run(
            customer_id,
            body.status || "pending",
            0,
            body.notes || "",
            publicOrderNumber
          );

        const orderId =
          Number(orderResult.lastInsertRowid);

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

          if (
            !Number.isInteger(service_id) ||
            service_id <= 0
          ) {
            throw new Error(
              "Invalid service ID."
            );
          }

          const quantity =
            Number(item.quantity) > 0
              ? Number(item.quantity)
              : 1;

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

          const price =
            Number(service.price) || 0;

          const itemTotal =
            Number(
              (price * quantity).toFixed(2)
            );

          // ----------------------------------------------------
          // FILE
          // ----------------------------------------------------

          const fileData =
            item.file_data || null;

          const fileName =
            item.file_name || null;

          const fileType =
            item.file_type || null;

          const fileSize =
            Number(item.file_size) || 0;

          if (
            fileData &&
            Number(service.allow_file_upload) !== 1
          ) {
            throw new Error(
              `File upload is disabled for service: ${service.name}`
            );
          }

          // ----------------------------------------------------
          // APPROVED DATE
          // ----------------------------------------------------

          const approvedDate =
            item.approved_date || null;

          // ----------------------------------------------------
          // NOTES
          // ----------------------------------------------------

          const itemNotes =
            item.notes == null
              ? ""
              : String(item.notes);

          // ----------------------------------------------------
          // SAVE ORDER ITEM
          // ----------------------------------------------------

          insertItem.run(
            orderId,
            service_id,
            quantity,
            price,
            itemTotal,
            approvedDate,
            itemNotes,
            fileName,
            fileType,
            fileSize,
            fileData
          );

          orderTotal += itemTotal;
        }

        // ------------------------------------------------------
        // UPDATE ORDER TOTAL
        // ------------------------------------------------------

        db.prepare(`
          UPDATE orders
          SET total = ?
          WHERE id = ?
        `).run(
          Number(orderTotal.toFixed(2)),
          orderId
        );

        return orderId;
      });

      const orderId = createOrder();

      // --------------------------------------------------------
      // GET CREATED ORDER
      // --------------------------------------------------------

      const order = getOrderById(orderId);

      if (!order) {
        return res.status(500).json({
          error:
            "Order was created but could not be loaded.",
        });
      }

      console.log(
        `ORDER CREATED: #${orderId} / PUBLIC #${order.public_order_number}`
      );

      res.status(201).json({
        success: true,
        order,
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

  // ============================================================
  // ADMIN - UPDATE ORDER STATUS
  // ============================================================

  app.put(
    "/orders/:id/status",
    authenticateToken,
    (req, res) => {
      try {
        const orderId =
          Number(req.params.id);

        const { status } =
          req.body || {};

        if (
          !Number.isInteger(orderId) ||
          orderId <= 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid order ID.",
          });
        }

        const allowedStatuses = [
          "pending",
          "pending_payment",
          "processing",
          "pending_approval",
          "completed",
          "cancelled",
        ];

        if (
          !allowedStatuses.includes(status)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid order status.",
            allowedStatuses,
          });
        }

        const existingOrder = db
          .prepare(`
            SELECT
              id,
              customer_id,
              status,
              total,
              payment_amount,
              payment_receipt,
              payment_submitted_at,
              payment_status
            FROM orders
            WHERE id = ?
          `)
          .get(orderId);

        if (!existingOrder) {
          return res.status(404).json({
            success: false,
            message: "Order not found.",
          });
        }
// ------------------------------------------------------
// CUSTOMER APPROVAL IS REQUIRED
// ------------------------------------------------------

if (
  status === "completed" &&
  existingOrder.status === "pending_approval"
) {
  return res.status(400).json({
    success: false,
    message:
      "This order is waiting for customer approval.",
  });
}
        // ------------------------------------------------------
        // UPDATE STATUS
        // ------------------------------------------------------

        db.prepare(`
          UPDATE orders
          SET status = ?
          WHERE id = ?
        `).run(
          status,
          orderId
        );

        // ------------------------------------------------------
        // PREPARE PAYMENT
        // ------------------------------------------------------

        if (status === "pending_payment") {
          db.prepare(`
            UPDATE orders
            SET
              payment_status = 'unpaid',
              payment_amount = total,
              payment_receipt = NULL,
              payment_submitted_at = NULL
            WHERE id = ?
          `).run(orderId);
        }

        // ------------------------------------------------------
        // RETURN UPDATED ORDER
        // ------------------------------------------------------

        const updatedOrder =
          getOrderById(orderId);

        console.log(
          `ORDER #${orderId} STATUS: ${existingOrder.status} -> ${status}`
        );

        res.json({
          success: true,
          message:
            "Order status updated successfully.",
          order: updatedOrder,
        });

      } catch (error) {
        console.error(
          "PUT /orders/:id/status ERROR:",
          error
        );

        res.status(500).json({
          success: false,
          error:
            "Failed to update order status",
          details: error.message,
        });
      }
    }
  );
// ======================================================
// ADMIN UPLOAD RECEIPT FOR CUSTOMER APPROVAL
// ======================================================

router.post(
  "/:id/approval-receipt",
  upload.single("receipt"),
  (req, res) => {
    try {
      const orderId = Number(req.params.id);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload a receipt.",
        });
      }

      const order = db
        .prepare(`
          SELECT
            id,
            status
          FROM orders
          WHERE id = ?
        `)
        .get(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // Receipt is only allowed for Pending Approval
      if (order.status !== "pending_approval") {
        return res.status(400).json({
          success: false,
          message:
            "The order must be Pending Approval before uploading a receipt.",
        });
      }

      const receiptData =
        `data:${req.file.mimetype};base64,` +
        req.file.buffer.toString("base64");

      db.prepare(`
        UPDATE orders
        SET
          payment_receipt = ?,
          payment_submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        receiptData,
        orderId
      );

      const updatedOrder = getOrderById(orderId);

      console.log(
        `ADMIN RECEIPT UPLOADED FOR ORDER #${orderId}`
      );

      return res.json({
        success: true,
        message:
          "Receipt uploaded. Waiting for customer approval.",
        order: updatedOrder,
      });

    } catch (error) {
      console.error(
        "ADMIN APPROVAL RECEIPT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload approval receipt.",
        error: error.message,
      });
    }
  }
);// ======================================================
// CUSTOMER APPROVES COMPLETED ORDER
// ======================================================

router.post(
  "/:id/approve-completion",
  (req, res) => {
    try {
      const orderId = Number(req.params.id);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      /*
       * IMPORTANT:
       * Replace this with however your existing server
       * gets the logged-in customer ID.
       *
       * If your app already has authentication middleware,
       * use req.user.id here.
       */

      const customerId =
        req.user?.id ||
        req.user?.customer_id ||
        req.body?.customer_id;

      if (!customerId) {
        return res.status(401).json({
          success: false,
          message: "Customer authentication required.",
        });
      }

      const order = db
        .prepare(`
          SELECT
            id,
            customer_id,
            status,
            payment_receipt
          FROM orders
          WHERE id = ?
            AND customer_id = ?
        `)
        .get(
          orderId,
          customerId
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      if (order.status !== "pending_approval") {
        return res.status(400).json({
          success: false,
          message:
            "This order is not waiting for approval.",
        });
      }

      if (!order.payment_receipt) {
        return res.status(400).json({
          success: false,
          message:
            "There is no receipt available to approve.",
        });
      }

      db.prepare(`
        UPDATE orders
        SET status = 'completed'
        WHERE id = ?
          AND customer_id = ?
          AND status = 'pending_approval'
      `).run(
        orderId,
        customerId
      );

      const updatedOrder = getOrderById(orderId);

      console.log(
        `CUSTOMER APPROVED ORDER #${orderId}`
      );

      return res.json({
        success: true,
        message:
          "Order approved successfully. The order is now completed.",
        order: updatedOrder,
      });

    } catch (error) {
      console.error(
        "CUSTOMER APPROVE COMPLETION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to approve order.",
        error: error.message,
      });
    }
  }
);
  // ============================================================
  // ADMIN - DELETE ORDER
  // ============================================================

  app.delete(
    "/orders/:id",
    (req, res) => {
      try {
        const orderId =
          Number(req.params.id);

        if (
          !Number.isInteger(orderId) ||
          orderId <= 0
        ) {
          return res.status(400).json({
            error: "Invalid order ID",
          });
        }

        const existing =
          db.prepare(`
            SELECT id
            FROM orders
            WHERE id = ?
          `).get(orderId);

        if (!existing) {
          return res.status(404).json({
            error: "Order not found",
          });
        }

        // Delete order items first.
        db.prepare(`
          DELETE FROM order_items
          WHERE order_id = ?
        `).run(orderId);

        // Delete main order.
        db.prepare(`
          DELETE FROM orders
          WHERE id = ?
        `).run(orderId);

        res.json({
          success: true,
          message:
            "Order deleted successfully",
        });

      } catch (error) {
        console.error(
          "DELETE /orders/:id ERROR:",
          error
        );

        res.status(500).json({
          error:
            "Failed to delete order",
          details: error.message,
        });
      }
    }
  );
};
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

  app.post(
    "/api/customer/requests",
    authenticateToken,
    requestUpload.array(
      "files",
      10
    ),
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
  
            const base64 =
              file.buffer.toString(
                "base64"
              );
  
  
            insertFile.run(
  
              requestId,
  
              file.originalname,
  
              file.mimetype,
  
              file.size,
  
              base64
  
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
  );

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
  );

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
  );

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
  
  
        /* -----------------------------------------------------
           GET CREATED ORDER
        ----------------------------------------------------- */
  
        const order =
          db.prepare(`
            SELECT
              *
  
            FROM orders
  
            WHERE id = ?
              AND customer_id = ?
          `)
          .get(
            transaction.orderId,
            customerId
          );
  
  
        res.json({
  
          success: true,
  
          message:
            "Quotation accepted. Your order has been created.",
  
          order,
  
        });
  
     } catch (error) {
  console.error(
    "ACCEPT QUOTE ERROR:",
    error
  );

  console.error(
    "ACCEPT QUOTE ERROR MESSAGE:",
    error?.message
  );

  console.error(
    "ACCEPT QUOTE ERROR STACK:",
    error?.stack
  );

  res.status(500).json({
    success: false,
    message:
      error?.message ||
      "Unable to accept quotation.",
    error:
      error?.message ||
      "Unknown accept quote error.",
  });
}
  
    }
  );

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

  app.get(
    "/admin/customer-requests",
    (req, res) => {
      try {
        const requests = db
          .prepare(`
            SELECT
              r.*,
  
              s.name AS service_name,
              s.category AS service_category,
  
              c.full_name AS customer_name,
              c.customer_code,
              c.email AS customer_email,
              c.phone AS customer_phone
  
            FROM customer_requests r
  
            LEFT JOIN services s
              ON s.id = r.service_id
  
            LEFT JOIN customers c
              ON c.id = r.customer_id
  
            ORDER BY
              r.created_at DESC,
              r.id DESC
          `)
          .all();
  
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
          requests.map((request) => {
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
          });
  
        res.json({
          success: true,
          requests: result,
        });
  
      } catch (error) {
        console.error(
          "ADMIN GET CUSTOMER REQUESTS ERROR:",
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
  
              s.name AS service_name,
              s.category AS service_category,
              s.description AS service_description,
  
              c.full_name AS customer_name,
              c.customer_code,
              c.email AS customer_email,
              c.phone AS customer_phone
  
            FROM customer_requests r
  
            LEFT JOIN services s
              ON s.id = r.service_id
  
            LEFT JOIN customers c
              ON c.id = r.customer_id
  
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
          "ADMIN GET CUSTOMER REQUEST ERROR:",
          error
        );
  
        res.status(500).json({
          success: false,
          message:
            "Failed to load customer request.",
          error:
            error.message,
        });
      }
    }
  );

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
          request.status ===
            "closed" ||
          request.status ===
            "completed"
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
            "Message sent.",
          request:
            updatedRequest,
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
          error:
            error.message,
        });
      }
    }
  );

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
            req.body.currency ||
              "USD"
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
              "Quotation amount must be greater than zero.",
          });
        }
  
        if (
          currency !== "USD" &&
          currency !== "KHR"
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Quotation currency must be USD or KHR.",
          });
        }
  
        const request =
          db.prepare(`
            SELECT
              *
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
          request.order_id
        ) {
          return res.status(400).json({
            success: false,
            message:
              "This request already has an order.",
          });
        }
  
        const transaction =
          db.transaction(() => {
  
            db.prepare(`
              UPDATE customer_requests
  
              SET
                quote_amount = ?,
                quote_currency = ?,
                quote_status = 'quoted',
                quote_note = ?,
                quoted_at =
                  CURRENT_TIMESTAMP,
                updated_at =
                  CURRENT_TIMESTAMP
  
              WHERE id = ?
            `)
            .run(
              amount,
              currency,
              note,
              requestId
            );
  
            let message =
              `Quotation: ${
                currency === "KHR"
                  ? `${Math.round(amount).toLocaleString()} ៛`
                  : `$${amount.toFixed(2)}`
              }`;
  
            if (note) {
              message +=
                `\n\n${note}`;
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
  
          });
  
        transaction();
  
        const updatedRequest =
          db.prepare(`
            SELECT
              r.*,
  
              s.name AS service_name,
              s.category AS service_category,
  
              c.full_name AS customer_name,
              c.customer_code
  
            FROM customer_requests r
  
            LEFT JOIN services s
              ON s.id = r.service_id
  
            LEFT JOIN customers c
              ON c.id = r.customer_id
  
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
          error:
            error.message,
        });
      }
    }
  );

  app.put(
    "/admin/customer-requests/:id/close",
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
            updated_at =
              CURRENT_TIMESTAMP
  
          WHERE id = ?
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
          error:
            error.message,
        });
      }
    }
  );

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
  
  
        /* =====================================================
           LAST MESSAGE
        ===================================================== */
  
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
  
  
        /* =====================================================
           FILES
        ===================================================== */
  
        const getFiles =
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
          `);
  
  
        const result =
          requests.map((request) => {
  
            const lastMessage =
              getLastMessage.get(
                request.id
              );
  
            const files =
              getFiles.all(
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
  
              files,
  
            };
  
          });
  
  
        res.json({
  
          success: true,
  
          requests: result,
  
        });
  
      } catch (error) {
  
        console.error(
          "ADMIN CUSTOMER REQUESTS ERROR:",
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

  app.get(
    "/admin/customer-requests/:id",
    (req, res) => {
  
      try {
  
        const requestId =
          Number(
            req.params.id
          );
  
  
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
          db
            .prepare(`
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
            .get(
              requestId
            );
  
  
        if (!request) {
  
          return res.status(404).json({
  
            success: false,
  
            message:
              "Customer request not found.",
  
          });
  
        }
  
  
        const messages =
          db
            .prepare(`
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
  
  
        const files =
          db
            .prepare(`
              SELECT
  
                id,
                file_name,
                file_type,
                file_size,
                file_data,
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
          "ADMIN CUSTOMER REQUEST DETAILS ERROR:",
          error
        );
  
        res.status(500).json({
  
          success: false,
  
          message:
            "Failed to load customer request.",
  
          error:
            error.message,
  
        });
  
      }
  
    }
  );

  app.post(
    "/admin/customer-requests/:id/messages",
    (req, res) => {
  
      try {
  
        const requestId =
          Number(
            req.params.id
          );
  
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
          db
            .prepare(`
              SELECT
                id,
                status
  
              FROM customer_requests
  
              WHERE id = ?
            `)
            .get(
              requestId
            );
  
  
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
  
  
        db
          .prepare(`
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
  
  
        db
          .prepare(`
            UPDATE customer_requests
  
            SET
              updated_at =
                CURRENT_TIMESTAMP
  
            WHERE id = ?
          `)
          .run(
            requestId
          );
  
  
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
  
          error:
            error.message,
  
        });
  
      }
  
    }
  );

  app.put(
    "/admin/customer-requests/:id/quote",
    (req, res) => {
  
      try {
  
        const requestId =
          Number(
            req.params.id
          );
  
        const amount =
          Number(
            req.body.amount
          );
  
        const currency =
          String(
            req.body.currency ||
            "USD"
          )
            .trim()
            .toUpperCase();
  
        const note =
          String(
            req.body.note ||
            ""
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
          db
            .prepare(`
              SELECT *
  
              FROM customer_requests
  
              WHERE id = ?
            `)
            .get(
              requestId
            );
  
  
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
  
  
        /* =====================================================
           SAVE QUOTE
        ===================================================== */
  
        db
          .prepare(`
            UPDATE customer_requests
  
            SET
  
              quote_amount = ?,
  
              quote_currency = ?,
  
              quote_status = 'quoted',
  
              quote_note = ?,
  
              quoted_at =
                CURRENT_TIMESTAMP,
  
              updated_at =
                CURRENT_TIMESTAMP
  
            WHERE id = ?
          `)
          .run(
            amount,
            currency,
            note,
            requestId
          );
  
  
        /* =====================================================
           CREATE CHAT MESSAGE
        ===================================================== */
  
        let quoteMessage =
          `Quotation: ${currency} ${amount.toLocaleString()}`;
  
        if (note) {
  
          quoteMessage +=
            `\n${note}`;
  
        }
  
  
        db
          .prepare(`
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
          db
            .prepare(`
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

  app.put(
    "/admin/customer-requests/:id/close",
    (req, res) => {
  
      try {
  
        const requestId =
          Number(
            req.params.id
          );
  
  
        const request =
          db
            .prepare(`
              SELECT *
  
              FROM customer_requests
  
              WHERE id = ?
            `)
            .get(
              requestId
            );
  
  
        if (!request) {
  
          return res.status(404).json({
  
            success: false,
  
            message:
              "Customer request not found.",
  
          });
  
        }
  
  
        db
          .prepare(`
            UPDATE customer_requests
  
            SET
  
              status = 'closed',
  
              updated_at =
                CURRENT_TIMESTAMP
  
            WHERE id = ?
          `)
          .run(
            requestId
          );
  
  
        db
          .prepare(`
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
          .run(
            requestId
          );
  
  
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
};

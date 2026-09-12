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
};

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
};

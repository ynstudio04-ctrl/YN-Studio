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


  // No existing vietnam-orders routes were found in the current server.js.
  // This module is intentionally ready for future routes.
};

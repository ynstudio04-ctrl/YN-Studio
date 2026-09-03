const db = require('../database');

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

function generateCustomerCode() {
  const random =
    Math.floor(
      100000 +
        Math.random() *
          900000
    );

  return `YN-${random}`;
}

function generateServiceCode() {
  const random =
    Math.floor(
      100000 +
        Math.random() *
          900000
    );

  return `SRV-${random}`;
}

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

module.exports = { generatePublicOrderNumber, generateCustomerCode, generateServiceCode, getToday, addDays, calculateNumberOfWeeks, calculateWeeklyInterest, createInterestSchedule, updateOverduePayments };

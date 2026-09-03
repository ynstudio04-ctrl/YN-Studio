import { useEffect, useMemo, useState } from "react";

import {
  Search,
  CreditCard,
  DollarSign,
  Plus,
  RefreshCw,
  AlertCircle,
  X,
  ArrowUpRight,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Loans() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState({});

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [paymentLoan, setPaymentLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  // =====================================================
  // LOAD CUSTOMERS
  // =====================================================

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/customers`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load customers"
        );
      }

      const data = await response.json();

      const customerList = Array.isArray(data)
        ? data
        : data.customers || [];

      setCustomers(customerList);

      await loadAllLoans(customerList);
    } catch (err) {
      console.error(
        "Failed to load customers:",
        err
      );

      setError(
        err.message ||
          "Failed to load loan information."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // LOAD LOANS
  // =====================================================

  async function loadAllLoans(customerList) {
    const result = {};

    await Promise.all(
      customerList.map(async (customer) => {
        try {
          const response = await fetch(
            `${API_URL}/loans/customer/${customer.id}`
          );

          /*
           * A customer may not have a loan.
           * That's not an error for this page.
           */
          if (!response.ok) {
            return;
          }

          const data = await response.json();

          /*
           * Support either:
           *
           * { ...loan }
           *
           * OR
           *
           * { loan: { ...loan } }
           */
          const loan = data?.loan || data;

          if (
            loan &&
            typeof loan === "object"
          ) {
            result[customer.id] = loan;
          }
        } catch (err) {
          console.error(
            `Failed to load loan for customer ${customer.id}:`,
            err
          );
        }
      })
    );

    setLoans(result);

    return result;
  }

  async function refresh() {
    await loadCustomers();
  }

  // =====================================================
  // ADD PAYMENT
  // =====================================================

  async function addPayment() {
    const amount = Number(
      paymentAmount
    );

    const remaining = Number(
      paymentLoan?.remaining || 0
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert(
        "Please enter a valid payment amount."
      );

      return;
    }

    if (amount > remaining) {
      alert(
        "Payment cannot be greater than the remaining balance."
      );

      return;
    }

    try {
      const customerId =
        paymentLoan.customer.id;

      const response = await fetch(
        `${API_URL}/loans/customer/${customerId}/payment`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            amount,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Failed to record payment."
        );

        return;
      }

      /*
       * Immediately update the UI.
       */
      const updatedLoan =
        data.loan || data;

      setLoans((previous) => ({
        ...previous,

        [customerId]: updatedLoan,
      }));

      setPaymentAmount("");
      setPaymentLoan(null);

      /*
       * Then sync with the database.
       */
      await loadAllLoans(customers);
    } catch (err) {
      console.error(
        "Failed to record payment:",
        err
      );

      alert(
        "Failed to record payment."
      );
    }
  }

  // =====================================================
  // DISABLE LOAN
  // =====================================================

  async function disableLoan(customerId) {
    const confirmed =
      window.confirm(
        "Disable the loan feature for this customer?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/loans/customer/${customerId}/disable`,
        {
          method: "PUT",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Failed to disable loan."
        );

        return;
      }

      setLoans((previous) => ({
        ...previous,

        [customerId]: {
          ...previous[customerId],

          enabled: false,
          status: "disabled",
        },
      }));

      await loadAllLoans(customers);
    } catch (err) {
      console.error(
        "Failed to disable loan:",
        err
      );

      alert(
        "Failed to disable loan."
      );
    }
  }

  // =====================================================
  // ACTIVE LOANS
  // =====================================================

  const activeLoans = useMemo(() => {
    return customers
      .map((customer) => ({
        customer,

        loan: loans[customer.id],
      }))
      .filter(({ loan }) => {
        if (!loan) {
          return false;
        }

        const remaining = Number(
          loan.remaining ??
            loan.principal_remaining ??
            0
        );

        const enabled =
          loan.enabled === true ||
          loan.enabled === 1 ||
          loan.status === "active";

        return (
          enabled &&
          remaining > 0
        );
      });
  }, [customers, loans]);

  // =====================================================
  // SEARCH
  // =====================================================

  const filteredLoans = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return activeLoans;
    }

    return activeLoans.filter(
      ({ customer }) => {
        const text = `
          ${customer.full_name || ""}
          ${customer.customer_code || ""}
          ${customer.phone || ""}
        `.toLowerCase();

        return text.includes(query);
      }
    );
  }, [activeLoans, search]);

  // =====================================================
  // SUMMARY
  // =====================================================

  const totalOutstanding =
    activeLoans.reduce(
      (total, item) =>
        total +
        Number(
          item.loan?.remaining ??
            item.loan?.principal_remaining ??
            0
        ),
      0
    );

  const totalLoanAmount =
    activeLoans.reduce(
      (total, item) =>
        total +
        Number(
          item.loan?.total_amount || 0
        ),
      0
    );

  const totalPaid =
    activeLoans.reduce(
      (total, item) =>
        total +
        Number(
          item.loan?.paid_amount || 0
        ),
      0
    );

  // =====================================================
  // MONEY
  // =====================================================

  function money(value) {
    return `$${Number(
      value || 0
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="loans-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="loans-header">

        <div>
          <p className="loans-eyebrow">
            FINANCE
          </p>

          <h1>
            Loans
          </h1>

          <p>
            Track customer loans, payments,
            and outstanding balances.
          </p>
        </div>

        <button
          className="loans-refresh-btn"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            className={
              loading
                ? "loans-spin"
                : ""
            }
          />

          Refresh
        </button>

      </div>


      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="loans-error">

          <AlertCircle size={16} />

          <span>
            {error}
          </span>

        </div>
      )}


      {/* =================================================
          SUMMARY
      ================================================= */}

      <div className="loans-summary">

        <div className="loans-summary-card">

          <div className="loans-summary-icon">
            <CreditCard size={18} />
          </div>

          <div>

            <span>
              Active Loans
            </span>

            <strong>
              {activeLoans.length}
            </strong>

          </div>

        </div>


        <div className="loans-summary-card">

          <div className="loans-summary-icon">
            <DollarSign size={18} />
          </div>

          <div>

            <span>
              Total Loaned
            </span>

            <strong>
              {money(totalLoanAmount)}
            </strong>

          </div>

        </div>


        <div className="loans-summary-card">

          <div className="loans-summary-icon">
            <ArrowUpRight size={18} />
          </div>

          <div>

            <span>
              Total Paid
            </span>

            <strong>
              {money(totalPaid)}
            </strong>

          </div>

        </div>


        <div className="loans-summary-card loans-outstanding-card">

          <div className="loans-summary-icon">
            <AlertCircle size={18} />
          </div>

          <div>

            <span>
              Outstanding
            </span>

            <strong>
              {money(totalOutstanding)}
            </strong>

          </div>

        </div>

      </div>


      {/* =================================================
          SEARCH
      ================================================= */}

      <div className="loans-search">

        <Search size={16} />

        <input
          type="text"
          placeholder="Search active loan customers..."
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
        />

        {search && (
          <button
            className="loans-clear-search"
            onClick={() =>
              setSearch("")
            }
          >
            <X size={14} />
          </button>
        )}

      </div>


      {/* =================================================
          CONTENT
      ================================================= */}

      {loading ? (

        <div className="loans-empty">

          <RefreshCw
            size={25}
            className="loans-spin"
          />

          <h3>
            Loading loans
          </h3>

          <p>
            Getting the latest customer
            loan information...
          </p>

        </div>

      ) : filteredLoans.length === 0 ? (

        <div className="loans-empty">

          <div className="loans-empty-icon">
            <CreditCard size={25} />
          </div>

          <h3>
            {search
              ? "No loans found"
              : "No active loans"}
          </h3>

          <p>
            {search
              ? "Try a different customer search."
              : "Enable a loan from a customer's profile and it will appear here."}
          </p>

          {!search && (
            <button
              className="loans-view-customers-btn"
              onClick={() =>
                navigate(
                  "/customers"
                )
              }
            >
              View Customers
            </button>
          )}

        </div>

      ) : (

        <div className="loans-list">

          {filteredLoans.map(
            ({ customer, loan }) => {

              const total =
                Number(
                  loan.total_amount || 0
                );

              const paid =
                Number(
                  loan.paid_amount || 0
                );

              const remaining =
                Number(
                  loan.remaining ??
                    loan.principal_remaining ??
                    0
                );

              const percentage =
                total > 0
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        (paid / total) *
                          100
                      )
                    )
                  : 0;

              const fullyPaid =
                remaining <= 0;

              return (

                <div
                  className="loans-card"
                  key={customer.id}
                >

                  {/* TOP */}

                  <div className="loans-card-top">

                    <div className="loans-customer">

                      <div className="loans-avatar">

                        {customer.full_name
                          ?.charAt(0)
                          .toUpperCase() ||
                          "?"}

                      </div>

                      <div>

                        <h3>
                          {customer.full_name}
                        </h3>

                        <p>
                          {customer.customer_code ||
                            "No customer code"}
                        </p>

                      </div>

                    </div>


                    <button
                      className="loans-profile-btn"
                      onClick={() =>
                        navigate(
                          `/customers/${customer.id}`
                        )
                      }
                    >
                      View Profile

                      <ArrowUpRight
                        size={13}
                      />
                    </button>

                  </div>


                  {/* VALUES */}

                  <div className="loans-values">

                    <div>

                      <span>
                        Original Loan
                      </span>

                      <strong>
                        {money(total)}
                      </strong>

                    </div>


                    <div>

                      <span>
                        Paid
                      </span>

                      <strong className="loans-paid">
                        {money(paid)}
                      </strong>

                    </div>


                    <div>

                      <span>
                        Remaining
                      </span>

                      <strong className="loans-remaining">
                        {money(remaining)}
                      </strong>

                    </div>

                  </div>


                  {/* PROGRESS */}

                  <div className="loans-progress-section">

                    <div className="loans-progress-label">

                      <span>
                        Payment Progress
                      </span>

                      <strong>
                        {percentage.toFixed(
                          0
                        )}
                        %
                      </strong>

                    </div>

                    <div className="loans-progress">

                      <div
                        className="loans-progress-bar"
                        style={{
                          width: `${percentage}%`,
                        }}
                      />

                    </div>

                  </div>


                  {/* ACTIONS */}

                  <div className="loans-actions">

                    <button
                      className="loans-payment-btn"
                      onClick={() =>
                        setPaymentLoan({
                          customer,
                          ...loan,
                          remaining,
                        })
                      }
                      disabled={fullyPaid}
                    >
                      <Plus size={15} />

                      {fullyPaid
                        ? "Fully Paid"
                        : "Add Payment"}
                    </button>


                    <button
                      className="loans-disable-btn"
                      onClick={() =>
                        disableLoan(
                          customer.id
                        )
                      }
                    >
                      Disable Loan
                    </button>

                  </div>

                </div>

              );
            }
          )}

        </div>

      )}


      {/* =================================================
          PAYMENT MODAL
      ================================================= */}

      {paymentLoan && (

        <div
          className="loans-modal-overlay"
          onClick={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              setPaymentLoan(null);
              setPaymentAmount("");
            }

          }}
        >

          <div className="loans-payment-modal">

            <button
              className="loans-modal-close"
              onClick={() => {
                setPaymentLoan(null);
                setPaymentAmount("");
              }}
              aria-label="Close"
            >
              <X size={17} />
            </button>


            <div className="loans-modal-icon">
              <DollarSign size={21} />
            </div>


            <p className="loans-eyebrow">
              LOAN PAYMENT
            </p>


            <h2>
              Add Payment
            </h2>


            <p className="loans-modal-customer">
              {paymentLoan.customer.full_name}
            </p>


            <div className="loans-modal-balance">

              <span>
                Remaining Balance
              </span>

              <strong>
                {money(
                  paymentLoan.remaining
                )}
              </strong>

            </div>


            <label>
              Payment Amount
            </label>


            <div className="loans-amount-input">

              <span>
                $
              </span>

              <input
                type="number"
                min="0.01"
                max={
                  paymentLoan.remaining
                }
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(event) =>
                  setPaymentAmount(
                    event.target.value
                  )
                }
                autoFocus
              />

            </div>


            <div className="loans-modal-actions">

              <button
                className="loans-cancel-btn"
                onClick={() => {
                  setPaymentLoan(null);
                  setPaymentAmount("");
                }}
              >
                Cancel
              </button>


              <button
                className="loans-confirm-btn"
                onClick={addPayment}
                disabled={
                  !paymentAmount ||
                  Number(paymentAmount) <=
                    0 ||
                  Number(paymentAmount) >
                    Number(
                      paymentLoan.remaining ||
                        0
                    )
                }
              >
                <DollarSign size={15} />

                Record Payment
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Loans;
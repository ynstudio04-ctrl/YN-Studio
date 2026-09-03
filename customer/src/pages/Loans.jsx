import { useEffect, useMemo, useState } from "react";
import {
  Search,
  CreditCard,
  DollarSign,
  Plus,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Loans() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [paymentLoan, setPaymentLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  // =====================================================
  // LOAD
  // =====================================================

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/customers`
      );

      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = await response.json();

      const customerList = Array.isArray(data)
        ? data
        : data.customers || [];

      setCustomers(customerList);

      await loadAllLoans(customerList);
    } catch (error) {
      console.error(
        "Failed to load customers:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadAllLoans(customerList) {
    const result = {};

    await Promise.all(
      customerList.map(async (customer) => {
        try {
          const response = await fetch(
            `${API_URL/loans/customer/${customer.id}`
          );

          if (!response.ok) {
            return;
          }

          const data = await response.json();

          result[customer.id] = data;
        } catch (error) {
          console.error(
            `Failed to load loan for customer ${customer.id}:`,
            error
          );
        }
      })
    );

    setLoans(result);
  }

  async function refresh() {
    await loadCustomers();
  }

  // =====================================================
  // ADD PAYMENT
  // =====================================================

  async function addPayment() {
    const amount = Number(paymentAmount);
    const remaining = Number(
      paymentLoan?.remaining || 0
    );

    if (!amount || amount <= 0) {
      alert("Please enter a valid payment amount.");
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
        `${API_URL/loans/customer/${customerId}/payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Failed to record payment."
        );
        return;
      }

      const updatedLoan = data.loan;

      setLoans((previous) => ({
        ...previous,
        [customerId]: updatedLoan,
      }));

      setPaymentAmount("");
      setPaymentLoan(null);

      // Refresh from server so everything is accurate.
      await loadAllLoans(customers);
    } catch (error) {
      console.error(
        "Failed to record payment:",
        error
      );

      alert("Failed to record payment.");
    }
  }

  // =====================================================
  // DISABLE LOAN
  // =====================================================

  async function disableLoan(customerId) {
    const confirmed = window.confirm(
      "Disable the loan feature for this customer?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL/loans/customer/${customerId}/disable`,
        {
          method: "PUT",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Failed to disable loan."
        );
        return;
      }

      // Mark it inactive immediately.
      setLoans((previous) => ({
        ...previous,
        [customerId]: {
          ...previous[customerId],
          enabled: false,
          status: "disabled",
        },
      }));

      // Refresh from server.
      await loadAllLoans(customers);
    } catch (error) {
      console.error(
        "Failed to disable loan:",
        error
      );

      alert("Failed to disable loan.");
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
          loan.remaining || 0
        );

        const enabled =
          loan.enabled === true ||
          loan.enabled === 1 ||
          loan.status === "active";

        return enabled && remaining > 0;
      });
  }, [customers, loans]);

  // =====================================================
  // SEARCH
  // =====================================================

  const filteredLoans = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

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
        Number(item.loan?.remaining || 0),
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
  // RENDER
  // =====================================================

  return (
    <div className="page-content">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="page-heading">
        <div>
          <p className="eyebrow">
            FINANCE
          </p>

          <h1>
            Loans
          </h1>

          <p>
            Manage customers who have
            loan access enabled.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={
              loading
                ? "spin"
                : ""
            }
          />

          Refresh
        </button>
      </div>

      {/* =================================================
          SUMMARY
      ================================================= */}

      <section className="loan-summary-grid">

        <div className="loan-summary-card">
          <div className="loan-summary-icon">
            <CreditCard size={21} />
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

        <div className="loan-summary-card">
          <div className="loan-summary-icon">
            <DollarSign size={21} />
          </div>

          <div>
            <span>
              Total Loaned
            </span>

            <strong>
              $
              {totalLoanAmount.toFixed(2)}
            </strong>
          </div>
        </div>

        <div className="loan-summary-card">
          <div className="loan-summary-icon">
            <AlertCircle size={21} />
          </div>

          <div>
            <span>
              Paid
            </span>

            <strong>
              $
              {totalPaid.toFixed(2)}
            </strong>
          </div>
        </div>

        <div className="loan-summary-card">
          <div className="loan-summary-icon">
            <AlertCircle size={21} />
          </div>

          <div>
            <span>
              Outstanding
            </span>

            <strong>
              $
              {totalOutstanding.toFixed(2)}
            </strong>
          </div>
        </div>

      </section>

      {/* =================================================
          SEARCH
      ================================================= */}

      <div className="loan-search">
        <Search size={18} />

        <input
          type="text"
          placeholder="Search active loan customers..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
        />
      </div>

      {/* =================================================
          CONTENT
      ================================================= */}

      {loading ? (
        <div className="loan-empty">
          <RefreshCw
            size={28}
            className="spin"
          />

          <h3>
            Loading loans...
          </h3>

          <p>
            Please wait while we load
            customer loans.
          </p>
        </div>

      ) : filteredLoans.length === 0 ? (

        <div className="loan-empty">
          <CreditCard size={32} />

          <h3>
            {search
              ? "No loans found"
              : "No active loans"}
          </h3>

          <p>
            {search
              ? "Try a different search."
              : "Enable a loan from a customer's profile and it will appear here."}
          </p>

          {!search && (
            <button
              className="secondary-button"
              onClick={() =>
                navigate("/customers")
              }
            >
              View Customers
            </button>
          )}
        </div>

      ) : (

        <div className="loan-list">

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
                        (paid / total) * 100
                      )
                    )
                  : 0;

              const fullyPaid =
                remaining <= 0;

              return (
                <div
                  className="loan-card"
                  key={customer.id}
                >

                  {/* CUSTOMER */}

                  <div className="loan-card-top">

                    <div className="loan-customer">

                      <div className="loan-avatar">
                        {customer.full_name
                          ?.charAt(0)
                          .toUpperCase() || "?"}
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
                      className="customer-link"
                      onClick={() =>
                        navigate(
                          `/customers/${customer.id}`
                        )
                      }
                    >
                      View Profile
                    </button>

                  </div>

                  {/* BALANCES */}

                  <div className="loan-values">

                    <div>
                      <span>
                        Original Loan
                      </span>

                      <strong>
                        $
                        {total.toFixed(2)}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Paid
                      </span>

                      <strong>
                        $
                        {paid.toFixed(2)}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Remaining
                      </span>

                      <strong className="loan-remaining">
                        $
                        {remaining.toFixed(2)}
                      </strong>
                    </div>

                  </div>

                  {/* PROGRESS */}

                  <div className="loan-progress-section">

                    <div className="loan-progress-label">

                      <span>
                        Payment Progress
                      </span>

                      <strong>
                        {percentage.toFixed(0)}%
                      </strong>

                    </div>

                    <div className="loan-progress">

                      <div
                        className="loan-progress-bar"
                        style={{
                          width:
                            `${percentage}%`,
                        }}
                      />

                    </div>

                  </div>

                  {/* ACTIONS */}

                  <div className="loan-actions">

                    <button
                      className="primary-button"
                      onClick={() =>
                        setPaymentLoan({
                          customer,
                          ...loan,
                          remaining,
                        })
                      }
                      disabled={fullyPaid}
                    >
                      <Plus size={17} />

                      {fullyPaid
                        ? "Fully Paid"
                        : "Add Payment"}
                    </button>

                    <button
                      className="secondary-button"
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
          className="modal-overlay"
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

          <div className="loan-payment-modal">

            <button
              className="modal-close"
              onClick={() => {
                setPaymentLoan(null);
                setPaymentAmount("");
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <div className="loan-modal-icon">
              <DollarSign size={24} />
            </div>

            <p className="eyebrow">
              LOAN PAYMENT
            </p>

            <h2>
              Add Payment
            </h2>

            <p className="loan-modal-customer">
              {paymentLoan.customer.full_name}
            </p>

            <div className="loan-modal-balance">

              <span>
                Remaining Balance
              </span>

              <strong>
                $
                {Number(
                  paymentLoan.remaining || 0
                ).toFixed(2)}
              </strong>

            </div>

            <label>
              Payment Amount
            </label>

            <div className="amount-input">

              <span>
                $
              </span>

              <input
                type="number"
                min="0.01"
                max={paymentLoan.remaining}
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

            <div className="loan-modal-actions">

              <button
                className="secondary-button"
                onClick={() => {
                  setPaymentLoan(null);
                  setPaymentAmount("");
                }}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                onClick={addPayment}
                disabled={
                  !paymentAmount ||
                  Number(paymentAmount) <= 0 ||
                  Number(paymentAmount) >
                    Number(
                      paymentLoan.remaining || 0
                    )
                }
              >
                <DollarSign size={17} />

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
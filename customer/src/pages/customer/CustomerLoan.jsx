import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  History,
  Loader2,
  RefreshCw,
  WalletCards,
  AlertCircle,
  Smartphone,
  Upload,
  ReceiptText,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_URL, getCustomerToken } from "../../lib/api";
import "./CustomerLoan.css";
import QRCode from "../../assets/QR.PNG";

function CustomerLoan() {
  const navigate = useNavigate();

  const [loan, setLoan] = useState(null);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("");
  const [proof, setProof] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(false);
  const fileInputRef = useRef(null);

  const token = getCustomerToken();

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token]
  );

  async function loadLoan(showRefresh = false) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      /*
       * The customer account already stores the customer ID.
       * We get it from /api/customer/me instead of asking
       * the customer to manually enter an ID.
       */

      const meResponse = await fetch(
        `${API_URL}/api/customer/me`,
        {
          headers,
        }
      );

      if (!meResponse.ok) {
        throw new Error("Unable to load customer account.");
      }

      const me = await meResponse.json();

      const customer =
        me?.customer ||
        me?.user ||
        me;

      const customerId =
        customer?.id ||
        customer?.customer_id;

      if (!customerId) {
        throw new Error("Customer account could not be identified.");
      }

      const [
        loanResponse,
        paymentsResponse,
        transactionsResponse,
        requestResponse,
      ] = await Promise.all([
          fetch(
            `${API_URL}/loans/customer/${customerId}`,
            {
              headers,
            }
          ),

          fetch(
            `${API_URL}/loans/customer/${customerId}/payments`,
            {
              headers,
            }
          ),

          fetch(
            `${API_URL}/loans/customer/${customerId}/transactions`,
            {
              headers,
            }
          ),

          fetch(
            `${API_URL}/loans/customer/${customerId}/payment-requests`,
            {
              headers,
            }
          ),
        ]);

      if (!loanResponse.ok) {
        throw new Error("Unable to load loan information.");
      }

      const loanData = await loanResponse.json();

      let paymentData = [];
      let transactionData = [];
      let requestData = [];

      if (paymentsResponse.ok) {
        paymentData = await paymentsResponse.json();
      }

      if (transactionsResponse.ok) {
        transactionData = await transactionsResponse.json();
      }

      if (requestResponse.ok) {
        requestData = await requestResponse.json();
      }

      setLoan(loanData || null);
      setPayments(
        Array.isArray(paymentData)
          ? paymentData
          : []
      );
      setTransactions(
        Array.isArray(transactionData)
          ? transactionData
          : []
      );

      const requests =
        Array.isArray(requestData)
          ? requestData
          : [];

      setPaymentRequests(requests);
      setPendingRequest(
        requests.some(
          (request) =>
            request.status === "pending"
        )
      );
    } catch (err) {
      console.error("Customer loan error:", err);
      setError(
        err.message ||
          "Unable to load your loan."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
  if (!token) {
    navigate("/login", { replace: true });
    return;
  }

  loadLoan();
}, []);

  function openPaymentModal() {
    setPaymentAmount("");
    setPaymentMethod("");
    setProof(null);
    setPaymentError("");
    setPaymentSuccess("");
    setShowPaymentModal(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function closePaymentModal() {
    if (paying) return;
    setShowPaymentModal(false);
    setPaymentAmount("");
    setPaymentMethod("");
    setProof(null);
    setPaymentError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function submitPaymentRequest(event) {
    event.preventDefault();

    setPaymentError("");
    setPaymentSuccess("");

    const amount = Number(paymentAmount);

    const remaining = Number(
      loan?.remaining ??
        loan?.principal_remaining ??
        loan?.remaining_balance ??
        0
    );

    if (!amount || amount <= 0) {
      setPaymentError("Please enter a valid payment amount.");
      return;
    }

    if (amount > remaining) {
      setPaymentError(
        "Payment cannot be greater than your remaining balance."
      );
      return;
    }

    if (!paymentMethod) {
      setPaymentError("Please select a payment method.");
      return;
    }

    if (!proof) {
      setPaymentError("Please upload your payment receipt.");
      return;
    }

    if (pendingRequest) {
      setPaymentError(
        "You already have a payment waiting for approval."
      );
      return;
    }

    try {
      setPaying(true);

      const customerId = loan?.customer_id;

      if (!customerId) {
        throw new Error("Customer account could not be identified.");
      }

      const formData = new FormData();
      formData.append("amount", String(amount));
      formData.append("payment_method", paymentMethod);
      formData.append("payment_proof", proof);

      const response = await fetch(
        `${API_URL}/loans/customer/${customerId}/payment-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Payment request failed."
        );
      }

      setPaymentSuccess(
        "Payment submitted. Your loan balance will update after approval."
      );

      // Reload the authoritative records so the receipt, timestamp and status
      // shown in Payment History are exactly what was saved by the server.
      await loadLoan(true);

      setPaymentAmount("");
      setPaymentMethod("");
      setProof(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setTimeout(() => {
        setShowPaymentModal(false);
        setPaymentSuccess("");
      }, 900);
    } catch (err) {
      console.error("Loan payment request error:", err);
      setPaymentError(
        err.message || "Unable to submit payment."
      );
    } finally {
      setPaying(false);
    }
  }

  function formatMoney(value) {
    const amount = Number(value || 0);

    return `$${amount.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  }

  function getPaymentStatusClass(status) {
    if (status === "paid") {
      return "loan-status-paid";
    }

    if (status === "overdue") {
      return "loan-status-overdue";
    }

    if (status === "cancelled") {
      return "loan-status-cancelled";
    }

    return "loan-status-due";
  }

  if (loading) {
    return (
      <div className="customer-loan-page">
        <div className="loan-loading">
          <Loader2
            size={28}
            className="loan-spinner"
          />

          <p>
            Loading your loan...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-loan-page">
        <div className="loan-header">
          <button
            className="loan-back-button"
            onClick={() =>
              navigate("/home")
            }
          >
            <ArrowLeft size={19} />
          </button>

          <div>
            <span>
              YN STUDIO
            </span>

            <h1>
              My Loan
            </h1>
          </div>
        </div>

        <div className="loan-error-card">
          <AlertCircle size={30} />

          <h2>
            Unable to load loan
          </h2>

          <p>
            {error}
          </p>

          <button
            className="loan-primary-button"
            onClick={() =>
              loadLoan(true)
            }
          >
            <RefreshCw size={17} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /*
   * IMPORTANT:
   * If admin hasn't assigned/enabled a loan,
   * don't show payment controls.
   */

  const remaining = Number(
    loan?.remaining ??
      loan?.principal_remaining ??
      loan?.remaining_balance ??
      0
  );

  const total = Number(
    loan?.total_amount || 0
  );

  const paid = Number(
    loan?.paid_amount || 0
  );

  const enabled =
    loan?.enabled === true ||
    loan?.enabled === 1 ||
    loan?.status === "active";

  const paidOff =
    loan?.is_paid_off === true ||
    loan?.status === "paid_off" ||
    remaining <= 0;

  if (!enabled && !paidOff) {
    return (
      <div className="customer-loan-page">
        <div className="loan-header">
          <button
            className="loan-back-button"
            onClick={() =>
              navigate("/home")
            }
          >
            <ArrowLeft size={19} />
          </button>

          <div>
            <span>
              YN STUDIO
            </span>

            <h1>
              My Loan
            </h1>
          </div>

          <button
            className="loan-refresh-button"
            onClick={() =>
              loadLoan(true)
            }
            disabled={refreshing}
          >
            <RefreshCw
              size={18}
              className={
                refreshing
                  ? "loan-spinner"
                  : ""
              }
            />
          </button>
        </div>

        <div className="loan-empty-card">
          <div className="loan-empty-icon">
            <CreditCard size={30} />
          </div>

          <h2>
            No active loan
          </h2>

          <p>
            You currently don't have a loan
            assigned to your account.
          </p>

          <button
            className="loan-secondary-button"
            onClick={() =>
              navigate("/home")
            }
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const progress =
    total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (paid / total) * 100
          )
        )
      : 0;

  return (
    <div className="customer-loan-page">

      {/* HEADER */}

      <div className="loan-header">
        <button
          className="loan-back-button"
          onClick={() =>
            navigate("/home")
          }
        >
          <ArrowLeft size={19} />
        </button>

        <div>
          <span>
            YN STUDIO
          </span>

          <h1>
            My Loan
          </h1>
        </div>

        <button
          className="loan-refresh-button"
          onClick={() =>
            loadLoan(true)
          }
          disabled={refreshing}
        >
          <RefreshCw
            size={18}
            className={
              refreshing
                ? "loan-spinner"
                : ""
            }
          />
        </button>
      </div>

      {/* MAIN BALANCE */}

      <section className="loan-balance-card">

        <div className="loan-balance-top">
          <div>
            <span>
              Remaining balance
            </span>

            <strong>
              {formatMoney(remaining)}
            </strong>
          </div>

          <div className="loan-wallet-icon">
            <WalletCards size={25} />
          </div>
        </div>

        <div className="loan-progress">
          <div
            className="loan-progress-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="loan-progress-labels">
          <span>
            {formatMoney(paid)} paid
          </span>

          <span>
            {Math.round(progress)}%
          </span>
        </div>
      </section>

      {/* STATUS */}

      {paidOff ? (
        <div className="loan-complete-card">
          <CheckCircle2 size={22} />

          <div>
            <strong>
              Loan paid off
            </strong>

            <p>
              Your loan has been fully paid.
            </p>
          </div>
        </div>
      ) : (
        <div className="loan-active-card">
          <div className="loan-active-dot" />

          <div>
            <strong>
              Active loan
            </strong>

            <p>
              You have {formatMoney(remaining)}
              {" "}remaining.
            </p>
          </div>
        </div>
      )}

      {/* LOAN DETAILS */}

      <section className="loan-section">

        <div className="loan-section-title">
          <CreditCard size={19} />

          <h2>
            Loan details
          </h2>
        </div>

        <div className="loan-details-grid">

          <div className="loan-detail">
            <span>
              Original amount
            </span>

            <strong>
              {formatMoney(total)}
            </strong>
          </div>

          <div className="loan-detail">
            <span>
              Paid
            </span>

            <strong>
              {formatMoney(paid)}
            </strong>
          </div>

          <div className="loan-detail">
            <span>
              Interest
            </span>

            <strong>
              {loan?.interest_type === "percentage"
                ? `${loan?.interest_value || 0}%`
                : formatMoney(
                    loan?.interest_value || 0
                  )}
            </strong>
          </div>

          <div className="loan-detail">
            <span>
              Start date
            </span>

            <strong>
              {formatDate(
                loan?.start_date
              )}
            </strong>
          </div>

          <div className="loan-detail">
            <span>
              End date
            </span>

            <strong>
              {formatDate(
                loan?.end_date
              )}
            </strong>
          </div>

          <div className="loan-detail">
            <span>
              Status
            </span>

            <strong className="loan-detail-status">
              {paidOff
                ? "Paid off"
                : "Active"}
            </strong>
          </div>

        </div>
      </section>

      {/* PAYMENT */}

      {!paidOff && (
        <section className="loan-payment-card">
          <div className="loan-section-title">
            <CreditCard size={19} />
            <h2>Make a payment</h2>
          </div>

          <p className="loan-payment-description">
            Choose how you want to pay, send your receipt, and wait for approval.
            Your balance will not change until the payment is approved.
          </p>

          {pendingRequest && (
            <div className="loan-message loan-message-pending">
              <Clock3 size={16} />
              A payment is currently waiting for approval.
            </div>
          )}

          <button
            type="button"
            className="loan-primary-button loan-pay-button"
            onClick={openPaymentModal}
            disabled={pendingRequest}
          >
            <CreditCard size={18} />
            {pendingRequest ? "Payment Pending Approval" : "Make a payment"}
          </button>
        </section>
      )}

      {showPaymentModal && !paidOff && (
        <div
          className="loan-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePaymentModal();
            }
          }}
        >
          <section className="loan-payment-modal">
            <div className="loan-modal-header">
              <div>
                <span>LOAN PAYMENT</span>
                <h2>Submit a payment</h2>
                <p>Your balance changes only after approval.</p>
              </div>

              <button
                type="button"
                className="loan-modal-close"
                onClick={closePaymentModal}
                disabled={paying}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={submitPaymentRequest}>
              <label className="loan-form-label">Amount</label>

              <div className="loan-input-wrap">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  max={remaining}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) =>
                    setPaymentAmount(event.target.value)
                  }
                  placeholder="0.00"
                  disabled={paying}
                />
              </div>

              <label className="loan-form-label">Payment method</label>

              <div className="loan-payment-methods">
                <button
                  type="button"
                  className={`loan-method-option ${
                    paymentMethod === "qr" ? "selected" : ""
                  }`}
                  onClick={() => setPaymentMethod("qr")}
                  disabled={paying}
                >
                  <Smartphone size={19} />
                  <span>QR Payment</span>
                  {paymentMethod === "qr" && <CheckCircle2 size={16} />}
                </button>

                <button
                  type="button"
                  className={`loan-method-option ${
                    paymentMethod === "bank" ? "selected" : ""
                  }`}
                  onClick={() => setPaymentMethod("bank")}
                  disabled={paying}
                >
                  <CreditCard size={19} />
                  <span>Bank Transfer</span>
                  {paymentMethod === "bank" && <CheckCircle2 size={16} />}
                </button>
              </div>

              {paymentMethod === "qr" && (
                <div className="loan-qr-section">
                  <div className="loan-qr-title">
                    <Smartphone size={18} />
                    <div>
                      <strong>Scan to Pay</strong>
                      <span>Use your banking app to complete the payment.</span>
                    </div>
                  </div>

                  <div className="loan-qr-card">
                    <img
                      src={QRCode}
                      alt="YN Studio payment QR code"
                    />
                  </div>

                  <p>
                    Complete the payment, then upload the receipt below.
                  </p>
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="loan-bank-notice">
                  <CreditCard size={18} />
                  <p>
                    Transfer the amount using your agreed bank account, then
                    upload the transfer receipt below.
                  </p>
                </div>
              )}

              <label className="loan-form-label">Payment receipt</label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="loan-hidden-file"
                onChange={(event) => setProof(event.target.files?.[0] || null)}
                disabled={paying}
              />

              {!proof ? (
                <button
                  type="button"
                  className="loan-upload-box"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={paying}
                >
                  <Upload size={20} />
                  <strong>Upload receipt</strong>
                  <span>JPG, PNG, WEBP or PDF</span>
                </button>
              ) : (
                <div className="loan-file-preview">
                  <ReceiptText size={20} />
                  <div>
                    <strong>{proof.name}</strong>
                    <span>{(proof.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProof(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    disabled={paying}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {paymentError && (
                <div className="loan-message loan-message-error">
                  <AlertCircle size={16} />
                  {paymentError}
                </div>
              )}

              {paymentSuccess && (
                <div className="loan-message loan-message-success">
                  <CheckCircle2 size={16} />
                  {paymentSuccess}
                </div>
              )}

              <div className="loan-modal-actions">
                <button
                  type="button"
                  className="loan-secondary-button"
                  onClick={closePaymentModal}
                  disabled={paying}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="loan-primary-button"
                  disabled={paying || !paymentAmount || !paymentMethod || !proof}
                >
                  {paying ? (
                    <>
                      <Loader2 size={18} className="loan-spinner" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Submit for approval
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* WEEKLY INTEREST */}

      {payments.length > 0 && (
        <section className="loan-section">

          <div className="loan-section-title">
            <CalendarDays size={19} />

            <h2>
              Payment schedule
            </h2>
          </div>

          <div className="loan-payment-list">
            {payments.map(
              (payment) => (
                <div
                  className="loan-scheduled-payment"
                  key={payment.id}
                >
                  <div className="loan-payment-main">
                    <strong>
                      {formatMoney(
                        payment.amount
                      )}
                    </strong>

                    <span>
                      Due{" "}
                      {formatDate(
                        payment.due_date
                      )}
                    </span>
                  </div>

                  <span
                    className={`loan-status-pill ${getPaymentStatusClass(
                      payment.status
                    )}`}
                  >
                    {payment.status}
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* TRANSACTION HISTORY */}

      <section className="loan-section">

        <div className="loan-section-title">
          <History size={19} />

          <h2>
            Payment history
          </h2>
        </div>

        {transactions.length === 0 && paymentRequests.length === 0 ? (
          <div className="loan-no-history">
            <Clock3 size={20} />
            <p>No loan payments yet.</p>
          </div>
        ) : (
          <div className="loan-transaction-list">
            {paymentRequests.map((request) => (
              <div className="loan-transaction" key={`receipt-${request.id}`}>
                <div className="loan-transaction-icon"><ReceiptText size={18} /></div>
                <div className="loan-transaction-info">
                  <strong>Payment receipt — {formatMoney(request.amount)}</strong>
                  <span>{String(request.status || "pending").replaceAll("_", " ")}</span>
                  <small>{formatDate(request.created_at)}</small>
                </div>
                <span className={`loan-status-pill ${getPaymentStatusClass(request.status)}`}>{request.status}</span>
              </div>
            ))}
            {transactions.map(
              (transaction) => (
                <div
                  className="loan-transaction"
                  key={transaction.id}
                >
                  <div className="loan-transaction-icon">
                    <CheckCircle2
                      size={18}
                    />
                  </div>

                  <div className="loan-transaction-info">
                    <strong>
                      {transaction.description ||
                        "Loan payment"}
                    </strong>

                    <span>
                      {formatDate(
                        transaction.created_at
                      )}
                    </span>
                  </div>

                  <strong className="loan-transaction-amount">
                    -{formatMoney(
                      transaction.amount
                    )}
                  </strong>
                </div>
              )
            )}
          </div>
        )}
      </section>

    </div>
  );
}

export default CustomerLoan;
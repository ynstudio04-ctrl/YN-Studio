import { useEffect, useMemo, useState } from "react";

import {
  CreditCard,
  Check,
  X,
  Clock,
  Wallet,
  Eye,
  RefreshCw,
  FileText,
  ExternalLink,
  ShoppingBag,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  useEffect(() => {
    loadPayments();

    // New customer receipts should appear on the admin side without a manual reload.
    const interval = window.setInterval(() => loadPayments(true), 5000);
    const onFocus = () => loadPayments(true);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function loadPayments(isRefresh = false) {
    try {
      if (!isRefresh) setLoading(true);
      setError("");

      let orderPayments = [];
      let walletPayments = [];
      let loanPayments = [];
      let savingPayments = [];

      /*
      =====================================================
      ORDER PAYMENTS
      =====================================================
      */

      try {
        const response = await fetch(
          `${API_URL}/admin/order-payments`
        );

        const data = await response.json();

        console.log(
          "ORDER PAYMENTS RESPONSE:",
          data
        );

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Failed to load order payments"
          );
        }

        if (Array.isArray(data)) {
          orderPayments = data.map((payment) => ({
            ...payment,

            payment_type: "order",

            type: "Order Payment",

            source_id:
              payment.order_id ??
              payment.id,

            status:
              payment.status === "submitted"
                ? "pending"
                : payment.status ||
                  "pending",

            receipt: null,

            submitted_at:
              payment.submitted_at ||
              payment.payment_submitted_at ||
              payment.created_at ||
              null,

            amount: Number(
              payment.amount ??
                payment.payment_amount ??
                payment.total ??
                0
            ),
          }));
        }
      } catch (orderError) {
        console.error(
          "ORDER PAYMENTS LOAD ERROR:",
          orderError
        );
      }

      /*
      =====================================================
      WALLET DEPOSITS
      =====================================================
      */

      try {
        const response = await fetch(
          `${API_URL}/admin/wallet/payments`
        );

        const data = await response.json();

        console.log(
          "WALLET PAYMENTS RESPONSE:",
          data
        );

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Failed to load wallet payments"
          );
        }

        if (Array.isArray(data)) {
          walletPayments = data.map((payment) => ({
            ...payment,

            payment_type: "wallet",

            type: "Wallet Deposit",

            source_id: payment.id,

            status:
              payment.status ||
              "pending",

            receipt: null,

            submitted_at:
              payment.submitted_at ||
              payment.created_at ||
              null,

            amount: Number(
              payment.amount || 0
            ),
          }));
        }
      } catch (walletError) {
        console.error(
          "WALLET PAYMENTS LOAD ERROR:",
          walletError
        );
      }

      /*
      =====================================================
      LOAN PAYMENTS
      =====================================================
      */

      try {
        const response = await fetch(
          `${API_URL}/admin/loan-payments`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Failed to load loan payments"
          );
        }

        const loanRows = Array.isArray(data)
          ? data
          : Array.isArray(data?.payments)
          ? data.payments
          : [];

        if (loanRows.length) {
          loanPayments = loanRows.map((payment) => ({
            ...payment,
            payment_type: "loan",
            type: "Loan Payment",
            source_id: payment.id,
            status: payment.status || "pending",
            receipt: null,
            submitted_at:
              payment.created_at || null,
            amount: Number(payment.amount || 0),
          }));
        }
      } catch (loanError) {
        console.error(
          "LOAN PAYMENTS LOAD ERROR:",
          loanError
        );
      }

      /*
      =====================================================
      SAVINGS PAYMENTS
      =====================================================
      */
      try {
        const token = localStorage.getItem("yn_token");
        const response = await fetch(`${API_URL}/admin/savings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || "Failed to load saving payments");
        if (Array.isArray(data?.payments)) {
          savingPayments = data.payments.map((payment) => ({
            ...payment,
            payment_type: "savings",
            type: "Savings Payment",
            source_id: payment.id,
            status: payment.status || "pending",
            submitted_at: payment.created_at || null,
            amount: Number(payment.amount || 0),
            receipt: payment.payment_image || null,
          }));
        }
      } catch (savingError) {
        console.error("SAVINGS PAYMENTS LOAD ERROR:", savingError);
      }

      /*
      =====================================================
      COMBINE
      =====================================================
      */

      const combined = [
        ...orderPayments,
        ...walletPayments,
        ...loanPayments,
        ...savingPayments,
      ];

      /*
      =====================================================
      SORT NEWEST FIRST
      =====================================================
      */

      combined.sort((a, b) => {
        const dateA = new Date(
          a.submitted_at ||
            a.created_at ||
            a.payment_submitted_at ||
            0
        ).getTime();

        const dateB = new Date(
          b.submitted_at ||
            b.created_at ||
            b.payment_submitted_at ||
            0
        ).getTime();

        return dateB - dateA;
      });

      console.log(
        "COMBINED PAYMENTS:",
        combined
      );

      setPayments(combined);

      if (
        orderPayments.length === 0 &&
        walletPayments.length === 0 &&
        loanPayments.length === 0 &&
        savingPayments.length === 0
      ) {
        setError(
          "No payments were returned from the server."
        );
      }
    } catch (error) {
      console.error(
        "LOAD PAYMENTS ERROR:",
        error
      );

      setError(
        error.message ||
          "Failed to load payments."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
  =========================================================
  STATUS
  =========================================================
  */

  function normalizeStatus(payment) {
    const status = String(
      payment.status || ""
    ).toLowerCase();

    if (status === "submitted") {
      return "pending";
    }

    return status || "pending";
  }

  /*
  =========================================================
  PAYMENT TYPE
  =========================================================
  */

  function isWalletDeposit(payment) {
    return (
      payment.payment_type ===
      "wallet"
    );
  }

  function isOrderPayment(payment) {
    return (
      payment.payment_type ===
      "order"
    );
  }

  function isLoanPayment(payment) {
    return payment.payment_type === "loan";
  }

  function isSavingsPayment(payment) {
    return payment.payment_type === "savings";
  }

  /*
  =========================================================
  APPROVE
  =========================================================
  */

  async function approvePayment(payment) {
    const isWallet =
      isWalletDeposit(payment);

    const isLoan =
      isLoanPayment(payment);

    const isSavings =
      isSavingsPayment(payment);

    const confirmed = window.confirm(
      isWallet
        ? "Approve this wallet deposit? The customer's wallet balance will increase."
        : isLoan
        ? "Approve this loan payment? The customer's loan balance will decrease."
        : isSavings
        ? "Approve this savings payment? The amount will be added to the customer's saving goal."
        : "Approve this order payment?"
    );

    if (!confirmed) {
      return;
    }

    const processingKey =
      `${payment.payment_type}-${payment.source_id}`;

    try {
      setProcessingId(
        processingKey
      );

      let url;

      if (isWallet) {
        url =
          `${API_URL}/admin/wallet/payments/${payment.source_id}/approve`;
      } else if (isLoan) {
        url =
          `${API_URL}/admin/loan-payments/${payment.source_id}/approve`;
      } else if (isSavings) {
        url =
          `${API_URL}/admin/savings/payments/${payment.source_id}/approve`;
      } else {
        url =
          `${API_URL}/admin/order-payments/${payment.source_id}/approve`;
      }

      console.log(
        "APPROVING PAYMENT:",
        {
          type:
            payment.payment_type,
          id:
            payment.source_id,
          url,
        }
      );

      const token = localStorage.getItem("yn_token");
      const response =
        await fetch(url, {
          method: "PUT",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Failed to approve payment"
        );
      }

      await loadPayments();

      if (isWallet) {
        alert(
          `Wallet deposit approved!\n\nCustomer balance: $${Number(
            data.balance || 0
          ).toFixed(2)}`
        );
      } else if (isLoan) {
        alert(
          "Loan payment approved. The customer's loan balance was updated."
        );
      } else if (isSavings) {
        alert(
          "Savings payment approved. The customer's saving balance was updated."
        );
      } else {
        alert(
          "Order payment approved successfully."
        );
      }
    } catch (error) {
      console.error(
        "APPROVE PAYMENT ERROR:",
        error
      );

      alert(
        error.message ||
          "Unable to approve payment."
      );
    } finally {
      setProcessingId(null);
    }
  }

  /*
  =========================================================
  REJECT
  =========================================================
  */

  async function rejectPayment(payment) {
    const isWallet =
      isWalletDeposit(payment);

    const isLoan =
      isLoanPayment(payment);

    const isSavings =
      isSavingsPayment(payment);

    const confirmed = window.confirm(
      isWallet
        ? "Reject this wallet deposit?"
        : isLoan
        ? "Reject this loan payment?"
        : isSavings
        ? "Reject this savings payment?"
        : "Reject this order payment?"
    );

    if (!confirmed) {
      return;
    }

    const processingKey =
      `${payment.payment_type}-${payment.source_id}`;

    try {
      setProcessingId(
        processingKey
      );

      let url;

      if (isWallet) {
        url =
          `${API_URL}/admin/wallet/payments/${payment.source_id}/reject`;
      } else if (isLoan) {
        url =
          `${API_URL}/admin/loan-payments/${payment.source_id}/reject`;
      } else if (isSavings) {
        url =
          `${API_URL}/admin/savings/payments/${payment.source_id}/reject`;
      } else {
        url =
          `${API_URL}/admin/order-payments/${payment.source_id}/reject`;
      }

      console.log(
        "REJECTING PAYMENT:",
        {
          type:
            payment.payment_type,
          id:
            payment.source_id,
          url,
        }
      );

      const token = localStorage.getItem("yn_token");
      const response =
        await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ admin_note: null }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Failed to reject payment"
        );
      }

      await loadPayments();

      alert(
        isWallet
          ? "Wallet deposit rejected."
          : isLoan
          ? "Loan payment rejected."
          : "Order payment rejected."
      );
    } catch (error) {
      console.error(
        "REJECT PAYMENT ERROR:",
        error
      );

      alert(
        error.message ||
          "Unable to reject payment."
      );
    } finally {
      setProcessingId(null);
    }
  }

  /*
  =========================================================
  DATE
  =========================================================
  */

  function getDate(payment) {
    return (
      payment.submitted_at ||
      payment.payment_submitted_at ||
      payment.created_at ||
      payment.date ||
      null
    );
  }

  function formatDate(date) {
    if (!date) {
      return "Unknown date";
    }

    const parsed =
      new Date(date);

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return String(date);
    }

    return parsed.toLocaleString(
      "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  /*
  =========================================================
  CUSTOMER
  =========================================================
  */

  function getCustomerName(payment) {
    return (
      payment.full_name ||
      payment.customer_name ||
      "Unknown Customer"
    );
  }

  function getCustomerCode(payment) {
    return (
      payment.customer_code ||
      payment.customer_id ||
      "—"
    );
  }

  /*
  =========================================================
  AMOUNT
  =========================================================
  */

  function getAmount(payment) {
    return Number(
      payment.amount ??
        payment.payment_amount ??
        payment.total ??
        0
    );
  }

  /*
  =========================================================
  RECEIPT
  =========================================================
  */

  function getReceipt(payment) {
    return (
      payment.receipt ||
      payment.payment_receipt ||
      payment.payment_image ||
      payment.proof ||
      payment.payment_proof ||
      null
    );
  }

  async function openReceipt(payment) {
    try {
      const existing = getReceipt(payment);
      if (existing) {
        setSelectedReceipt({ ...payment, receipt: existing });
        return;
      }

      let endpoint;
      if (isWalletDeposit(payment)) {
        endpoint = `${API_URL}/admin/wallet/payments/${payment.source_id}/proof`;
      } else if (isLoanPayment(payment)) {
        endpoint = `${API_URL}/admin/loan-payments/${payment.source_id}/proof`;
      } else {
        endpoint = `${API_URL}/admin/order-payments/${payment.source_id}/proof`;
      }

      const response = await fetch(endpoint);
      const data = await response.json();

      if (!response.ok || !data.receipt) {
        throw new Error(data.error || "This payment does not have a receipt.");
      }

      setSelectedReceipt({
        ...payment,
        receipt: data.receipt,
      });
    } catch (error) {
      console.error("LOAD PAYMENT PROOF ERROR:", error);
      alert(error.message || "Unable to load payment proof.");
    }
  }

  function closeReceipt() {
    setSelectedReceipt(null);
  }

  function isPdf(receipt) {
    if (!receipt) {
      return false;
    }

    const value =
      String(receipt).toLowerCase();

    return (
      value.startsWith(
        "data:application/pdf"
      ) ||
      value.includes(".pdf")
    );
  }

  /*
  =========================================================
  FILTERS
  =========================================================
  */

  const pending = useMemo(
    () =>
      payments.filter(
        (payment) =>
          normalizeStatus(
            payment
          ) === "pending"
      ),
    [payments]
  );

  const completed = useMemo(
    () =>
      payments.filter(
        (payment) =>
          normalizeStatus(
            payment
          ) !== "pending"
      ),
    [payments]
  );

  const pendingOrders = useMemo(
    () =>
      pending.filter(
        (payment) =>
          isOrderPayment(payment)
      ),
    [pending]
  );

  const pendingWallets = useMemo(
    () =>
      pending.filter(
        (payment) =>
          isWalletDeposit(payment)
      ),
    [pending]
  );

  const orderPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          isOrderPayment(payment)
      ),
    [payments]
  );

  const walletDeposits = useMemo(
    () =>
      payments.filter(
        (payment) =>
          isWalletDeposit(payment)
      ),
    [payments]
  );

  /*
  =========================================================
  PAYMENT CARD
  =========================================================
  */

  function PaymentCard({
    payment,
    history = false,
  }) {
    const wallet =
      isWalletDeposit(payment);

    const order =
      isOrderPayment(payment);

    const loanPayment =
      isLoanPayment(payment);

    const status =
      normalizeStatus(payment);

    const amount =
      getAmount(payment);

    const receipt =
      getReceipt(payment);

    const processingKey =
      `${payment.payment_type}-${payment.source_id}`;

    const isProcessing =
      processingId ===
      processingKey;

    return (
      <div
        className={`payment-card ${
          wallet
            ? "wallet-payment-card"
            : loanPayment
            ? "loan-payment-card"
            : "order-payment-card"
        }`}
      >
        {/* ICON */}

        <div
          className={`payment-icon ${
            wallet
              ? "wallet-payment-icon"
              : loanPayment
              ? "loan-payment-icon"
              : "order-payment-icon"
          }`}
        >
          {wallet ? (
            <Wallet size={22} />
          ) : loanPayment ? (
            <CreditCard size={22} />
          ) : (
            <ShoppingBag size={22} />
          )}
        </div>

        {/* MAIN */}

        <div className="payment-main">
          <h3>
            {getCustomerName(
              payment
            )}
          </h3>

          <p>
            Customer ID:{" "}
            {getCustomerCode(
              payment
            )}
          </p>

          <span className="payment-type-label">
            {wallet ? (
              <>
                <Wallet size={13} />
                Wallet Deposit
              </>
            ) : loanPayment ? (
              <>
                <CreditCard size={13} />
                Loan Payment
              </>
            ) : (
              <>
                <ShoppingBag size={13} />
                Order Payment
              </>
            )}
          </span>

          {order &&
            payment.order_number && (
              <small>
                Order #
                {
                  payment.order_number
                }
              </small>
            )}

          {getDate(payment) && (
            <small>
              Submitted:{" "}
              {formatDate(
                getDate(payment)
              )}
            </small>
          )}
        </div>

        {/* AMOUNT */}

        <div className="payment-amount">
          <strong>
            ${amount.toFixed(2)}
          </strong>

          <small
            className={`status-${status}`}
          >
            {status}
          </small>
        </div>

        {/* RECEIPT */}

        <div className="payment-receipt">
          {receipt ? (
            <button
              type="button"
              className="receipt-view-button"
              onClick={() =>
                openReceipt(
                  payment
                )
              }
            >
              <Eye size={17} />

              <span>
                View Proof
              </span>
            </button>
          ) : (
            <span className="receipt-missing">
              No proof
            </span>
          )}
        </div>

        {/* ACTIONS */}

        {!history &&
          status === "pending" && (
            <div className="payment-actions">
              <button
                type="button"
                className="approve-button"
                disabled={
                  isProcessing
                }
                onClick={() =>
                  approvePayment(
                    payment
                  )
                }
              >
                <Check size={17} />

                {isProcessing
                  ? "Processing..."
                  : "Approve"}
              </button>

              <button
                type="button"
                className="reject-button"
                disabled={
                  isProcessing
                }
                onClick={() =>
                  rejectPayment(
                    payment
                  )
                }
              >
                <X size={17} />

                Reject
              </button>
            </div>
          )}
      </div>
    );
  }

  /*
  =========================================================
  PAGE
  =========================================================
  */

  return (
    <div className="page-content">

      {/* HEADER */}

      <div className="page-heading">
        <div>
          <p className="eyebrow">
            FINANCE
          </p>

          <h1>
            Payments
          </h1>

          <p>
            Review order payments, wallet deposits,
            and customer loan payments.
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={loadPayments}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={
              loading
                ? "refresh-spinning"
                : ""
            }
          />

          Refresh
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="payment-error">
          {error}
        </div>
      )}

      {/* SUMMARY */}

      <div className="payment-summary-grid">

        {/* PENDING */}

        <div className="payment-summary-card">
          <div className="payment-summary-icon">
            <Clock size={20} />
          </div>

          <div>
            <span>
              Pending
            </span>

            <strong>
              {pending.length}
            </strong>
          </div>
        </div>

        {/* ORDER */}

        <div className="payment-summary-card">
          <div className="payment-summary-icon">
            <ShoppingBag size={20} />
          </div>

          <div>
            <span>
              Order Payments
            </span>

            <strong>
              {pendingOrders.length}
            </strong>
          </div>
        </div>

        {/* WALLET */}

        <div className="payment-summary-card">
          <div className="payment-summary-icon">
            <Wallet size={20} />
          </div>

          <div>
            <span>
              Wallet Deposits
            </span>

            <strong>
              {pendingWallets.length}
            </strong>
          </div>
        </div>

      </div>

      {/* PENDING PAYMENTS */}

      <section className="payments-section">

        <div className="section-heading">
          <div>
            <h2>
              Pending Payments
            </h2>

            <p>
              Payments waiting for
              approval.
            </p>
          </div>

          <div className="pending-badge">
            <Clock size={16} />
            {pending.length}
          </div>
        </div>

        {loading ? (
          <div className="empty-payment">
            Loading payments...
          </div>
        ) : pending.length === 0 ? (
          <div className="empty-payment">
            <div className="empty-payment-icon">
              <CreditCard size={24} />
            </div>

            <h3>
              No pending payments
            </h3>

            <p>
              New customer payments
              will appear here.
            </p>
          </div>
        ) : (
          <div className="payment-list">
            {pending.map(
              (payment) => (
                <PaymentCard
                  key={`${payment.payment_type}-${payment.source_id}`}
                  payment={payment}
                />
              )
            )}
          </div>
        )}

      </section>

      {/* ORDER PAYMENTS */}

      <section className="payments-section">

        <div className="section-heading">
          <div>
            <h2>
              Order Payments
            </h2>

            <p>
              Customer payments for
              orders.
            </p>
          </div>

          <div className="pending-badge">
            <ShoppingBag size={16} />
            {orderPayments.length}
          </div>
        </div>

        {orderPayments.length === 0 ? (
          <div className="empty-payment">
            No order payments.
          </div>
        ) : (
          <div className="payment-list">
            {orderPayments.map(
              (payment) => (
                <PaymentCard
                  key={`order-section-${payment.source_id}`}
                  payment={payment}
                  history={
                    normalizeStatus(
                      payment
                    ) !== "pending"
                  }
                />
              )
            )}
          </div>
        )}

      </section>

      {/* WALLET DEPOSITS */}

      <section className="payments-section">

        <div className="section-heading">
          <div>
            <h2>
              Wallet Deposits
            </h2>

            <p>
              Customer wallet
              deposits.
            </p>
          </div>

          <div className="pending-badge">
            <Wallet size={16} />
            {walletDeposits.length}
          </div>
        </div>

        {walletDeposits.length === 0 ? (
          <div className="empty-payment">

            <div className="empty-payment-icon">
              <Wallet size={24} />
            </div>

            <h3>
              No wallet deposits
            </h3>

            <p>
              Customer wallet deposits
              will appear here.
            </p>

          </div>
        ) : (
          <div className="payment-list">
            {walletDeposits.map(
              (payment) => (
                <PaymentCard
                  key={`wallet-section-${payment.source_id}`}
                  payment={payment}
                  history={
                    normalizeStatus(
                      payment
                    ) !== "pending"
                  }
                />
              )
            )}
          </div>
        )}

      </section>

      {/* PAYMENT HISTORY */}

      <section className="payments-section">

        <div className="section-heading">
          <div>
            <h2>
              Payment History
            </h2>

            <p>
              Previously processed
              payments.
            </p>
          </div>
        </div>

        {completed.length === 0 ? (
          <div className="empty-payment">
            No payment history yet.
          </div>
        ) : (
          <div className="payment-list">
            {completed.map(
              (payment) => (
                <PaymentCard
                  key={`history-${payment.payment_type}-${payment.source_id}`}
                  payment={payment}
                  history
                />
              )
            )}
          </div>
        )}

      </section>

      {/* RECEIPT MODAL */}

      {selectedReceipt && (
        <div
          className="receipt-modal-overlay"
          onClick={
            closeReceipt
          }
        >
          <div
            className="receipt-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="receipt-modal-header">

              <div>

                <div className="receipt-modal-title">

                  {selectedReceipt.payment_type ===
                  "wallet" ? (
                    <Wallet size={20} />
                  ) : (
                    <FileText size={20} />
                  )}

                  <h2>
                    {selectedReceipt.payment_type ===
                    "wallet"
                      ? "Wallet Payment Proof"
                      : "Order Payment Receipt"}
                  </h2>

                </div>

                <p>
                  {getCustomerName(
                    selectedReceipt
                  )}

                  {selectedReceipt.order_number
                    ? ` • Order #${selectedReceipt.order_number}`
                    : " • Wallet Deposit"}
                </p>

              </div>

              <button
                type="button"
                className="receipt-close-button"
                onClick={
                  closeReceipt
                }
                aria-label="Close receipt"
              >
                <X size={20} />
              </button>

            </div>

            {/* BODY */}

            <div className="receipt-modal-body">

              {isPdf(
                selectedReceipt.receipt
              ) ? (
                <iframe
                  src={
                    selectedReceipt.receipt
                  }
                  title="Payment proof"
                  className="receipt-pdf"
                />
              ) : (
                <img
                  src={
                    selectedReceipt.receipt
                  }
                  alt="Customer payment proof"
                  className="receipt-image"
                />
              )}

            </div>

            {/* FOOTER */}

            <div className="receipt-modal-footer">

              <div className="receipt-info">
                <span>
                  Customer
                </span>

                <strong>
                  {getCustomerName(
                    selectedReceipt
                  )}
                </strong>
              </div>

              <div className="receipt-info">
                <span>
                  Amount
                </span>

                <strong>
                  $
                  {getAmount(
                    selectedReceipt
                  ).toFixed(2)}
                </strong>
              </div>

              <div className="receipt-info">
                <span>
                  Submitted
                </span>

                <strong>
                  {formatDate(
                    getDate(
                      selectedReceipt
                    )
                  )}
                </strong>
              </div>

              <div className="receipt-modal-actions">

                <button
                  type="button"
                  className="receipt-open-button"
                  onClick={() =>
                    window.open(
                      selectedReceipt.receipt,
                      "_blank"
                    )
                  }
                >
                  <ExternalLink
                    size={16}
                  />

                  Open in New Tab
                </button>

                <button
                  type="button"
                  className="receipt-close-footer"
                  onClick={
                    closeReceipt
                  }
                >
                  Close
                </button>

              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default Payments;
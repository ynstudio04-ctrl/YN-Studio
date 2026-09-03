import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  Package,
  Clock3,
  CheckCircle2,
  Truck,
  XCircle,
  RefreshCw,
  UserRound,
  CalendarDays,
  FileText,
  CreditCard,
  X,
  Upload,
  Check,
  AlertCircle,
} from "lucide-react";

import { useNavigate, useParams } from "react-router-dom";

import "./CustomerOrderDetails.css";

import QRCode from "../../assets/QR.PNG";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerOrderDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showPaymentModal, setShowPaymentModal] =
    useState(false);

  const [receiptFile, setReceiptFile] =
    useState(null);

  const [paymentSubmitting, setPaymentSubmitting] =
    useState(false);

  const [paymentMessage, setPaymentMessage] =
    useState("");

  const [paymentError, setPaymentError] =
    useState("");

  const receiptInputRef = useRef(null);

  useEffect(() => {
  let cancelled = false;

  const refresh = async () => {
    if (!cancelled) {
      await loadOrder(false);
    }
  };

  // Initial page load should show the loading screen.
  loadOrder(true);

  const onFocus = () => {
    refresh();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener(
    "visibilitychange",
    onVisibility
  );

  return () => {
    cancelled = true;

    window.removeEventListener(
      "focus",
      onFocus
    );

    document.removeEventListener(
      "visibilitychange",
      onVisibility
    );
  };
}, [id]);

 async function loadOrder(showLoading = false) {
  try {
    if (showLoading) {
      setLoading(true);
    }

    setError("");
      setError("");

      const token =
        localStorage.getItem("customerToken");

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      const response = await fetch(
        `${API_URL}/api/customer/orders/${id}?_=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to load order"
        );
      }

      setOrder(data.order || data);
    } catch (err) {
      console.error(
        "CUSTOMER ORDER DETAILS ERROR:",
        err
      );

      setError(
        err.message ||
          "Unable to load this order."
      );
    } finally {
  if (showLoading) {
    setLoading(false);
  }
}
  }

  function goBack() {
    navigate("/customer/orders");
  }

  function getDisplayStatus(currentOrder = order) {
    if (!currentOrder) return "pending";

    const requestType = String(currentOrder.request_type || "").toLowerCase();

    if (requestType === "vietnam" && currentOrder.vietnam_status) {
      return currentOrder.vietnam_status;
    }

    if (requestType === "china" && currentOrder.china_status) {
      return currentOrder.china_status;
    }

    return currentOrder.status || "pending";
  }

  function getStatusClass(status) {
    const value = String(
      status || "pending"
    ).toLowerCase();

    if (
      value === "completed" ||
      value === "complete" ||
      value === "paid"
    ) {
      return "completed";
    }

    if (
      value === "processing" ||
      value === "shipping" ||
      value === "shipped"
    ) {
      return "processing";
    }

    if (
      value === "cancelled" ||
      value === "canceled"
    ) {
      return "cancelled";
    }

    return "pending";
  }

  function formatStatus(status) {
    if (!status) return "Pending";

    return String(status)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  }

  function getStatusIcon(status, size = 18) {
    const value = String(
      status || "pending"
    ).toLowerCase();

    if (
      value === "completed" ||
      value === "complete" ||
      value === "paid"
    ) {
      return <CheckCircle2 size={size} />;
    }

    if (
      value === "processing" ||
      value === "shipping" ||
      value === "shipped"
    ) {
      return <Truck size={size} />;
    }

    if (
      value === "cancelled" ||
      value === "canceled"
    ) {
      return <XCircle size={size} />;
    }

    return <Clock3 size={size} />;
  }

  function formatDate(date) {
    if (!date) return "Date unavailable";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "Date unavailable";
    }

    return parsed.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );
  }

  function formatDateTime(date) {
    if (!date) return "Date unavailable";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "Date unavailable";
    }

    return parsed.toLocaleString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  function formatMoney(value) {
    const number = Number(value || 0);

    return `$${number.toFixed(2)}`;
  }

  function getOrderNumber() {
    if (!order) {
      return `#${id}`;
    }

    return `#${
      order.public_order_number ||
      order.id
    }`;
  }

  function openPaymentModal() {
    setPaymentMessage("");
    setPaymentError("");
    setReceiptFile(null);

    if (receiptInputRef.current) {
      receiptInputRef.current.value = "";
    }

    setShowPaymentModal(true);
  }

  function closePaymentModal() {
    if (paymentSubmitting) return;

    setShowPaymentModal(false);
    setReceiptFile(null);
    setPaymentMessage("");
    setPaymentError("");

    if (receiptInputRef.current) {
      receiptInputRef.current.value = "";
    }
  }

  function handleReceiptChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setReceiptFile(null);
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setPaymentError(
        "Only JPG, PNG, WEBP, and PDF files are allowed."
      );

      event.target.value = "";
      setReceiptFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPaymentError(
        "Receipt file must be smaller than 10 MB."
      );

      event.target.value = "";
      setReceiptFile(null);
      return;
    }

    setPaymentError("");
    setPaymentMessage("");
    setReceiptFile(file);
  }

  async function submitPayment() {
    if (!receiptFile) {
      setPaymentError(
        "Please select your payment receipt first."
      );
      return;
    }

    if (!order) {
      setPaymentError(
        "Order information is unavailable."
      );
      return;
    }

    try {
      setPaymentSubmitting(true);
      setPaymentError("");
      setPaymentMessage("");

      const token =
        localStorage.getItem("customerToken");

      if (!token) {
        navigate("/login", {
          replace: true,
        });
        return;
      }

      const formData = new FormData();

      formData.append(
        "receipt",
        receiptFile
      );

      const response = await fetch(
        `${API_URL}/api/customer/orders/${order.id}/payment`,
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
          data.message ||
            "Failed to submit payment receipt."
        );
      }

      setPaymentMessage(
        data.message ||
          "Payment receipt submitted successfully."
      );

      setReceiptFile(null);

      if (receiptInputRef.current) {
        receiptInputRef.current.value = "";
      }

      if (data.order) {
        setOrder((previous) => ({
          ...(previous || {}),
          ...data.order,
        }));
      }
    } catch (err) {
      console.error(
        "CUSTOMER PAYMENT ERROR:",
        err
      );

      setPaymentError(
        err.message ||
          "Failed to submit payment receipt."
      );
    } finally {
      setPaymentSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="customer-order-details-page">
        <header className="order-details-header">
          <button
            className="order-details-back"
            onClick={goBack}
            type="button"
            aria-label="Back to orders"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="order-details-header-title">
            <span>YN STUDIO</span>

            <strong>
              Order Details
            </strong>
          </div>

          <div className="order-details-header-spacer" />
        </header>

        <div className="order-details-loading">
          <div className="order-details-loader" />

          <h3>
            Loading order...
          </h3>

          <p>
            Please wait while we get your
            order details.
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="customer-order-details-page">
        <header className="order-details-header">
          <button
            className="order-details-back"
            onClick={goBack}
            type="button"
            aria-label="Back to orders"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="order-details-header-title">
            <span>YN STUDIO</span>

            <strong>
              Order Details
            </strong>
          </div>

          <div className="order-details-header-spacer" />
        </header>

        <div className="order-details-error">
          <div className="order-error-icon">
            <XCircle size={28} />
          </div>

          <h3>
            Unable to load order
          </h3>

          <p>
            {error ||
              "This order could not be found."}
          </p>

          <div className="order-error-actions">
            <button
              type="button"
              onClick={loadOrder}
              className="order-retry-button"
            >
              <RefreshCw size={15} />
              Try Again
            </button>

            <button
              type="button"
              onClick={goBack}
              className="order-back-button"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayStatus = getDisplayStatus(order);

  const statusClass =
    getStatusClass(displayStatus);

  const statusText =
    formatStatus(displayStatus);

  const isPendingPayment =
    String(displayStatus || "").toLowerCase() ===
    "pending_payment";

  const paymentSubmitted =
    String(
      order.payment_status || ""
    ).toLowerCase() ===
    "submitted";

  const paymentAmount =
    order.payment_amount ??
    order.total ??
    0;

  return (
    <>
      <div className="customer-order-details-page">

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="order-details-header">

          <button
            className="order-details-back"
            onClick={goBack}
            type="button"
            aria-label="Back to orders"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="order-details-header-title">
            <span>
              YN STUDIO
            </span>

            <strong>
              Order Details
            </strong>
          </div>

          <button
            className="order-details-refresh"
            onClick={loadOrder}
            type="button"
            aria-label="Refresh order"
          >
            <RefreshCw size={18} />
          </button>

        </header>

        {/* =================================================
            ORDER HERO
        ================================================= */}

        <section className="order-details-hero">

          <div className="order-hero-icon">
            <Package size={27} />
          </div>

          <div className="order-hero-content">

            <span className="order-hero-label">
              ORDER
            </span>

            <h1>
              {getOrderNumber()}
            </h1>

            <p>
              Placed{" "}
              {formatDate(
                order.created_at
              )}
            </p>

          </div>

          <div
            className={`order-hero-status ${statusClass}`}
          >
            {getStatusIcon(
              displayStatus,
              15
            )}

            <span>
              {statusText}
            </span>
          </div>

        </section>

        {/* =================================================
            STATUS
        ================================================= */}

        <section className="order-detail-card">

          <div className="order-card-heading">

            <div>
              <span>
                ORDER STATUS
              </span>

              <h2>
                {statusText}
              </h2>
            </div>

            <div
              className={`status-large-icon ${statusClass}`}
            >
              {getStatusIcon(
                displayStatus,
                20
              )}
            </div>

          </div>

          <div className="order-status-timeline">

            <div
              className={
                statusClass ===
                "cancelled"
                  ? "timeline-item cancelled"
                  : "timeline-item active"
              }
            >
              <div className="timeline-dot">
                <CheckCircle2 size={13} />
              </div>

              <div className="timeline-content">
                <strong>
                  Order Placed
                </strong>

                <span>
                  {formatDateTime(
                    order.created_at
                  )}
                </span>
              </div>
            </div>

            {statusClass !==
              "cancelled" && (
              <div
                className={
                  statusClass ===
                    "processing" ||
                  statusClass ===
                    "completed"
                    ? "timeline-item active"
                    : "timeline-item"
                }
              >
                <div className="timeline-dot">
                  <Truck size={13} />
                </div>

                <div className="timeline-content">
                  <strong>
                    Processing
                  </strong>

                  <span>
                    {statusClass ===
                      "processing" ||
                    statusClass ===
                      "completed"
                      ? "Order is being processed"
                      : "Waiting for processing"}
                  </span>
                </div>
              </div>
            )}

            {statusClass !==
              "cancelled" && (
              <div
                className={
                  statusClass ===
                  "completed"
                    ? "timeline-item active"
                    : "timeline-item"
                }
              >
                <div className="timeline-dot">
                  <CheckCircle2 size={13} />
                </div>

                <div className="timeline-content">
                  <strong>
                    Completed
                  </strong>

                  <span>
                    {statusClass ===
                    "completed"
                      ? "Order completed"
                      : "Not completed yet"}
                  </span>
                </div>
              </div>
            )}

            {statusClass ===
              "cancelled" && (
              <div className="timeline-item cancelled">

                <div className="timeline-dot">
                  <XCircle size={13} />
                </div>

                <div className="timeline-content">
                  <strong>
                    Order Cancelled
                  </strong>

                  <span>
                    This order has been
                    cancelled.
                  </span>
                </div>

              </div>
            )}

          </div>

        </section>

        {/* =================================================
            ORDER INFORMATION
        ================================================= */}

        <section className="order-detail-card">

          <div className="order-section-title">

            <Package size={17} />

            <h2>
              Order Information
            </h2>

          </div>

          <div className="order-info-grid">

            <div className="order-info-item">

              <div className="order-info-icon">
                <Package size={16} />
              </div>

              <div>
                <span>
                  Order Number
                </span>

                <strong>
                  {getOrderNumber()}
                </strong>
              </div>

            </div>

            <div className="order-info-item">

              <div className="order-info-icon">
                <CalendarDays size={16} />
              </div>

              <div>
                <span>
                  Order Date
                </span>

                <strong>
                  {formatDate(
                    order.created_at
                  )}
                </strong>
              </div>

            </div>

            <div className="order-info-item">

              <div className="order-info-icon">
                <CreditCard size={16} />
              </div>

              <div>
                <span>
                  Total
                </span>

                <strong className="purple-text">
                  {formatMoney(
                    order.total
                  )}
                </strong>
              </div>

            </div>

            <div className="order-info-item">

              <div className="order-info-icon">
                <Clock3 size={16} />
              </div>

              <div>
                <span>
                  Status
                </span>

                <strong>
                  {statusText}
                </strong>
              </div>

            </div>

          </div>

        </section>

        {/* =================================================
            CUSTOMER
        ================================================= */}

        {(order.customer ||
          order.customer_name ||
          order.full_name) && (
          <section className="order-detail-card">

            <div className="order-section-title">

              <UserRound size={17} />

              <h2>
                Customer
              </h2>

            </div>

            <div className="customer-order-profile">

              <div className="customer-order-avatar">
                <UserRound size={21} />
              </div>

              <div>

                <strong>
                  {order.customer?.full_name ||
                    order.customer_name ||
                    order.full_name}
                </strong>

                {(order.customer
                  ?.customer_code ||
                  order.customer_code) && (
                  <span>
                    {order.customer
                      ?.customer_code ||
                      order.customer_code}
                  </span>
                )}

              </div>

            </div>

          </section>
        )}

        {/* =================================================
            NOTES
        ================================================= */}

        {order.notes && (
          <section className="order-detail-card">

            <div className="order-section-title">

              <FileText size={17} />

              <h2>
                Order Notes
              </h2>

            </div>

            <div className="order-notes-box">
              {order.notes}
            </div>

          </section>
        )}

      {/* =================================================
    PAYMENT ACTION
================================================= */}

{isPendingPayment && (
  <section className="customer-payment-section">

    {paymentSubmitted ? (
      <div className="customer-payment-submitted-note">
        <CheckCircle2 size={18} />

        <span>
          Payment receipt submitted. We will review it shortly.
        </span>
      </div>
    ) : (
      <button
        type="button"
        className="customer-pay-now-button"
        onClick={openPaymentModal}
      >
        <CreditCard size={18} />

        <span>
          Pay Now
        </span>

        <strong>
          {formatMoney(paymentAmount)}
        </strong>
      </button>
    )}

  </section>
)}
        {/* =================================================
            TOTAL
        ================================================= */}

        <section className="order-total-card">

          <div>

            <span>
              TOTAL ORDER VALUE
            </span>

            <strong>
              {formatMoney(
                order.total
              )}
            </strong>

          </div>

          <div className="total-package-icon">
            <Package size={23} />
          </div>

        </section>

        {/* =================================================
            BOTTOM ACTION
        ================================================= */}

        <button
          type="button"
          className="order-details-bottom-button"
          onClick={goBack}
        >
          <ArrowLeft size={17} />

          Back to My Orders
        </button>

      </div>

      {/* =================================================
          PAYMENT MODAL
      ================================================= */}

      {showPaymentModal && (
        <div
          className="customer-payment-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !paymentSubmitting
            ) {
              closePaymentModal();
            }
          }}
        >

          <div className="customer-payment-modal">

            {/* MODAL HEADER */}

            <div className="customer-payment-modal-header">

              <div>

                <span className="customer-payment-eyebrow">
                  YN STUDIO
                </span>

                <h2>
                  Complete Payment
                </h2>

                <p>
                  Order{" "}
                  {getOrderNumber()}
                </p>

              </div>

              <button
                type="button"
                className="customer-payment-close"
                onClick={
                  closePaymentModal
                }
                disabled={
                  paymentSubmitting
                }
                aria-label="Close payment"
              >
                <X size={21} />
              </button>

            </div>

            {/* AMOUNT */}

            <div className="customer-payment-amount">

              <span>
                Amount to Pay
              </span>

              <strong>
                {formatMoney(
                  paymentAmount
                )}
              </strong>

            </div>

            {/* QR CODE */}

            <div className="customer-payment-qr-section">

              <h3>
                Scan to Pay
              </h3>

              <p>
                Scan the QR code below
                using your banking app.
              </p>

              <div className="customer-payment-qr-wrapper">

                <img
                  src={QRCode}
                  alt="YN Studio payment QR code"
                  className="customer-payment-qr"
                />

              </div>

              <div className="customer-payment-qr-note">

                <CreditCard size={16} />

                <span>
                  Please make sure you
                  pay the exact amount
                  shown above.
                </span>

              </div>

            </div>

            <div className="customer-payment-divider" />

            {/* RECEIPT UPLOAD */}

            <div className="customer-payment-upload-section">

              <h3>
                Upload Payment Receipt
              </h3>

              <p>
                After completing the
                payment, upload your
                receipt below.
              </p>

              <input
                ref={receiptInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={
                  handleReceiptChange
                }
                hidden
              />

              <button
                type="button"
                className="customer-payment-upload-button"
                onClick={() =>
                  receiptInputRef.current?.click()
                }
                disabled={
                  paymentSubmitting
                }
              >
                <Upload size={18} />

                <span>
                  {receiptFile
                    ? "Change Receipt"
                    : "Choose Receipt"}
                </span>
              </button>

              {/* SELECTED FILE */}

              {receiptFile && (
                <div className="customer-payment-file">

                  <div className="customer-payment-file-icon">
                    <FileText size={18} />
                  </div>

                  <div className="customer-payment-file-info">

                    <strong>
                      {receiptFile.name}
                    </strong>

                    <span>
                      {(
                        receiptFile.size /
                        1024 /
                        1024
                      ).toFixed(2)}{" "}
                      MB
                    </span>

                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(
                        null
                      );

                      if (
                        receiptInputRef.current
                      ) {
                        receiptInputRef.current.value =
                          "";
                      }
                    }}
                    disabled={
                      paymentSubmitting
                    }
                    aria-label="Remove receipt"
                  >
                    <X size={17} />
                  </button>

                </div>
              )}

              {/* ERROR */}

              {paymentError && (
                <div className="customer-payment-message error">

                  <AlertCircle
                    size={18}
                  />

                  <span>
                    {paymentError}
                  </span>

                </div>
              )}

              {/* SUCCESS */}

              {paymentMessage && (
                <div className="customer-payment-message success">

                  <Check size={18} />

                  <span>
                    {paymentMessage}
                  </span>

                </div>
              )}

              {/* SUBMIT */}

              <button
                type="button"
                className="customer-payment-submit-button"
                onClick={
                  submitPayment
                }
                disabled={
                  paymentSubmitting ||
                  !receiptFile ||
                  Boolean(
                    paymentMessage
                  )
                }
              >

                {paymentSubmitting ? (
                  <>
                    <RefreshCw
                      size={18}
                      className="customer-payment-spin"
                    />

                    <span>
                      Submitting...
                    </span>
                  </>
                ) : paymentMessage ? (
                  <>
                    <Check size={18} />

                    <span>
                      Payment Submitted
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={18}
                    />

                    <span>
                      Submit Payment Receipt
                    </span>
                  </>
                )}

              </button>

            </div>

          </div>

        </div>
      )}

    </>
  );
}

export default CustomerOrderDetails;
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  ImagePlus,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import "./CustomerOrderDetails.css";

import QRImage from "../../assets/QR.PNG";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerOrderPayment() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("customerToken");

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      const response = await fetch(
        `${API_URL}/api/customer/orders/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to load order"
        );
      }

      setOrder(data.order || data);
    } catch (err) {
      console.error(
        "CUSTOMER PAYMENT LOAD ERROR:",
        err
      );

      setError(
        err.message ||
          "Unable to load this order."
      );
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    navigate(`/customer/orders/${id}`);
  }

  function formatMoney(value) {
    const number = Number(value || 0);

    return `$${number.toFixed(2)}`;
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

  function getPaymentStatus() {
    return String(
      order?.payment_status ||
        "unpaid"
    ).toLowerCase();
  }

  function handleReceiptChange(event) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(
        "Please upload an image of your payment receipt."
      );

      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert(
        "Receipt image must be smaller than 10MB."
      );

      event.target.value = "";
      return;
    }

    setReceipt(file);

    const previewUrl =
      URL.createObjectURL(file);

    setReceiptPreview(previewUrl);
  }

  async function submitPayment() {
    if (!receipt) {
      alert(
        "Please upload your payment receipt first."
      );

      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const token =
        localStorage.getItem(
          "customerToken"
        );

      if (!token) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      const reader =
        new FileReader();

      reader.onload = async () => {
        try {
          const paymentImage =
            reader.result;

          const response = await fetch(
            `${API_URL}/api/customer/orders/${id}/payment`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body: JSON.stringify({
                payment_receipt:
                  paymentImage,
              }),
            }
          );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.message ||
                data.error ||
                "Failed to submit payment."
            );
          }

          setSuccess(true);

          await loadOrder();
        } catch (err) {
          console.error(
            "PAYMENT SUBMIT ERROR:",
            err
          );

          setError(
            err.message ||
              "Failed to submit payment."
          );
        } finally {
          setSubmitting(false);
        }
      };

      reader.onerror = () => {
        setSubmitting(false);

        setError(
          "Unable to read the receipt image."
        );
      };

      reader.readAsDataURL(receipt);
    } catch (err) {
      setSubmitting(false);

      setError(
        err.message ||
          "Failed to submit payment."
      );
    }
  }

  if (loading) {
    return (
      <div className="customer-payment-page">
        <header className="customer-payment-header">
          <button
            type="button"
            className="payment-back-button"
            onClick={goBack}
          >
            <ArrowLeft size={20} />
          </button>

          <div className="payment-header-title">
            <span>YN STUDIO</span>
            <strong>Payment</strong>
          </div>

          <div className="payment-header-spacer" />
        </header>

        <div className="payment-loading">
          <LoaderCircle
            size={32}
            className="payment-loading-icon"
          />

          <h3>
            Loading payment...
          </h3>

          <p>
            Please wait while we load
            your order.
          </p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="customer-payment-page">
        <header className="customer-payment-header">
          <button
            type="button"
            className="payment-back-button"
            onClick={goBack}
          >
            <ArrowLeft size={20} />
          </button>

          <div className="payment-header-title">
            <span>YN STUDIO</span>
            <strong>Payment</strong>
          </div>

          <div className="payment-header-spacer" />
        </header>

        <div className="payment-error">
          <div className="payment-error-icon">
            <XCircle size={28} />
          </div>

          <h3>
            Unable to load payment
          </h3>

          <p>{error}</p>

          <button
            type="button"
            onClick={loadOrder}
            className="payment-retry-button"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const paymentStatus =
    getPaymentStatus();

  const isSubmitted =
    paymentStatus === "submitted" ||
    paymentStatus === "pending";

  const isPaid =
    paymentStatus === "paid" ||
    paymentStatus === "approved";

  const isRejected =
    paymentStatus === "rejected";

  return (
    <div className="customer-payment-page">

      {/* HEADER */}

      <header className="customer-payment-header">
        <button
          type="button"
          className="payment-back-button"
          onClick={goBack}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="payment-header-title">
          <span>YN STUDIO</span>

          <strong>
            Make Payment
          </strong>
        </div>

        <button
          type="button"
          className="payment-refresh-button"
          onClick={loadOrder}
          aria-label="Refresh payment"
        >
          <RefreshCw size={18} />
        </button>
      </header>

      <main className="customer-payment-content">

        {/* ORDER SUMMARY */}

        <section className="payment-order-card">

          <div className="payment-order-icon">
            <CreditCard size={22} />
          </div>

          <div className="payment-order-info">
            <span>ORDER</span>

            <strong>
              #{String(
                order?.public_order_number ||
                  order?.id ||
                  id
              ).padStart(6, "0")}
            </strong>

            <small>
              Placed{" "}
              {formatDate(
                order?.created_at
              )}
            </small>
          </div>

          <div className="payment-order-total">
            <span>AMOUNT DUE</span>

            <strong>
              {formatMoney(
                order?.payment_amount ??
                  order?.total
              )}
            </strong>
          </div>

        </section>

        {/* PAID */}

        {isPaid && (
          <section className="payment-state-card paid">

            <div className="payment-state-icon">
              <CheckCircle2 size={32} />
            </div>

            <h2>
              Payment Approved
            </h2>

            <p>
              Your payment has been
              approved. Thank you!
            </p>

            <button
              type="button"
              onClick={goBack}
              className="payment-state-button"
            >
              View Order
            </button>

          </section>
        )}

        {/* SUBMITTED */}

        {!isPaid && isSubmitted && (
          <section className="payment-state-card submitted">

            <div className="payment-state-icon">
              <Clock3 size={32} />
            </div>

            <h2>
              Payment Under Review
            </h2>

            <p>
              Your payment receipt has
              been submitted and is waiting
              for confirmation.
            </p>

            <button
              type="button"
              onClick={loadOrder}
              className="payment-state-button"
            >
              <RefreshCw size={16} />
              Check Status
            </button>

          </section>
        )}

        {/* REJECTED */}

        {!isPaid && isRejected && (
          <section className="payment-state-card rejected">

            <div className="payment-state-icon">
              <XCircle size={32} />
            </div>

            <h2>
              Payment Rejected
            </h2>

            <p>
              Your previous payment could
              not be approved. Please make
              the payment again and upload
              a new receipt.
            </p>

          </section>
        )}

        {/* PAYMENT */}

        {!isPaid &&
          !isSubmitted && (
            <>
              <section className="payment-method-card">

                <div className="payment-section-heading">

                  <div className="payment-heading-icon">
                    <QrCode size={18} />
                  </div>

                  <div>
                    <span>
                      PAYMENT METHOD
                    </span>

                    <h2>
                      Scan QR Code
                    </h2>
                  </div>

                </div>

                <p className="payment-method-description">
                  Scan the QR code below
                  using your banking app
                  to complete your payment.
                </p>

                <div className="payment-qr-wrapper">
                  <img
                    src={QRImage}
                    alt="YN Studio payment QR code"
                    className="payment-qr-image"
                  />
                </div>

                <div className="payment-amount-box">
                  <span>
                    AMOUNT TO PAY
                  </span>

                  <strong>
                    {formatMoney(
                      order?.payment_amount ??
                        order?.total
                    )}
                  </strong>
                </div>

              </section>

              {/* RECEIPT */}

              <section className="payment-receipt-card">

                <div className="payment-section-heading">

                  <div className="payment-heading-icon">
                    <Upload size={18} />
                  </div>

                  <div>
                    <span>
                      PAYMENT RECEIPT
                    </span>

                    <h2>
                      Upload Proof
                    </h2>
                  </div>

                </div>

                <p className="payment-method-description">
                  After completing your
                  payment, upload a screenshot
                  or photo of your receipt.
                </p>

                <label
                  className={
                    receipt
                      ? "receipt-upload-box has-file"
                      : "receipt-upload-box"
                  }
                >

                  <input
                    type="file"
                    accept="image/*"
                    onChange={
                      handleReceiptChange
                    }
                  />

                  {receiptPreview ? (
                    <div className="receipt-preview">

                      <img
                        src={receiptPreview}
                        alt="Payment receipt preview"
                      />

                      <div className="receipt-preview-overlay">
                        <ImagePlus
                          size={20}
                        />

                        <span>
                          Change Receipt
                        </span>
                      </div>

                    </div>
                  ) : (
                    <div className="receipt-upload-content">

                      <div className="receipt-upload-icon">
                        <Upload size={22} />
                      </div>

                      <strong>
                        Upload Receipt
                      </strong>

                      <span>
                        JPG, PNG or WEBP
                      </span>

                      <small>
                        Maximum 10MB
                      </small>

                    </div>
                  )}

                </label>

                {receipt && (
                  <div className="receipt-file-name">
                    <CheckCircle2 size={15} />

                    <span>
                      {receipt.name}
                    </span>
                  </div>
                )}

                {error && (
                  <div className="payment-inline-error">
                    <XCircle size={15} />
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  className="submit-payment-button"
                  onClick={submitPayment}
                  disabled={
                    submitting ||
                    !receipt
                  }
                >
                  {submitting ? (
                    <>
                      <LoaderCircle
                        size={17}
                        className="payment-spin"
                      />

                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2
                        size={17}
                      />

                      Submit Payment
                    </>
                  )}
                </button>

              </section>
            </>
          )}

        {/* FOOTER */}

        <button
          type="button"
          className="payment-bottom-back"
          onClick={goBack}
        >
          <ArrowLeft size={17} />
          Back to Order
        </button>

      </main>
    </div>
  );
}

export default CustomerOrderPayment;
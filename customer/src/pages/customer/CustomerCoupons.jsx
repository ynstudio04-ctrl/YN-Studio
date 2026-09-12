import React, { useEffect, useState } from "react";
import { Copy, Check, Ticket, ArrowLeft, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { customerRequest } from "../../lib/api";
import "./CustomerCoupons.css";

function CustomerCoupons() {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [validCoupon, setValidCoupon] = useState(null);
  const [copied, setCopied] = useState("");

  async function loadCoupons() {
    try {
      setLoading(true);
      const data = await customerRequest("/api/customer/coupons");
      setCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
    } catch (error) {
      setMessage(error.message || "Failed to load coupons.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  async function validateCoupon(event) {
    event.preventDefault();
    setMessage("");
    setValidCoupon(null);

    if (!code.trim()) {
      setMessage("Enter a coupon code.");
      return;
    }

    try {
      const data = await customerRequest(
        "/api/customer/coupons/validate",
        {
          method: "POST",
          body: JSON.stringify({ code: code.trim() }),
        }
      );

      setValidCoupon(data.coupon);
      setMessage("Coupon is valid and ready to use.");
    } catch (error) {
      setMessage(error.message || "Coupon is not valid.");
    }
  }

  async function copyCode(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setMessage("Copy failed. Please copy the code manually.");
    }
  }

  function formatDiscount(coupon) {
    const value = Number(coupon.discount_value || 0);
    return String(coupon.discount_type).toLowerCase() === "percentage"
      ? `${value}% OFF`
      : `$${value.toFixed(2)} OFF`;
  }

  return (
    <div className="customer-coupons-page">
      <header className="customer-coupons-header">
        <button type="button" onClick={() => navigate("/home")}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <span>YN STUDIO</span>
          <strong>My Coupons</strong>
        </div>
        <Ticket size={22} />
      </header>

      <section className="customer-coupon-hero">
        <div className="customer-coupon-hero-icon">
          <Tag size={25} />
        </div>
        <h1>Coupons & Discounts</h1>
        <p>Check your available coupons and validate a code before using it on an order.</p>
      </section>

      <form className="customer-coupon-checker" onSubmit={validateCoupon}>
        <label>Have a coupon code?</label>
        <div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            autoCapitalize="characters"
          />
          <button type="submit">Check</button>
        </div>
      </form>

      {message && (
        <div className={`customer-coupon-message ${validCoupon ? "success" : ""}`}>
          {message}
        </div>
      )}

      {validCoupon && (
        <div className="customer-coupon-valid">
          <div>
            <span>VALID COUPON</span>
            <strong>{validCoupon.code}</strong>
          </div>
          <b>{formatDiscount(validCoupon)}</b>
        </div>
      )}

      <section className="customer-coupon-list">
        <div className="customer-coupon-section-title">
          <h2>Available Coupons</h2>
          <span>{coupons.length}</span>
        </div>

        {loading ? (
          <div className="customer-coupon-empty">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="customer-coupon-empty">
            <Ticket size={28} />
            <strong>No coupons yet</strong>
            <span>Your available coupons will appear here.</span>
          </div>
        ) : (
          coupons.map((coupon) => (
            <article className="customer-coupon-card" key={coupon.id}>
              <div className="customer-coupon-card-icon">
                <Ticket size={22} />
              </div>
              <div className="customer-coupon-card-main">
                <strong>{coupon.code}</strong>
                <b>{formatDiscount(coupon)}</b>
                {coupon.expires_at && (
                  <span>Expires {new Date(coupon.expires_at).toLocaleDateString()}</span>
                )}
                {coupon.notes && <small>{coupon.notes}</small>}
              </div>
              <button type="button" onClick={() => copyCode(coupon.code)}>
                {copied === coupon.code ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export default CustomerCoupons;

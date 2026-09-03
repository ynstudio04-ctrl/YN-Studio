import React, { useEffect, useState } from "react";
import { LockKeyhole, ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./CustomerAuth.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function CreatePasscode() {
  const navigate = useNavigate();

  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [paymentName, setPaymentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("customerToken");
    const authVersion = localStorage.getItem("customerAuthVersion");

    if (!token || authVersion !== "2") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!/^\d{4}$/.test(passcode)) {
      setError("Your passcode must be exactly 4 digits.");
      return;
    }

    if (passcode !== confirmPasscode) {
      setError("Your passcodes do not match.");
      return;
    }

    if (paymentName.trim().length < 2) {
      setError("Enter the real name shown on the payment account you will use.");
      return;
    }

    try {
      setLoading(true);

      const token = localStorage.getItem("customerToken");

      const response = await fetch(
        `${API_URL}/api/customer/wallet/passcode`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ passcode, payment_name: paymentName.trim() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to create your passcode."
        );
      }

      localStorage.setItem(
        "customerWalletPinSet",
        "true"
      );

      navigate("/home", { replace: true });
    } catch (err) {
      setError(
        err.message || "Unable to create your passcode."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="passcode-page">
      <main className="passcode-card">
        <div className="passcode-icon">
          <LockKeyhole size={28} />
        </div>

        <span className="passcode-eyebrow">
          WALLET SECURITY
        </span>

        <h1>Create your 4-digit passcode</h1>

        <p className="passcode-description">
          Create your passcode and enter the real name that will appear on your bank payments.
        </p>

        {error && (
          <div className="passcode-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="passcode-form">
          <label htmlFor="payment-name">Payment name</label>
          <input
            id="payment-name"
            type="text"
            value={paymentName}
            onChange={(event) => {
              setError("");
              setPaymentName(event.target.value);
            }}
            placeholder="Your real payment name"
            autoComplete="name"
          />
          <small className="passcode-field-hint">
            This must match the name shown in your bank payment notification.
          </small>

          <label htmlFor="payment-name">Payment name</label>
          <input id="payment-name" type="text" value={paymentName}
            onChange={(event) => { setError(""); setPaymentName(event.target.value); }}
            placeholder="Your real payment name" autoComplete="name" />
          <small className="passcode-field-hint">This must match the name shown in your bank payment notification.</small>

          <label htmlFor="wallet-passcode">
            Create passcode
          </label>

          <input
            id="wallet-passcode"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={passcode}
            onChange={(event) => {
              setError("");
              setPasscode(
                event.target.value.replace(/\D/g, "").slice(0, 4)
              );
            }}
            placeholder="••••"
            autoFocus
          />

          <label htmlFor="wallet-passcode-confirm">
            Confirm passcode
          </label>

          <input
            id="wallet-passcode-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={confirmPasscode}
            onChange={(event) => {
              setError("");
              setConfirmPasscode(
                event.target.value.replace(/\D/g, "").slice(0, 4)
              );
            }}
            placeholder="••••"
          />

          <button
            type="submit"
            className="passcode-submit"
            disabled={loading || paymentName.trim().length < 2 || passcode.length !== 4 || confirmPasscode.length !== 4}
          >
            {loading ? "Saving..." : "Create passcode"}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="passcode-note">
          <CheckCircle2 size={16} />
          <span>
            Your passcode is securely protected and is not
            used for normal app sign-in.
          </span>
        </div>
      </main>
    </div>
  );
}

export default CreatePasscode;

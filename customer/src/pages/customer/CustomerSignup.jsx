
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";

import "./CustomerAuth.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerSignup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  }

  function validateForm() {
    if (!form.name.trim()) {
      return "Please enter your full name.";
    }

    if (form.name.trim().length < 2) {
      return "Your name must contain at least 2 characters.";
    }

    if (!form.email.trim()) {
      return "Please enter your email address.";
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }

    if (!form.phone.trim()) {
      return "Please enter your phone number.";
    }

    if (!form.password) {
      return "Please create a password.";
    }

    if (form.password.length < 6) {
      return "Your password must contain at least 6 characters.";
    }

    if (!form.confirmPassword) {
      return "Please confirm your password.";
    }

    if (form.password !== form.confirmPassword) {
      return "Your passwords do not match.";
    }

    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/customer/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            password: form.password,
          }),
        }
      );

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.error ||
          "Unable to create your account."
        );
      }

      /*
       * Registration intentionally does not create a logged-in
       * session. The customer must sign in first. After sign-in,
       * the server tells us whether a wallet passcode exists.
       */
      localStorage.removeItem("customerToken");
        localStorage.removeItem("customerWalletUnlockedAt");
      localStorage.removeItem("customerAuthenticated");
      localStorage.removeItem("customerUser");
      localStorage.removeItem("customerWalletPinSet");
      localStorage.removeItem("customerAuthVersion");

      setSuccess(
        "Your account has been created successfully. Please sign in."
      );

      setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 900);

    } catch (err) {
      console.error(
        "Customer registration error:",
        err
      );

      setError(
        err.message ||
        "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="customer-auth-page">

      <main className="customer-auth-container">

        {/* BACK BUTTON */}

        <button
          type="button"
          className="auth-back-button"
          onClick={() => navigate("/login")}
          aria-label="Go back"
        >
          <ArrowLeft size={19} />
        </button>


        {/* BRAND */}

        <div className="auth-brand">

          <div className="auth-brand-logo">
            YN
          </div>

          <div>

            <div className="auth-brand-name">
              STUDIO
            </div>

            <div className="auth-brand-tagline">
              Design. Deliver. Delight.
            </div>

          </div>

        </div>


        {/* HEADING */}

        <div className="auth-heading">

          <span className="auth-eyebrow">
            CUSTOMER ACCOUNT
          </span>

          <h1>
            Create your account
          </h1>

          <p>
            Join YN Studio and manage your
            orders, payments and packages
            from your phone.
          </p>

        </div>


        {/* ERROR */}

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}


        {/* SUCCESS */}

        {success && (
          <div className="auth-success">
            {success}
          </div>
        )}


        {/* FORM */}

        <form
          className="customer-auth-form signup-form"
          onSubmit={handleSubmit}
        >

          {/* NAME */}

          <div className="auth-field">

            <label htmlFor="customer-name">
              Full name
            </label>

            <div className="auth-input-wrapper">

              <UserRound
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                autoComplete="name"
              />

            </div>

          </div>


          {/* EMAIL */}

          <div className="auth-field">

            <label htmlFor="customer-signup-email">
              Email address
            </label>

            <div className="auth-input-wrapper">

              <Mail
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-signup-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
              />

            </div>

          </div>


          {/* PHONE */}

          <div className="auth-field">

            <label htmlFor="customer-phone">
              Phone number
            </label>

            <div className="auth-input-wrapper">

              <Phone
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="Enter your phone number"
                autoComplete="tel"
              />

            </div>

          </div>


          {/* PASSWORD */}

          <div className="auth-field">

            <label htmlFor="customer-signup-password">
              Password
            </label>

            <div className="auth-input-wrapper">

              <LockKeyhole
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-signup-password"
                name="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={form.password}
                onChange={handleChange}
                placeholder="Create a password"
                autoComplete="new-password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (previous) => !previous
                  )
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>

          </div>


          {/* CONFIRM PASSWORD */}

          <div className="auth-field">

            <label htmlFor="customer-confirm-password">
              Confirm password
            </label>

            <div className="auth-input-wrapper">

              <LockKeyhole
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-confirm-password"
                name="confirmPassword"
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Enter your password again"
                autoComplete="new-password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowConfirmPassword(
                    (previous) => !previous
                  )
                }
                aria-label={
                  showConfirmPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>

          </div>


          {/* SUBMIT */}

          <button
            type="submit"
            className="auth-submit-button"
            disabled={loading}
          >

            {loading ? (
              <span className="auth-loading">
                Creating account...
              </span>
            ) : (
              <>
                <span>
                  Create account
                </span>

                <ArrowRight size={18} />
              </>
            )}

          </button>

        </form>


        {/* LOGIN LINK */}

        <div className="auth-switch">

          <span>
            Already have an account?
          </span>

          <Link to="/login">
            Sign in
          </Link>

        </div>


        {/* SECURITY */}

        <div className="auth-security">

          <LockKeyhole size={14} />

          <span>
            Your account information is securely protected.
          </span>

        </div>

      </main>

    </div>
  );
}

export default CustomerSignup;


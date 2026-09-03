
import React, { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";

import "./CustomerAuth.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerLogin() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    const email =
      form.email.trim().toLowerCase();

    if (!email) {
      setError(
        "Please enter your email address."
      );
      return;
    }

    if (!form.password) {
      setError(
        "Please enter your password."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/customer/auth/login`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email,
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
          "Invalid email or password."
        );
      }

      if (!data?.token) {
        throw new Error(
          "Login succeeded but no authentication token was returned."
        );
      }

      /*
       * Save the customer authentication
       * information.
       */

      localStorage.setItem(
        "customerToken",
        data.token
      );

      localStorage.setItem(
        "customerAuthenticated",
        "true"
      );

      localStorage.setItem(
        "customerAuthVersion",
        "2"
      );

      localStorage.setItem(
        "customerWalletPinSet",
        data.walletPinSet === false ? "false" : "true"
      );

      if (data.customer) {
        localStorage.setItem(
          "customerUser",
          JSON.stringify(
            data.customer
          )
        );
      }

      if (data.walletPinSet === false) {
        navigate("/create-passcode", {
          replace: true,
        });
        return;
      }

      /*
       * Go to the customer dashboard.
       */

      navigate("/home", {
        replace: true,
      });

    } catch (err) {
      console.error(
        "Customer login error:",
        err
      );

      setError(
        err.message ||
        "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="customer-auth-page">

      <main className="customer-auth-container">

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
            CUSTOMER PORTAL
          </span>

          <h1>
            Welcome back
          </h1>

          <p>
            Sign in to manage your
            orders, payments and
            packages.
          </p>

        </div>


        {/* ERROR */}

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}


        {/* FORM */}

        <form
          className="customer-auth-form"
          onSubmit={handleSubmit}
        >

          {/* EMAIL */}

          <div className="auth-field">

            <label htmlFor="customer-login-email">
              Email address
            </label>

            <div className="auth-input-wrapper">

              <Mail
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-login-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
              />

            </div>

          </div>


          {/* PASSWORD */}

          <div className="auth-field">

            <label htmlFor="customer-login-password">
              Password
            </label>

            <div className="auth-input-wrapper">

              <LockKeyhole
                className="auth-input-icon"
                size={18}
              />

              <input
                id="customer-login-password"
                name="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                autoComplete="current-password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (previous) =>
                      !previous
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


          
<div className="auth-forgot-card">
  <div className="auth-forgot-icon">
    <LockKeyhole size={16} />
  </div>

  <div className="auth-forgot-content">
    <span>Forgot your password?</span>
    <small>Reset it securely</small>
  </div>

  <button
    type="button"
    className="auth-forgot-action"
    onClick={() => {
      setError(
        "Password recovery will be available soon."
      );
    }}
  >
    Reset
  </button>
</div>



          {/* LOGIN */}

          <button
            type="submit"
            className="auth-submit-button"
            disabled={loading}
          >

            {loading ? (
              <span className="auth-loading">
                Signing in...
              </span>
            ) : (
              <>
                <span>
                  Sign in
                </span>

                <ArrowRight size={18} />
              </>
            )}

          </button>

        </form>


        {/* SIGN UP */}

        <div className="auth-switch">

          <span>
            Don't have an account?
          </span>

          <Link to="/signup">
            Create one
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

export default CustomerLogin;


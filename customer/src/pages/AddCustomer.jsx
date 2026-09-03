import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  UserPlus,
  Save,
  Phone,
  Send,
  MapPin,
  FileText,
  User,
  CalendarDays,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function AddCustomer() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    customer_type: "one_time",
    phone: "",
    telegram: "",
    address: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");

    if (!form.full_name.trim()) {
      setError("Please enter the customer's name.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/customers`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to create customer."
        );
      }

      navigate("/customers");

    } catch (err) {
      console.error(
        "Create customer error:",
        err
      );

      setError(
        err.message ||
          "Failed to create customer."
      );

    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-customer-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="add-customer-header">

        <button
          type="button"
          className="back-button"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft size={17} />
          Back to Customers
        </button>

        <div className="add-customer-title">

          <div className="add-customer-title-icon">
            <UserPlus size={22} />
          </div>

          <div>
            <p className="eyebrow">
              CUSTOMER MANAGEMENT
            </p>

            <h1>
              Add Customer
            </h1>

            <p>
              Create a customer profile for YN Studio.
            </p>
          </div>

        </div>

      </div>


      {/* =====================================================
          FORM
      ===================================================== */}

      <form
        className="add-customer-form"
        onSubmit={handleSubmit}
      >

        {/* ===================================================
            BASIC INFORMATION
        =================================================== */}

        <section className="customer-form-card">

          <div className="customer-form-card-header">

            <div className="section-number">
              01
            </div>

            <div>
              <h2>
                Basic Information
              </h2>

              <p>
                Start with the customer's basic details.
              </p>
            </div>

          </div>


          <div className="customer-form-body">

            {/* NAME */}

            <div className="form-field form-field-full">

              <label>
                Customer Name
                <span>*</span>
              </label>

              <div className="input-with-icon">

                <User size={17} />

                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="e.g. Sok Dara"
                  autoFocus
                />

              </div>

            </div>


            {/* CUSTOMER TYPE */}

            <div className="form-field form-field-full">

              <label>
                Customer Type
              </label>

              <div className="customer-type-grid">

                {/* ONE TIME */}

                <button
                  type="button"
                  className={
                    form.customer_type ===
                    "one_time"
                      ? "customer-type-card active"
                      : "customer-type-card"
                  }
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      customer_type: "one_time",
                    }))
                  }
                >

                  <div className="customer-type-icon">
                    <User size={19} />
                  </div>

                  <div className="customer-type-content">

                    <strong>
                      One-time Customer
                    </strong>

                    <span>
                      Individual orders and services
                    </span>

                  </div>

                  <div className="customer-type-radio">
                    {form.customer_type ===
                    "one_time" && (
                      <div />
                    )}
                  </div>

                </button>


                {/* MONTHLY */}

                <button
                  type="button"
                  className={
                    form.customer_type ===
                    "monthly"
                      ? "customer-type-card active"
                      : "customer-type-card"
                  }
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      customer_type: "monthly",
                    }))
                  }
                >

                  <div className="customer-type-icon">
                    <CalendarDays size={19} />
                  </div>

                  <div className="customer-type-content">

                    <strong>
                      Monthly Customer
                    </strong>

                    <span>
                      Recurring design and printing services
                    </span>

                  </div>

                  <div className="customer-type-radio">
                    {form.customer_type ===
                    "monthly" && (
                      <div />
                    )}
                  </div>

                </button>

              </div>

            </div>

          </div>

        </section>


        {/* ===================================================
            CONTACT INFORMATION
        =================================================== */}

        <section className="customer-form-card">

          <div className="customer-form-card-header">

            <div className="section-number">
              02
            </div>

            <div>
              <h2>
                Contact Information
              </h2>

              <p>
                Add contact details so you can reach your customer.
              </p>
            </div>

          </div>


          <div className="customer-form-body customer-form-grid">

            {/* PHONE */}

            <div className="form-field">

              <label>
                Phone
              </label>

              <div className="input-with-icon">

                <Phone size={17} />

                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Phone number"
                />

              </div>

            </div>


            {/* TELEGRAM */}

            <div className="form-field">

              <label>
                Telegram
              </label>

              <div className="input-with-icon">

                <Send size={17} />

                <input
                  type="text"
                  name="telegram"
                  value={form.telegram}
                  onChange={handleChange}
                  placeholder="@username"
                />

              </div>

            </div>


           

            {/* ADDRESS */}

            <div className="form-field">

              <label>
                Address
              </label>

              <div className="input-with-icon">

                <MapPin size={17} />

                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Customer address"
                />

              </div>

            </div>

          </div>

        </section>


        {/* ===================================================
            NOTES
        =================================================== */}

        <section className="customer-form-card">

          <div className="customer-form-card-header">

            <div className="section-number">
              03
            </div>

            <div>
              <h2>
                Notes
              </h2>

              <p>
                Add anything important about this customer.
              </p>
            </div>

          </div>


          <div className="customer-form-body">

            <div className="form-field form-field-full">

              <label>
                Customer Notes
              </label>

              <div className="textarea-with-icon">

                <FileText size={17} />

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Add notes about this customer..."
                  rows={5}
                />

              </div>

            </div>

          </div>

        </section>


        {/* ===================================================
            ERROR
        =================================================== */}

        {error && (
          <div className="customer-form-error">
            {error}
          </div>
        )}


        {/* ===================================================
            FOOTER ACTIONS
        =================================================== */}

        <div className="customer-form-actions">

          <button
            type="button"
            className="form-cancel-button"
            onClick={() =>
              navigate("/customers")
            }
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="form-save-button"
            disabled={saving}
          >

            <Save size={17} />

            {saving
              ? "Creating..."
              : "Create Customer"}

          </button>

        </div>

      </form>

    </div>
  );
}

export default AddCustomer;
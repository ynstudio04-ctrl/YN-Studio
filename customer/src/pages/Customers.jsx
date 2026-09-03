import { useEffect, useState } from "react";

import {
  Search,
  Plus,
  Users,
  ArrowRight,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Customers() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const res = await fetch(`${API_URL}/customers`);

      if (!res.ok) {
        throw new Error("Failed to load customers");
      }

      const data = await res.json();
      setCustomers(data);
    } catch (err) {
      console.error("Failed to load customers:", err);
    }
  }

  const filtered = customers.filter((customer) =>
    customer.full_name
      ?.toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="customers-page">

      {/* HEADER */}
      <div className="customers-header">

        <div>
          <p className="customers-eyebrow">
            CLIENT MANAGEMENT
          </p>

          <h1>Customers</h1>

          <p className="customers-subtitle">
            Manage your YN Studio customers and their services.
          </p>
        </div>

        <button
          className="customers-primary-button"
          onClick={() => navigate("/customers/new")}
        >
          <Plus size={17} />
          Add Customer
        </button>

      </div>


      {/* SEARCH CARD */}
      <div className="customers-search-card">

        <div className="customers-search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

      </div>


      {/* COUNT CARD */}
      <div className="customers-count-card">

        <div className="customers-count-icon">
          <Users size={20} />
        </div>

        <div className="customers-count-info">
          <strong>{filtered.length}</strong>

          <span>
            {filtered.length === 1
              ? "Customer"
              : "Customers"}
          </span>
        </div>

      </div>


      {/* CUSTOMER LIST */}
      <div className="customers-list">

        {filtered.length === 0 ? (

          <div className="customers-empty-card">

            <div className="customers-empty-icon">
              <Users size={25} />
            </div>

            <h2>No customers found</h2>

            <p>
              {search
                ? "Try a different search."
                : "Add your first customer to get started."}
            </p>

            {!search && (
              <button
                className="customers-secondary-button"
                onClick={() =>
                  navigate("/customers/new")
                }
              >
                <Plus size={16} />
                Add Customer
              </button>
            )}

          </div>

        ) : (

          filtered.map((customer) => (

            <div
              className="customer-floating-card"
              key={customer.id}
              onClick={() =>
                navigate(`/customers/${customer.id}`)
              }
            >

              <div className="customer-avatar">
                {customer.full_name
                  ?.charAt(0)
                  .toUpperCase()}
              </div>

              <div className="customer-info">

                <div className="customer-name">
                  {customer.full_name}
                </div>

                <div className="customer-code">
                  {customer.customer_code}
                </div>

              </div>

              <div className="customer-type">
                {customer.customer_type === "monthly"
                  ? "Monthly"
                  : "One-time"}
              </div>

              <div className="customer-arrow">
                <ArrowRight size={18} />
              </div>

            </div>

          ))

        )}

      </div>

    </div>
  );
}

export default Customers;
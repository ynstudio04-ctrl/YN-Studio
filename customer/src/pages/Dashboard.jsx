import { useEffect, useState } from "react";

import {
  Users,
  BriefcaseBusiness,
  ShoppingBag,
  Receipt,
  ArrowUpRight,
  Plus,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    customers: 0,
    services: 0,
    orders: 0,
    receipts: 0,
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const token = localStorage.getItem("yn_token");

      const response = await fetch(
        `${API_URL}/api/dashboard`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error(
        "Failed to load dashboard:",
        error
      );
    }
  }

  const cards = [
    {
      title: "Customers",
      value: stats.customers,
      icon: Users,
      description: "Total customers",
      path: "/customers",
    },
    {
      title: "Services",
      value: stats.services,
      icon: BriefcaseBusiness,
      description: "Active services",
      path: "/services",
    },
    {
      title: "Orders",
      value: stats.orders,
      icon: ShoppingBag,
      description: "Total orders",
      path: "/orders",
    },
    {
      title: "Receipts",
      value: stats.receipts,
      icon: Receipt,
      description: "Generated receipts",
      path: "/receipts",
    },
  ];

  const hasCustomers = stats.customers > 0;

  return (
    <div className="page-content">

      {/* HEADER */}

      <div className="page-heading">

        <div>
          <p className="eyebrow">
            OVERVIEW
          </p>

          <h1>
            Dashboard
          </h1>

          <p>
            Welcome back. Here's what's happening
            with YN Studio.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("/receipts")}
        >
          Create Receipt
          <ArrowUpRight size={17} />
        </button>

      </div>


      {/* STATS */}

      <section className="stats-grid">

        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              className="stat-card"
              key={card.title}
              onClick={() => navigate(card.path)}
              style={{
                cursor: "pointer",
              }}
            >

              <div className="stat-top">

                <div className="stat-icon">
                  <Icon size={20} />
                </div>

                <ArrowUpRight size={17} />

              </div>

              <div className="stat-value">
                {card.value}
              </div>

              <div className="stat-title">
                {card.title}
              </div>

              <div className="stat-description">
                {card.description}
              </div>

            </div>
          );
        })}

      </section>


      {/* WORKSPACE */}

      <section className="dashboard-empty">

        <div className="empty-icon">

          {hasCustomers ? (
            <Users size={25} />
          ) : (
            <ShoppingBag size={25} />
          )}

        </div>

        {hasCustomers ? (
          <>

            <h2>
              Your workspace is active
            </h2>

            <p>
              You currently have{" "}
              <strong>
                {stats.customers}
              </strong>{" "}
              {stats.customers === 1
                ? "customer"
                : "customers"}{" "}
              in your YN Studio workspace.
            </p>

            <button
              className="secondary-button"
              onClick={() =>
                navigate("/customers")
              }
            >
              <Users size={16} />
              View Customers
            </button>

          </>
        ) : (
          <>

            <h2>
              Your workspace is ready
            </h2>

            <p>
              Customers, services, orders and
              receipts will appear here as you
              start using YN Studio.
            </p>

            <button
              className="secondary-button"
              onClick={() =>
                navigate("/customers")
              }
            >
              <Plus size={16} />
              Add your first customer
            </button>

          </>
        )}

      </section>

    </div>
  );
}

export default Dashboard;
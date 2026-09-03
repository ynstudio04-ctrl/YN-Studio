import { useEffect, useState } from "react";

import {
  Users,
  BriefcaseBusiness,
  ShoppingBag,
  Receipt,
  ArrowUpRight,
  Plus,
  UsersRound,
  PackageCheck,
  CreditCard,
  Settings2,
  ArrowRight,
  Sparkles,
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

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const token = localStorage.getItem("yn_token");

    // No login token
    if (!token) {
      localStorage.removeItem("yn_token");
      localStorage.removeItem("yn_user");
      navigate("/login", { replace: true });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      /*
       * Both 401 and 403 mean that the current authentication
       * cannot access the protected dashboard.
       */
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("yn_token");
        localStorage.removeItem("yn_user");

        navigate("/login", { replace: true });
        return;
      }

      let data;

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Dashboard request failed: ${response.status}`
        );
      }

      if (data.success && data.stats) {
        setStats({
          customers: Number(data.stats.customers) || 0,
          services: Number(data.stats.services) || 0,
          orders: Number(data.stats.orders) || 0,
          receipts: Number(data.stats.receipts) || 0,
        });
      }
    } catch (error) {
      console.error("Failed to load dashboard:", error);
    } finally {
      setLoading(false);
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
          <p className="eyebrow">OVERVIEW</p>

          <h1>Dashboard</h1>

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
                {loading ? "—" : card.value}
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
      <section className="dashboard-v2-grid">
        <div className="dashboard-v2-main">
          <div className="dashboard-v2-panel">
            <div className="dashboard-v2-panel-head">
              <div>
                <span className="dashboard-v2-kicker">WORKSPACE</span>
                <h2>Everything in one place</h2>
                <p>Jump straight into the areas you use most.</p>
              </div>
              <div className="dashboard-v2-live"><span /> System ready</div>
            </div>

            <div className="dashboard-v2-actions">
              {[
                ["Customers", "Manage customer accounts", UsersRound, "/customers"],
                ["Orders", "Track and process orders", PackageCheck, "/orders"],
                ["Payments", "Review payment requests", CreditCard, "/payments"],
                ["Settings", "Configure YN Studio", Settings2, "/settings"],
              ].map(([title, description, Icon, path]) => (
                <button key={path} className="dashboard-v2-action" onClick={() => navigate(path)}>
                  <span className="dashboard-v2-action-icon"><Icon size={19} /></span>
                  <span className="dashboard-v2-action-copy"><strong>{title}</strong><small>{description}</small></span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="dashboard-v2-panel dashboard-v2-status">
            <div className="dashboard-v2-panel-head compact">
              <div><span className="dashboard-v2-kicker">TODAY</span><h2>Workspace status</h2></div>
              <span className="dashboard-v2-count">{hasCustomers ? "Active" : "Ready"}</span>
            </div>
            <div className="dashboard-v2-status-row">
              <div><span>Customers</span><strong>{loading ? "—" : stats.customers}</strong></div>
              <div><span>Services</span><strong>{loading ? "—" : stats.services}</strong></div>
              <div><span>Orders</span><strong>{loading ? "—" : stats.orders}</strong></div>
              <div><span>Receipts</span><strong>{loading ? "—" : stats.receipts}</strong></div>
            </div>
          </div>
        </div>

        <aside className="dashboard-v2-side">
          <div className="dashboard-v2-tip">
            <div className="dashboard-v2-tip-icon"><Sparkles size={18} /></div>
            <span>YN STUDIO</span>
            <h3>Keep your workflow simple.</h3>
            <p>Use the sidebar to manage customers, orders, finance and imports without leaving your workspace.</p>
            <button onClick={() => navigate("/customers")}>Open customers <ArrowUpRight size={15} /></button>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Dashboard;
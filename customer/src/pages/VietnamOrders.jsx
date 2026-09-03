import React from "react";

export default function VietnamOrders() {
  return (
    <div className="orders-page">
      <div className="orders-header">
        <div>
          <h1>Vietnam Orders</h1>
          <p>Manage and track orders coming from Vietnam.</p>
        </div>

        <button className="purple-button">+ New Order</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total Orders</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Pending</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Processing</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Completed</span>
          <strong>0</strong>
        </div>
      </div>

      <div className="orders-card">
        <div className="card-top">
          <div>
            <h2>Vietnam Orders</h2>
            <p>Your Vietnam order list will appear here.</p>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input placeholder="Search orders..." />
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-icon">VN</div>
          <h3>No Vietnam Orders Yet</h3>
          <p>
            Vietnam orders will appear here once they are created.
          </p>

          <button className="purple-button">Create First Order</button>
        </div>
      </div>
    </div>
  );
}
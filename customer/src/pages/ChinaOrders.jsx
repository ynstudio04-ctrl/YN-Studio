import React from "react";

export default function ChinaOrders() {
  return (
    <div className="orders-page">
      <div className="orders-header">
        <div>
          <h1>China Orders</h1>
          <p>Manage and track orders coming from China.</p>
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
            <h2>China Orders</h2>
            <p>Your China order list will appear here.</p>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input placeholder="Search orders..." />
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-icon">CN</div>
          <h3>No China Orders Yet</h3>
          <p>
            China orders will appear here once they are created.
          </p>

          <button className="purple-button">Create First Order</button>
        </div>
      </div>
    </div>
  );
}
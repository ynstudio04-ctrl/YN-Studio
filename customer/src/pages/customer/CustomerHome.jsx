import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, UserRound, BadgeCheck, ShoppingBag, Wallet,
  Receipt, Package, ChevronRight, Home, ClipboardList, CreditCard,
  ArrowRight, Ticket,
} from "lucide-react";
import "./CustomerHome.css";
import { customerRequest } from "../../lib/api";
import { useCustomerTheme } from "../../components/CustomerTheme";

function CustomerHome() {
  const navigate = useNavigate();
  const { theme } = useCustomerTheme();
  const [customer, setCustomer] = useState(null);
  const [loan, setLoan] = useState(null);
  const [recentOrder, setRecentOrder] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadCustomerData() {
      try {
        const data = await customerRequest("/api/customer/me");
        if (!mounted) return;
        const currentCustomer = data?.customer || data;
        if (!currentCustomer) return;
        setCustomer(currentCustomer);
        localStorage.setItem("customerUser", JSON.stringify(currentCustomer));
        try {
          const orderData = await customerRequest("/api/customer/orders");
          const orders = Array.isArray(orderData?.orders) ? orderData.orders : [];
          if (mounted) setRecentOrder(orders[0] || null);
        } catch (e) { console.error("Failed to load recent order:", e); }
        if (currentCustomer.id) {
          try {
            const loanData = await customerRequest(`/loans/customer/${currentCustomer.id}`);
            if (mounted) setLoan(loanData);
          } catch (e) { if (mounted) setLoan(null); }
          try {
            const walletResponse = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/wallet/${currentCustomer.id}`);
            const walletData = await walletResponse.json();
            if (mounted && walletResponse.ok) setWalletBalance(Number(walletData?.balance) || 0);
          } catch (e) { if (mounted) setWalletBalance(0); }
        }
      } catch (error) {
        console.error("Failed to load customer:", error);
        try {
          const savedCustomer = JSON.parse(localStorage.getItem("customerUser") || "null");
          if (!savedCustomer || !mounted) return;
          setCustomer(savedCustomer);
          try {
            const orderData = await customerRequest("/api/customer/orders");
            const orders = Array.isArray(orderData?.orders) ? orderData.orders : [];
            if (mounted) setRecentOrder(orders[0] || null);
          } catch (e) {}
          if (savedCustomer.id) {
            try {
              const loanData = await customerRequest(`/loans/customer/${savedCustomer.id}`);
              if (mounted) setLoan(loanData);
            } catch (e) { if (mounted) setLoan(null); }
            try {
              const walletResponse = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/wallet/${savedCustomer.id}`);
              const walletData = await walletResponse.json();
              if (mounted && walletResponse.ok) setWalletBalance(Number(walletData?.balance) || 0);
            } catch (e) { if (mounted) setWalletBalance(0); }
          }
        } catch (e) { console.error("Failed to read saved customer:", e); }
      }
    }
    loadCustomerData();
    return () => { mounted = false; };
  }, []);

  const customerName = customer?.name || customer?.full_name || customer?.first_name || "Customer";
  const customerCode = customer?.customer_code || customer?.code || "";
  const loanEnabled = loan?.enabled === true || loan?.enabled === 1 || loan?.enabled === "1";
  const totalLoan = Number(loan?.total_amount || loan?.loan_amount || loan?.principal || 0);
  const paidAmount = Number(loan?.paid_amount || loan?.amount_paid || loan?.paid || 0);
  const remainingBalance = Number(loan?.remaining || loan?.remaining_balance || loan?.principal_remaining || Math.max(0, totalLoan - paidAmount));
  const loanProgress = totalLoan > 0 ? Math.min(100, Math.max(0, (paidAmount / totalLoan) * 100)) : 0;
  const isUsagi = theme === "usagi";
  const isChiikawa = theme === "chiikawa";
  const art = (kind) => {
    if (isUsagi) {
      const usagiArt = {
        header: "/themes/usagi-header-reference.png",
        hero: "/themes/usagi-hero-reference.png",
        verification: "/themes/usagi-verification-reference.png",
        orders: "/themes/usagi-orders-reference.png",
        wallet: "/themes/usagi-wallet-reference.png",
        coupon: "/themes/usagi-coupon-reference.png",
        recent: "/themes/usagi-recent-reference.png",
        profile: "/themes/usagi-profile-reference.png",
      };
      return usagiArt[kind] || usagiArt.hero;
    }
    if (isChiikawa) return kind === "group" ? "/themes/chiikawa-group.webp" : kind === "alt" ? "/themes/chiikawa-alt.png" : "/themes/chiikawa-main.png";
    return null;
  };
  const go = (path) => navigate(path);

  return (
    <div className={`customer-home-page ${theme !== "default" ? "customer-themed-home" : ""}`}>
      <header className="customer-home-header themed-card">
        <div className="customer-header-left">
          {isUsagi && <img className="customer-header-usagi" src={art("header")} alt="" />}
          <button type="button" className="customer-profile-button" onClick={() => go("/customer/profile")}>
            {customer?.profile_image || customer?.avatar ? <img src={customer.profile_image || customer.avatar} alt="Profile" /> : <UserRound size={20} />}
          </button>
          <div className="customer-header-copy">
            <span className="customer-header-small">Welcome back,</span>
            <strong className="customer-header-name">{customerName}</strong>
          </div>
        </div>
        <button type="button" className="customer-notification-button" onClick={() => go("/customer/notifications")} aria-label="Notifications">
          <Bell size={21} /><span className="customer-notification-dot" />
        </button>
      </header>

      <section className={`customer-welcome-section ${isUsagi ? "usagi-welcome" : ""}`}>
        <div className="welcome-copy">
          <span>YN STUDIO</span>
          <h1>What can<br />we help you<br />with today?</h1>
          <div className="customer-hero-balance"><span>Wallet balance</span><strong>${walletBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
        </div>
        {theme !== "default" && <img className="welcome-character" src={art(isUsagi ? "hero" : "group")} alt="" />}
      </section>

      {customerCode && (
        <section className={`customer-verification-card themed-card ${isUsagi ? "usagi-verification" : ""}`}>
          {theme !== "default" && <img className="mini-character" src={art(isUsagi ? "verification" : "alt")} alt="" />}
          <div className="customer-verification-icon"><BadgeCheck size={21} /></div>
          <div className="customer-verification-info"><span>CUSTOMER ID</span><strong>{customerCode}</strong></div>
          <BadgeCheck size={24} className="customer-verification-check" />
        </section>
      )}

      <section className="customer-main-shortcuts">
        <button type="button" className={`customer-main-shortcut order-card ${isUsagi ? "usagi-order-card" : ""}`} onClick={() => go("/customer/orders")}>
          <div className="customer-main-shortcut-icon"><ShoppingBag size={22} /></div>
          <div><strong>My Orders</strong><span>Track your orders</span></div>
          {theme !== "default" && <img className="shortcut-character" src={art(isUsagi ? "orders" : "main")} alt="" />}
          <ChevronRight size={19} />
        </button>
        <button type="button" className={`customer-main-shortcut wallet-card ${isUsagi ? "usagi-wallet-card" : ""}`} onClick={() => go("/customer/wallet")}>
          <div className="customer-main-shortcut-icon"><Wallet size={22} /></div>
          <div><strong>My Wallet</strong><span>${walletBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} available</span></div>
          {theme !== "default" && <img className="shortcut-character wallet-art" src={art(isUsagi ? "wallet" : "main")} alt="" />}
          <ChevronRight size={19} />
        </button>
      </section>

      {loanEnabled && remainingBalance > 0 && (
        <button type="button" className="customer-loan-banner" onClick={() => go("/customer/loan")}>
          <div className="customer-loan-banner-top"><div className="customer-loan-banner-title"><div className="customer-loan-banner-icon"><CreditCard size={19} /></div><div><span>MY LOAN</span><strong>Active loan</strong></div></div><ArrowRight size={18} /></div>
          <div className="customer-loan-banner-balance"><span>Remaining balance</span><strong>${remainingBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
          <div className="customer-loan-progress"><div className="customer-loan-progress-fill" style={{width:`${loanProgress}%`}} /></div>
          <div className="customer-loan-banner-bottom"><span>${paidAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} paid</span><span>{Math.round(loanProgress)}%</span></div>
        </button>
      )}

      <section className="customer-section">
        <div className="customer-section-header"><h2>Quick Actions</h2></div>
        <div className="customer-quick-actions">
          {[
            ["Orders", ShoppingBag, "/customer/orders"],
            ["Requests", ClipboardList, "/customer/requests"],
            ["Wallet", Wallet, "/customer/wallet"],
            ["Receipts", Receipt, "/customer/receipts"],
            ["Coupons", Ticket, "/customer/coupons"],
          ].map(([label, Icon, path], i) => (
            <button key={label} type="button" className={`customer-quick-action action-${i}`} onClick={() => go(path)}>
              <div className="customer-quick-action-icon"><Icon size={21} /></div><span>{label}</span>
              {theme !== "default" && (isUsagi ? (i === 4 && <img src={art("coupon")} alt="" />) : <img src={art(i % 2 === 0 ? "alt" : "main")} alt="" />)}
            </button>
          ))}
        </div>
      </section>

      <section className={`customer-section recent-section ${isUsagi ? "usagi-recent-section" : ""}`}>
        <div className="customer-section-header"><h2>Recent Order</h2><button type="button" onClick={() => go("/customer/orders")}>View all <ChevronRight size={15} /></button></div>
        {recentOrder ? (
          <button type="button" className="customer-empty-order customer-recent-order-button" onClick={() => go(`/customer/orders/${recentOrder.id}`)}>
            <div className="customer-empty-order-icon"><Package size={24} /></div>
            <div><strong>Order #{recentOrder.public_order_number || recentOrder.id}</strong><span>{recentOrder.service_name || "YN Studio Order"}</span><span>Status: {String(recentOrder.status || "pending").replaceAll("_", " ")}</span></div>
            <strong>${Number(recentOrder.total || 0).toFixed(2)}</strong><ChevronRight size={18} />
          </button>
        ) : <div className="customer-empty-order"><div className="customer-empty-order-icon"><Package size={24} /></div><strong>No recent orders</strong><span>Your latest order will appear here</span></div>}
        {theme !== "default" && <div className="recent-character-strip"><img src={art(isUsagi ? "recent" : "group")} alt="" /><span>{isUsagi ? "Usagi says: let's go!" : "Yatta!"}</span></div>}
      </section>

      <nav className="customer-bottom-nav legacy-home-bottom-nav">
        <button type="button" className="customer-bottom-nav-item active" onClick={() => go("/home")}><Home size={20}/><span>Home</span></button>
        <button type="button" className="customer-bottom-nav-item" onClick={() => go("/customer/orders")}><ShoppingBag size={20}/><span>Orders</span></button>
        <button type="button" className="customer-bottom-nav-item" onClick={() => go("/customer/wallet")}><Wallet size={20}/><span>Wallet</span></button>
        <button type="button" className="customer-bottom-nav-item" onClick={() => go("/customer/profile")}><UserRound size={20}/><span>Profile</span>{theme !== "default" && <img src={art(isUsagi ? "profile" : "main")} alt="" />}</button>
      </nav>
    </div>
  );
}
export default CustomerHome;

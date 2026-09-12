import React, { useEffect, useState } from "react";
import { ArrowLeft, Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { customerRequest } from "../../lib/api";

function CustomerNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadNotifications() {
    try {
      setLoading(true);
      const data = await customerRequest("/api/customer/notifications");
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch (error) {
      console.error("LOAD NOTIFICATIONS ERROR:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadNotifications(); }, []);

  async function markRead(id) {
    try {
      await customerRequest(`/api/customer/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
    } catch (error) {
      console.error("MARK NOTIFICATION ERROR:", error);
    }
  }

  async function markAllRead() {
    try {
      setBusy(true);
      await customerRequest("/api/customer/notifications/read-all", { method: "PATCH" });
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    } catch (error) {
      console.error("MARK ALL NOTIFICATIONS ERROR:", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf7ff", paddingBottom: 30 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 14px", background: "#fff", borderBottom: "1px solid #eee7f8", position: "sticky", top: 0, zIndex: 2 }}>
        <button type="button" onClick={() => navigate("/home")} style={{ border: 0, background: "transparent", cursor: "pointer" }}><ArrowLeft size={21} /></button>
        <div style={{ textAlign: "center" }}><span style={{ display: "block", fontSize: 11, letterSpacing: 2, color: "#8b5cf6" }}>YN STUDIO</span><strong style={{ fontSize: 18 }}>Notifications</strong></div>
        <button type="button" onClick={markAllRead} disabled={busy} title="Mark all as read" style={{ border: 0, background: "transparent", color: "#7c3aed", cursor: "pointer" }}><CheckCheck size={20} /></button>
      </header>

      <main style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><div style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: "#ede9fe", color: "#7c3aed" }}><Bell size={21} /></div><div><h1 style={{ margin: 0, fontSize: 22 }}>Your updates</h1><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Order, wallet, coupon and account activity.</p></div></div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /><p>Loading notifications...</p></div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 42, textAlign: "center", background: "#fff", borderRadius: 20, border: "1px solid #eee7f8" }}><Bell size={28} color="#8b5cf6" /><h3>No notifications yet</h3><p style={{ color: "#64748b" }}>We'll show important updates here.</p></div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {notifications.map((item) => (
              <button key={item.id} type="button" onClick={() => !item.read && markRead(item.id)} style={{ textAlign: "left", display: "flex", gap: 13, padding: 16, borderRadius: 18, border: `1px solid ${item.read ? "#eee7f8" : "#ddd6fe"}`, background: item.read ? "#fff" : "#faf5ff", cursor: item.read ? "default" : "pointer" }}>
                <div style={{ flex: "0 0 auto", width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: item.read ? "#f1f5f9" : "#ede9fe", color: "#7c3aed" }}>{item.read ? <Check size={18} /> : <Bell size={18} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", marginBottom: 4 }}>{item.title}</strong><span style={{ display: "block", color: "#475569", fontSize: 14, lineHeight: 1.45 }}>{item.message}</span><small style={{ display: "block", marginTop: 7, color: "#94a3b8" }}>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</small></div>
                {!item.read && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#7c3aed", marginTop: 6 }} />}
              </button>
            ))}
          </div>
        )}
      </main>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default CustomerNotifications;

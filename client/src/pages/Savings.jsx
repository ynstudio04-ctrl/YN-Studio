import { useEffect, useState } from "react";
import { Check, Clock3, Image, RefreshCw, Target, X } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function openSavingProof(id) {
  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/admin/savings/payments/${id}/proof`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    if (!response.ok || !data.proof) throw new Error(data.message || "Unable to load payment proof.");
    window.open(data.proof, "_blank", "noopener,noreferrer");
  } catch (e) {
    alert(e.message || "Unable to load payment proof.");
  }
}

export default function Savings() {
  const [data, setData] = useState({ payments: [], requests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [adminNote, setAdminNote] = useState("");

  async function load() {
    try {
      setLoading(true); setError("");
      const token = localStorage.getItem("yn_token");
      const r = await fetch(`${API_URL}/admin/savings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error || "Failed to load savings.");
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function action(kind, id, approve) {
    try {
      setBusy(`${kind}-${id}`);
      const token = localStorage.getItem("yn_token");
      if (!token) throw new Error("Admin session expired. Please log in again.");
      const note = approve ? "" : (window.prompt("Optional rejection note:", adminNote) || "").trim();
      const r = await fetch(`${API_URL}/admin/savings/${kind}/${id}/${approve ? "approve" : "reject"}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ admin_note: note || null }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.message || d.error || "Action failed.");
      setAdminNote("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  const pendingPayments = (data.payments || []).filter(p => p.status === "pending");
  const pendingRequests = (data.requests || []).filter(r => r.status === "pending");

  return <div className="page-shell savings-admin-page">
    <div className="page-header"><div><p className="eyebrow">FINANCE</p><h1>Saving Goals</h1><span>Review saving deposits and customer withdrawal/order requests.</span></div><button className="icon-button" onClick={load}><RefreshCw size={18}/></button></div>
    {error && <div className="error-banner">{error}</div>}
    {loading ? <div className="empty-state"><Clock3 size={24}/>Loading...</div> : <>
      <section className="admin-card"><div className="card-heading"><div><h2>Saving Payments</h2><span>{pendingPayments.length} pending</span></div></div>{pendingPayments.length===0?<div className="empty-state">No pending saving payments.</div>:pendingPayments.map(p=><div className="admin-row" key={p.id}><div className="row-icon"><Target size={18}/></div><div className="row-main"><strong>{p.customer_name} · {p.saving_name}</strong><span>{p.customer_code} · {p.payment_method || "payment"} · ${Number(p.amount).toFixed(2)}</span></div><div className="row-actions"><button onClick={()=>openSavingProof(p.id)} title="View proof"><Image size={16}/></button><button disabled={busy===`payments-${p.id}`} onClick={()=>action("payments",p.id,true)}><Check size={16}/></button><button disabled={busy===`payments-${p.id}`} onClick={()=>action("payments",p.id,false)}><X size={16}/></button></div></div>)}</section>
      <section className="admin-card"><div className="card-heading"><div><h2>Use Savings Requests</h2><span>{pendingRequests.length} pending</span></div></div>{pendingRequests.length===0?<div className="empty-state">No pending withdrawal or order requests.</div>:pendingRequests.map(r=><div className="admin-row" key={r.id}><div className="row-icon"><Target size={18}/></div><div className="row-main"><strong>{r.customer_name} · {r.saving_name}</strong><span>{r.request_type === "order" ? "Make an order" : "Withdrawal"} · ${Number(r.amount).toFixed(2)}{r.note ? ` · ${r.note}` : ""}</span>{r.qr_code && <small>Payment details: {r.qr_code}</small>}</div><div className="row-actions"><button disabled={busy===`requests-${r.id}`} onClick={()=>action("requests",r.id,true)}><Check size={16}/></button><button disabled={busy===`requests-${r.id}`} onClick={()=>action("requests",r.id,false)}><X size={16}/></button></div></div>)}</section>
    </>}
  </div>;
}

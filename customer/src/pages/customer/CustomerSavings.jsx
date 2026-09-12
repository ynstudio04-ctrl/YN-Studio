import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Image, Link2, Plus, RefreshCw, Smartphone, Target, Upload, WalletCards, X, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_URL, customerRequest } from "../../lib/api";
import QRCode from "../../assets/QR.PNG";
import "./CustomerSavings.css";

function money(v) { return `$${Number(v || 0).toFixed(2)}`; }

export default function CustomerSavings() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [savings, setSavings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showAdd, setShowAdd] = useState(null);
  const [showRequest, setShowRequest] = useState(null);
  const [form, setForm] = useState({ name: "", target_amount: "", product_link: "", product_image: "" });
  const [addForm, setAddForm] = useState({ amount: "", payment_method: "", proof: null });
  const [requestForm, setRequestForm] = useState({ request_type: "withdrawal", amount: "", qr_code: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [fetchingImage, setFetchingImage] = useState(false);

  async function load() {
    try {
      setLoading(true); setError("");
      const [s, r] = await Promise.all([
        customerRequest("/api/customer/savings"),
        customerRequest("/api/customer/savings/requests")
      ]);
      setSavings(s.savings || []); setRequests(r.requests || []);
    } catch (e) { setError(e.message || "Unable to load savings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function fetchImage() {
    if (!form.product_link.trim()) return;
    try {
      setFetchingImage(true); setError("");
      const data = await customerRequest("/api/customer/savings/image", { method: "POST", body: JSON.stringify({ url: form.product_link.trim() }) });
      setForm(f => ({ ...f, product_image: data.image || "" }));
    } catch (e) { setError(e.message || "Could not get the item image."); }
    finally { setFetchingImage(false); }
  }

  async function createSaving(e) {
    e.preventDefault();
    try {
      setBusy(true); setError("");
      await customerRequest("/api/customer/savings", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", target_amount: "", product_link: "", product_image: "" });
      setShowCreate(false); await load();
    } catch (e) { setError(e.message || "Could not create saving."); }
    finally { setBusy(false); }
  }

  async function addMoney(e) {
    e.preventDefault();
    if (!showAdd) return;
    try {
      setBusy(true); setError("");
      const fd = new FormData();
      fd.append("amount", addForm.amount); fd.append("payment_method", addForm.payment_method); fd.append("payment_proof", addForm.proof);
      await customerRequest(`/api/customer/savings/${showAdd.id}/payment`, { method: "POST", body: fd });
      setAddForm({ amount: "", payment_method: "", proof: null }); setShowAdd(null); await load();
    } catch (e) { setError(e.message || "Saving payment failed."); }
    finally { setBusy(false); }
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!showRequest) return;
    try {
      setBusy(true); setError("");
      await customerRequest(`/api/customer/savings/${showRequest.id}/request`, { method: "POST", body: JSON.stringify(requestForm) });
      setRequestForm({ request_type: "withdrawal", amount: "", qr_code: "", note: "" }); setShowRequest(null); await load();
    } catch (e) { setError(e.message || "Could not submit request."); }
    finally { setBusy(false); }
  }

  const active = useMemo(() => savings.filter(s => s.status !== "withdrawn"), [savings]);

  return <div className="customer-savings-page">
    <header className="savings-header">
      <button onClick={() => navigate("/customer/wallet")} aria-label="Back"><ArrowLeft size={20}/></button>
      <div><strong>Saving Goals</strong><span>Save for something you want</span></div>
      <button onClick={load} aria-label="Refresh"><RefreshCw size={18}/></button>
    </header>

    <main className="savings-content">
      {error && <div className="savings-error"><XCircle size={17}/>{error}</div>}
      <section className="savings-intro">
        <div className="savings-intro-icon"><Target size={25}/></div>
        <div><h1>Save for your next purchase</h1><p>Paste a Taobao, Pinduoduo, or Shein link if you want the app to find the item image. You enter the name and price yourself.</p></div>
      </section>
      <button className="savings-create" onClick={() => setShowCreate(true)}><Plus size={20}/><span><b>Create a saving</b><small>Start a new goal</small></span></button>

      {loading ? <div className="savings-empty"><Clock3 size={22}/>Loading your savings...</div> : active.length === 0 ? <div className="savings-empty"><Target size={25}/><b>No saving goals yet</b><span>Create one for anything you're planning to buy.</span></div> : <div className="saving-list">
        {active.map(s => {
          const current = Number(s.current_amount || 0), target = Number(s.target_amount || 0), percent = target ? Math.min(100, current / target * 100) : 0;
          return <article className="saving-card" key={s.id}>
            {s.product_image ? <img src={s.product_image} alt="" className="saving-image" onError={e => { e.currentTarget.style.display="none"; }}/> : <div className="saving-image-placeholder"><Image size={24}/></div>}
            <div className="saving-main"><div className="saving-title"><h2>{s.name}</h2><span>{s.status === "completed" ? "Goal reached" : "Saving"}</span></div><div className="saving-money"><b>{money(current)}</b><span>of {money(target)}</span></div><div className="saving-progress"><span style={{width:`${percent}%`}}/></div><div className="saving-actions"><button onClick={() => setShowAdd(s)} disabled={s.status === "completed"}><Plus size={17}/>{s.status === "completed" ? "Goal reached" : "Add money"}</button>{s.status === "completed" ? <button onClick={() => setShowRequest(s)}><WalletCards size={17}/>Use savings</button> : <button disabled><Clock3 size={17}/>Reach goal first</button>}</div></div>
          </article>
        })}
      </div>}

      {requests.length > 0 && <section className="saving-requests"><h2>Requests</h2>{requests.slice(0,8).map(r => <div className="saving-request" key={r.id}><div><b>{r.request_type === "order" ? "Make an order" : "Withdrawal"}</b><span>{r.saving_name} · {money(r.amount)}</span></div><em className={r.status}>{r.status}</em></div>)}</section>}
    </main>

    {showCreate && <div className="saving-modal-backdrop"><form className="saving-modal" onSubmit={createSaving}><div className="modal-head"><div><b>Create a saving</b><span>Enter the goal details yourself</span></div><button type="button" onClick={() => setShowCreate(false)}><X/></button></div><label>What are you saving for?<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. New shoes" maxLength={120} required/></label><label>Target price<input type="number" min="0.01" step="0.01" value={form.target_amount} onChange={e=>setForm({...form,target_amount:e.target.value})} placeholder="0.00" required/></label><label>Product link <small>(optional)</small><div className="link-row"><input value={form.product_link} onChange={e=>setForm({...form,product_link:e.target.value})} placeholder="Paste Taobao / Pinduoduo / Shein link"/><button type="button" onClick={fetchImage} disabled={fetchingImage}>{fetchingImage ? "Finding..." : "Get image"}</button></div></label>{form.product_image && <div className="found-image"><img src={form.product_image} alt="Item preview"/><span><CheckCircle2 size={16}/> Item image found</span></div>}<button className="primary" disabled={busy}>{busy ? "Creating..." : "Create saving"}</button></form></div>}

    {showAdd && <div className="saving-modal-backdrop"><form className="saving-modal" onSubmit={addMoney}><div className="modal-head"><div><b>Add to {showAdd.name}</b><span>Use the same payment proof flow as wallet deposits</span></div><button type="button" onClick={()=>setShowAdd(null)}><X/></button></div><label>Amount<input type="number" min="0.01" step="0.01" value={addForm.amount} onChange={e=>setAddForm({...addForm,amount:e.target.value})} required/></label><div className="method-grid"><button type="button" className={addForm.payment_method==="qr"?"selected":""} onClick={()=>setAddForm({...addForm,payment_method:"qr"})}><Smartphone size={18}/>QR Payment</button><button type="button" className={addForm.payment_method==="bank"?"selected":""} onClick={()=>setAddForm({...addForm,payment_method:"bank"})}><CreditCard size={18}/>Bank Transfer</button></div>{addForm.payment_method==="qr" && <img className="saving-qr" src={QRCode} alt="Payment QR"/>}<label>Payment proof<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setAddForm({...addForm,proof:e.target.files?.[0]||null})} required/></label><button className="primary" disabled={busy}>{busy ? "Submitting..." : "Submit for approval"}</button></form></div>}

    {showRequest && <div className="saving-modal-backdrop"><form className="saving-modal" onSubmit={submitRequest}><div className="modal-head"><div><b>Use {showRequest.name}</b><span>Choose what you want YN Studio to do</span></div><button type="button" onClick={()=>setShowRequest(null)}><X/></button></div><div className="method-grid"><button type="button" className={requestForm.request_type==="withdrawal"?"selected":""} onClick={()=>setRequestForm({...requestForm,request_type:"withdrawal"})}>Withdraw</button><button type="button" className={requestForm.request_type==="order"?"selected":""} onClick={()=>setRequestForm({...requestForm,request_type:"order"})}>Make an order</button></div><label>Amount<input type="number" min="0.01" max={Number(showRequest.current_amount||0)} step="0.01" value={requestForm.amount} onChange={e=>setRequestForm({...requestForm,amount:e.target.value})} placeholder={money(showRequest.current_amount)} required/></label>{requestForm.request_type==="withdrawal" && <label>Withdrawal QR / payment account<textarea value={requestForm.qr_code} onChange={e=>setRequestForm({...requestForm,qr_code:e.target.value})} placeholder="Paste the QR/payment details you want YN Studio to use" required/></label>}<label>Note <small>(optional)</small><textarea value={requestForm.note} onChange={e=>setRequestForm({...requestForm,note:e.target.value})} placeholder={requestForm.request_type==="order"?"Tell us anything about the order...":"Add a note..."}/></label><button className="primary" disabled={busy}>{busy ? "Sending..." : "Send request"}</button></form></div>}
  </div>;
}

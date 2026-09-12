import React, { useEffect, useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { customerRequest } from "../../lib/api";
import "./CustomerAuth.css";

export default function PaymentNameSetup() {
  const navigate = useNavigate();
  const [paymentName, setPaymentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("customerToken")) navigate("/login", { replace: true });
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    const name = paymentName.trim();
    setError("");
    if (name.length < 2) return setError("Enter the real name shown on the payment account you will use.");
    try {
      setLoading(true);
      await customerRequest("/api/customer/payment-name", { method:"PUT", body:JSON.stringify({payment_name:name}) });
      const stored = JSON.parse(localStorage.getItem("customerUser") || "{}");
      localStorage.setItem("customerUser", JSON.stringify({...stored,payment_name:name,paymentNameSet:true}));
      navigate(stored.walletPinSet === false ? "/create-passcode" : "/home", {replace:true});
    } catch(e) { setError(e.message || "Unable to save your payment name."); }
    finally { setLoading(false); }
  }

  return <div className="passcode-page"><main className="passcode-card">
    <div className="passcode-icon"><UserRound size={28}/></div>
    <span className="passcode-eyebrow">PAYMENT VERIFICATION</span>
    <h1>Confirm your payment name</h1>
    <p className="passcode-description">Enter the real name that appears when you pay from your bank account. We use it to match your payment safely.</p>
    {error && <div className="passcode-error">{error}</div>}
    <form onSubmit={submit} className="passcode-form">
      <label htmlFor="payment-name">Payment name</label>
      <input id="payment-name" type="text" value={paymentName} onChange={e=>{setError("");setPaymentName(e.target.value)}} placeholder="Your real payment name" autoComplete="name" autoFocus />
      <button type="submit" className="passcode-submit" disabled={loading || paymentName.trim().length<2}>{loading?"Saving...":"Confirm name"}{!loading&&<ArrowRight size={18}/>}</button>
    </form>
  </main></div>;
}

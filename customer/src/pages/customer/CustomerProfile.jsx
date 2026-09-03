import React, { useEffect, useState } from "react";
import { ArrowLeft, UserRound, Mail, Phone, ShieldCheck, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./CustomerProfile.css";
import { customerRequest, clearCustomerSession } from "../../lib/api";
import { useCustomerTheme } from "../../components/CustomerTheme";

export default function CustomerProfile(){
  const navigate=useNavigate();
  const { theme, activateTheme, resetTheme } = useCustomerTheme();
  const [user,setUser]=useState({});
  const [showSecretTheme, setShowSecretTheme] = useState(false);
  const [secretCode, setSecretCode] = useState("");
  const [themeMessage, setThemeMessage] = useState("");
  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const data = await customerRequest("/api/customer/me");

        if (mounted && data?.customer) {
          setUser(data.customer);
          localStorage.setItem(
            "customerUser",
            JSON.stringify(data.customer)
          );
        }
      } catch {
        try {
          const saved = JSON.parse(
            localStorage.getItem("customerUser") || "{}"
          );
          if (mounted) setUser(saved);
        } catch {
          if (mounted) setUser({});
        }
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);
  const name=user.full_name||user.name||user.username||"Customer";
  const logout=()=>{
    clearCustomerSession();
    navigate("/login",{replace:true});
  };

  const submitSecretTheme = (event) => {
    event.preventDefault();
    const code = secretCode.trim().toUpperCase();

    if (code === "USAGITIME") {
      activateTheme("usagi");
      setThemeMessage("USAGI TIME!! 🐰✨");
      setSecretCode("");
      return;
    }

    if (code === "CHIIKAWATIME") {
      activateTheme("chiikawa");
      setThemeMessage("CHIIKAWA TIME!! ✨");
      setSecretCode("");
      return;
    }

    if (code === "RESETTIME" || code === "NORMALTIME") {
      resetTheme();
      setThemeMessage("Back to YN Studio ✨");
      setSecretCode("");
      return;
    }

    setThemeMessage("That secret code isn't recognized.");
  };
  return <section className="customer-profile-page">
    <button className="profile-back" onClick={()=>navigate(-1)}><ArrowLeft size={18}/> Back</button>
    <div className="profile-hero"><div className="profile-avatar"><UserRound size={32}/></div><div><p>ACCOUNT</p><h1>{name}</h1><span>{user.customer_code||"YN Customer"}</span></div></div>
    <div className="profile-list">
      <div><Mail size={18}/><span>Email</span><strong>{user.email||"Not provided"}</strong></div>
      <div><Phone size={18}/><span>Phone</span><strong>{user.phone||"Not provided"}</strong></div>
      <div><ShieldCheck size={18}/><span>Account</span><strong>Verified customer</strong></div>
    </div>
    <button
      className="profile-theme-button"
      onClick={() => {
        setShowSecretTheme(true);
        setThemeMessage("");
      }}
    >
      <span className="profile-theme-button-art" aria-hidden="true">
        <img
          src={theme === "usagi" ? "/themes/usagi-main.png" : "/themes/chiikawa-main.png"}
          alt=""
        />
      </span>
      <span>
        <strong>✨ Secret Theme</strong>
        <small>
          {theme === "usagi"
            ? "USAGITIME is active"
            : theme === "chiikawa"
              ? "CHIIKAWATIME is active"
              : "Enter a secret code"}
        </small>
      </span>
    </button>

    {theme !== "default" && (
      <button className="profile-reset-theme" onClick={resetTheme}>
        Reset to normal theme
      </button>
    )}

    <button className="profile-logout" onClick={logout}><LogOut size={18}/> Sign out</button>

    {showSecretTheme && (
      <div
        className="secret-theme-overlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowSecretTheme(false);
        }}
      >
        <form className="secret-theme-modal" onSubmit={submitSecretTheme}>
          <button
            type="button"
            className="secret-theme-close"
            onClick={() => setShowSecretTheme(false)}
            aria-label="Close"
          >
            ×
          </button>

          <div className="secret-theme-character">
            <img
              src={theme === "usagi" ? "/themes/usagi-main.png" : "/themes/chiikawa-main.png"}
              alt=""
            />
          </div>

          <div className="secret-theme-kicker">SECRET MODE</div>
          <h2>Unlock a theme</h2>
          <p>Try one of the secret codes.</p>

          <input
            value={secretCode}
            onChange={(event) => setSecretCode(event.target.value)}
            placeholder="ENTER CODE"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            autoFocus
          />

          <button className="secret-theme-submit" type="submit">
            Unlock ✨
          </button>

          {themeMessage && (
            <div className={`secret-theme-message ${themeMessage.includes("isn't") ? "error" : ""}`}>
              {themeMessage}
            </div>
          )}

          <div className="secret-theme-hints">
            <span>🐰 USAGITIME</span>
            <span>✨ CHIIKAWATIME</span>
          </div>
        </form>
      </div>
    )}
  </section>;
}

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const token = () => localStorage.getItem("yn_token") || "";

const PAGE_LABELS = {
  "/dashboard": "Dashboard",
  "/customers": "Customers",
  "/services": "Services",
  "/orders": "Orders",
  "/receipts": "Receipts",
  "/wallet": "Wallet",
  "/payments": "Payments",
  "/savings": "Savings",
  "/loans": "Loans",
  "/china-orders": "China Orders",
  "/vietnam-orders": "Vietnam Orders",
  "/settings": "Settings",
};

const STARTER_PROMPTS = [
  "Give me a quick overview of YN Studio today.",
  "Show me all pending payments.",
  "Find a customer.",
  "Show me the latest orders.",
];

export default function AdminAI() {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Good afternoon. JARVIS at your service. What shall we get ourselves into today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [pending, setPending] = useState(null);
  const [configured, setConfigured] = useState(null);
  const [voiceActivity, setVoiceActivity] = useState(0);
  const [lastVoiceText, setLastVoiceText] = useState("");

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceWantedRef = useRef(false);
  const speakingRef = useRef(false);
  const messagesRef = useRef(messages);

  const currentPage =
    PAGE_LABELS[location.pathname] || "Admin";

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* --------------------------------
     CHECK JARVIS CONFIGURATION
  -------------------------------- */
  useEffect(() => {
    fetch(`${API_URL}/api/admin/ai/status`, {
      headers: {
        Authorization: `Bearer ${token()}`,
      },
    })
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  /* --------------------------------
     CHAT
  -------------------------------- */
  function addAssistantMessage(content) {
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content,
      },
    ]);
  }

  async function sendChat(text = input, fromVoice = false) {
    const value = String(text || "").trim();

    if (!value || loading) return null;

    setInput("");

    const next = [
      ...messagesRef.current,
      {
        role: "user",
        content: value,
      },
    ];

    setMessages(next);
    setLoading(true);

    try {
      const r = await fetch(`${API_URL}/api/admin/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          messages: next,
        }),
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            d.error ||
            "JARVIS encountered an error."
        );
      }

      const reply = d.message || "Consider it done.";
      addAssistantMessage(reply);

      const match = String(d.message || "").match(
        /ai_[A-Za-z0-9_]+/
      );

      if (match) {
        setPending(match[0]);
      }

      if (fromVoice) {
        setVoiceStatus("thinking");
        setVoiceActivity(0.45);
      }
      return reply;
    } catch (e) {
      addAssistantMessage(
        `I'm afraid that didn't go according to plan. ${e.message}`
      );
      return null;
    } finally {
      setLoading(false);
    }
  }

  /* --------------------------------
     CONFIRM ADMIN ACTION
  -------------------------------- */
  async function confirmPending() {
    if (!pending || loading) return;

    setLoading(true);

    try {
      const r = await fetch(
        `${API_URL}/api/admin/ai/tool`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({
            name: "confirm_action",
            arguments: {
              confirmation_token: pending,
            },
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error ||
            d.message ||
            "Confirmation failed."
        );
      }

      addAssistantMessage(
        d.result?.message ||
          "Done. That has been taken care of."
      );

      setPending(null);
    } catch (e) {
      addAssistantMessage(
        `I couldn't complete that action. ${e.message}`
      );
    } finally {
      setLoading(false);
    }
  }

  /* --------------------------------
     FREE BROWSER VOICE
     SpeechRecognition -> JARVIS text AI -> speechSynthesis
  -------------------------------- */
  function speakJarvis(text) {
    return new Promise((resolve) => {
      if (!text || !window.speechSynthesis) return resolve();
      speakingRef.current = true;
      setVoiceStatus("speaking");
      setVoiceActivity(0.8);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = "en-GB";
      utterance.rate = 0.96;
      utterance.pitch = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => { speakingRef.current = false; resolve(); };
      utterance.onerror = () => { speakingRef.current = false; resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }

  function createRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (!voiceWantedRef.current) return;
      setVoiceStatus("listening");
      setVoiceActivity(1);
      setLastVoiceText("Listening...");
    };
    recognition.onresult = async (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript || !voiceWantedRef.current) return;
      setLastVoiceText(transcript);
      const reply = await sendChat(transcript, true);
      if (voiceWantedRef.current && reply) {
        await speakJarvis(reply);
        if (voiceWantedRef.current) setTimeout(startListening, 150);
      }
    };
    recognition.onerror = (event) => {
      if (!voiceWantedRef.current) return;
      if (["no-speech", "aborted"].includes(event.error)) {
        setTimeout(startListening, 250);
        return;
      }
      setVoiceStatus("error");
      setLastVoiceText(`Microphone error: ${event.error || "unknown"}`);
    };
    recognition.onend = () => {
      if (voiceWantedRef.current && !speakingRef.current) setTimeout(startListening, 180);
    };
    return recognition;
  }

  function startListening() {
    if (!voiceWantedRef.current || speakingRef.current) return;
    const recognition = recognitionRef.current || createRecognition();
    if (!recognition) {
      setVoiceStatus("error");
      setLastVoiceText("Voice recognition is not supported in this browser. Chrome or Edge is recommended.");
      return;
    }
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  }

  function startVoice() {
    if (voice) { stopVoice(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || !window.speechSynthesis) {
      addAssistantMessage("Free voice mode needs a browser with Speech Recognition and Speech Synthesis. Chrome or Edge works best.");
      return;
    }
    voiceWantedRef.current = true;
    setVoice(true);
    setVoiceStatus("connecting");
    setLastVoiceText("Starting free voice mode...");
    startListening();
  }

  function stopVoice() {
    voiceWantedRef.current = false;
    speakingRef.current = false;
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch {}
    setVoice(false);
    setVoiceActivity(0);
    setVoiceStatus("idle");
    setLastVoiceText("");
  }

  // Paid Realtime/WebRTC voice is intentionally not used in the free build.

  useEffect(() => {
    return () => stopVoice();
  }, []);

  /* --------------------------------
     STATUS
  -------------------------------- */
  const status =
    configured === false
      ? "NOT CONFIGURED"
      : voiceStatus === "connecting"
      ? "STARTING VOICE"
      : voiceStatus === "listening"
      ? "LISTENING"
      : voiceStatus === "thinking"
      ? "THINKING"
      : voiceStatus === "speaking"
      ? "SPEAKING"
      : voice
      ? "LIVE"
      : "ONLINE";

  /* --------------------------------
     UI
  -------------------------------- */
  return (
    <>
      {/* ============================
          FLOATING JARVIS ORB
      ============================ */}

      <button
        className={`jarvis-orb ${
          open ? "open" : ""
        } ${voice ? "voice-active" : ""} ${
          voiceStatus === "listening"
            ? "listening"
            : ""
        } ${
          voiceStatus === "speaking"
            ? "speaking"
            : ""
        }`}
        onClick={() => setOpen(true)}
        aria-label="Open JARVIS"
      >
        <span className="jarvis-orb-ring ring-1" />
        <span className="jarvis-orb-ring ring-2" />
        <span className="jarvis-orb-ring ring-3" />

        <span
          className="jarvis-orb-core"
          style={{
            "--energy": voiceActivity,
          }}
        >
          <Bot size={25} />
        </span>

        <span className="jarvis-orb-status">
          {voice ? "LIVE" : "J"}
        </span>
      </button>

      {/* ============================
          JARVIS WINDOW
      ============================ */}

      {open && (
        <div
          className="jarvis-overlay"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget
            ) {
              setOpen(false);
            }
          }}
        >
          <section className="jarvis-window">
            {/* TOP BAR */}
            <header className="jarvis-topbar">
              <div className="jarvis-identity">
                <div
                  className={`jarvis-mini-orb ${
                    voice
                      ? "active"
                      : ""
                  }`}
                >
                  <Bot size={18} />
                </div>

                <div>
                  <div className="jarvis-name">
                    JARVIS
                  </div>

                  <div className="jarvis-status">
                    <span
                      className={`status-light ${
                        voice
                          ? "live"
                          : ""
                      }`}
                    />

                    {status}
                  </div>
                </div>
              </div>

              <div className="jarvis-top-actions">
                <span className="jarvis-page">
                  {currentPage}
                </span>

                <button
                  onClick={() =>
                    setOpen(false)
                  }
                  className="jarvis-close"
                  aria-label="Close JARVIS"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* HERO */}
            <div className="jarvis-hero">
              <div
                className={`jarvis-hero-orb ${
                  voice
                    ? "active"
                    : ""
                } ${
                  voiceStatus ===
                  "listening"
                    ? "listening"
                    : ""
                }`}
              >
                <span />
                <span />
                <span />

                <div className="hero-core">
                  <Bot size={42} />
                </div>
              </div>

              <div className="jarvis-greeting">
                <span className="eyebrow">
                  YN STUDIO · ADMIN
                </span>

                <h1>
                  How may I assist?
                </h1>

                <p>
                  Your command center for
                  YN Studio.
                </p>
              </div>
            </div>

            {/* VOICE */}
            {voice && (
              <div className="jarvis-live-card">
                <div className="live-visualizer">
                  {[1, 2, 3, 4, 5, 6, 7].map(
                    (n) => (
                      <span
                        key={n}
                        style={{
                          animationDelay: `${
                            n * 0.08
                          }s`,
                        }}
                      />
                    )
                  )}
                </div>

                <div className="live-copy">
                  <strong>
                    {voiceStatus ===
                    "listening"
                      ? "I'm listening."
                      : voiceStatus ===
                        "speaking"
                      ? "One moment."
                      : "Voice link active."}
                  </strong>

                  <span>
                    {lastVoiceText ||
                      "Speak naturally to JARVIS."}
                  </span>
                </div>

                <button
                  className="end-voice"
                  onClick={stopVoice}
                >
                  <MicOff size={15} />
                  End
                </button>
              </div>
            )}

            {/* CHAT */}
            <div className="jarvis-content">
              {messages.map((m, i) => (
                <div
                  className={`jarvis-message ${
                    m.role
                  }`}
                  key={`${m.role}-${i}`}
                >
                  {m.role ===
                    "assistant" && (
                    <div className="message-avatar">
                      <Bot size={14} />
                    </div>
                  )}

                  <div className="message-body">
                    <span className="message-name">
                      {m.role ===
                      "assistant"
                        ? "JARVIS"
                        : "YOU"}
                    </span>

                    <div className="message-text">
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="jarvis-message assistant">
                  <div className="message-avatar">
                    <Bot size={14} />
                  </div>

                  <div className="message-body">
                    <span className="message-name">
                      JARVIS
                    </span>

                    <div className="message-text thinking">
                      <Loader2
                        size={14}
                        className="spin"
                      />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}

              {messages.length ===
                1 &&
                !loading &&
                !voice && (
                  <div className="jarvis-suggestions">
                    {STARTER_PROMPTS.map(
                      (prompt) => (
                        <button
                          key={prompt}
                          onClick={() =>
                            sendChat(prompt)
                          }
                        >
                          <Sparkles
                            size={14}
                          />

                          <span>
                            {prompt}
                          </span>

                          <ArrowUpRight
                            size={14}
                          />
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>

            {/* CONFIRMATION */}
            {pending && (
              <div className="jarvis-confirm">
                <div>
                  <div className="confirm-title">
                    <Check size={14} />
                    Approval required
                  </div>

                  <span>
                    JARVIS has prepared an
                    administrator action.
                  </span>
                </div>

                <div className="confirm-actions">
                  <button
                    onClick={
                      confirmPending
                    }
                    disabled={loading}
                  >
                    <Check size={15} />
                    Confirm
                  </button>

                  <button
                    className="cancel"
                    onClick={() =>
                      setPending(null)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* INPUT */}
            <div className="jarvis-input-area">
              <div className="jarvis-input">
                <button
                  className={`jarvis-mic ${
                    voice ||
                    voiceStatus ===
                      "connecting"
                      ? "active"
                      : ""
                  }`}
                  onClick={startVoice}
                  aria-label={
                    voice
                      ? "Stop voice"
                      : "Start voice"
                  }
                >
                  {voice ? (
                    <MicOff size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                </button>

                <input
                  value={input}
                  onChange={(e) =>
                    setInput(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key ===
                      "Enter"
                    ) {
                      sendChat();
                    }
                  }}
                  placeholder="Speak to JARVIS..."
                  disabled={
                    configured ===
                    false
                  }
                />

                <button
                  className="jarvis-send"
                  onClick={() =>
                    sendChat()
                  }
                  disabled={
                    loading ||
                    !input.trim() ||
                    configured === false
                  }
                >
                  <Send size={17} />
                </button>
              </div>

              <div className="jarvis-footer">
                <span>
                  <span className="footer-dot" />
                  {status}
                </span>

                <span>
                  <Volume2 size={12} />
                  Free browser voice
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ============================
          JARVIS STYLES
      ============================ */}

      <style>{`
        .jarvis-orb {
          position: fixed;
          right: 26px;
          bottom: 26px;
          width: 66px;
          height: 66px;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(
              circle at 35% 30%,
              #ffffff 0%,
              #ddd2ff 10%,
              #a78bfa 28%,
              #6d28d9 55%,
              #26004f 100%
            );
          box-shadow:
            0 0 15px rgba(139,92,246,.9),
            0 0 40px rgba(139,92,246,.45),
            0 12px 35px rgba(0,0,0,.3);
          transition:
            transform .25s ease,
            box-shadow .25s ease;
        }

        .jarvis-orb:hover {
          transform: scale(1.09);
          box-shadow:
            0 0 22px rgba(167,139,250,1),
            0 0 55px rgba(139,92,246,.65),
            0 15px 40px rgba(0,0,0,.35);
        }

        .jarvis-orb.open {
          transform: scale(.92);
        }

        .jarvis-orb-ring {
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          border: 1px solid rgba(167,139,250,.35);
          animation: jarvisOrbit 3s linear infinite;
        }

        .jarvis-orb-ring.ring-2 {
          inset: -10px;
          opacity: .45;
          animation-duration: 4s;
          animation-direction: reverse;
        }

        .jarvis-orb-ring.ring-3 {
          inset: -15px;
          opacity: .2;
          animation-duration: 5s;
        }

        .jarvis-orb-core {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          filter:
            drop-shadow(0 0 8px rgba(255,255,255,.8));
        }

        .jarvis-orb-status {
          position: absolute;
          right: -2px;
          bottom: -1px;
          z-index: 4;
          width: 19px;
          height: 19px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #120020;
          color: #c4b5fd;
          border: 2px solid #8b5cf6;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .04em;
        }

        .jarvis-orb.voice-active {
          animation: jarvisPulse 1.4s ease-in-out infinite;
        }

        .jarvis-orb.listening {
          box-shadow:
            0 0 25px rgba(255,255,255,.9),
            0 0 60px rgba(139,92,246,.8);
        }

        .jarvis-overlay {
          position: fixed;
          inset: 0;
          z-index: 999998;
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          padding: 25px;
          background: rgba(5,2,12,.15);
          backdrop-filter: blur(5px);
        }

        .jarvis-window {
          width: min(470px, calc(100vw - 30px));
          height: min(720px, calc(100vh - 50px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(167,139,250,.25);
          background:
            linear-gradient(
              145deg,
              rgba(24,14,43,.98),
              rgba(8,5,17,.99)
            );
          box-shadow:
            0 30px 100px rgba(0,0,0,.55),
            0 0 60px rgba(109,40,217,.18);
          color: white;
          animation: jarvisAppear .28s ease-out;
        }

        .jarvis-topbar {
          height: 72px;
          padding: 0 18px 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,.07);
        }

        .jarvis-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .jarvis-mini-orb {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(
              circle,
              #c4b5fd,
              #7c3aed 50%,
              #25003f
            );
          box-shadow:
            0 0 18px rgba(139,92,246,.55);
        }

        .jarvis-mini-orb.active {
          animation: jarvisPulse 1.4s infinite;
        }

        .jarvis-name {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: .22em;
        }

        .jarvis-status {
          margin-top: 3px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,.45);
          font-size: 9px;
          letter-spacing: .13em;
        }

        .status-light,
        .footer-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8b5cf6;
          box-shadow: 0 0 8px #8b5cf6;
        }

        .status-light.live {
          background: #c4b5fd;
          box-shadow: 0 0 10px #c4b5fd;
        }

        .jarvis-top-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .jarvis-page {
          padding: 6px 10px;
          border-radius: 20px;
          background: rgba(255,255,255,.05);
          color: rgba(255,255,255,.5);
          font-size: 10px;
        }

        .jarvis-close {
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,.6);
          background: rgba(255,255,255,.05);
        }

        .jarvis-close:hover {
          color: white;
          background: rgba(255,255,255,.1);
        }

        .jarvis-hero {
          padding: 35px 25px 25px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .jarvis-hero-orb {
          position: relative;
          width: 115px;
          height: 115px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jarvis-hero-orb > span {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(167,139,250,.2);
          animation: jarvisOrbit 4s linear infinite;
        }

        .jarvis-hero-orb > span:nth-child(2) {
          inset: 9px;
          animation-duration: 3s;
          animation-direction: reverse;
        }

        .jarvis-hero-orb > span:nth-child(3) {
          inset: 18px;
          animation-duration: 2.5s;
        }

        .hero-core {
          position: relative;
          z-index: 2;
          width: 70px;
          height: 70px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background:
            radial-gradient(
              circle at 35% 30%,
              #ffffff,
              #c4b5fd 12%,
              #8b5cf6 40%,
              #4c1d95 70%,
              #160020
            );
          box-shadow:
            0 0 25px rgba(139,92,246,.75),
            0 0 60px rgba(139,92,246,.25);
        }

        .jarvis-hero-orb.active .hero-core {
          animation: jarvisPulse 1.5s infinite;
        }

        .jarvis-greeting .eyebrow {
          color: #a78bfa;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .2em;
        }

        .jarvis-greeting h1 {
          margin: 7px 0 5px;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -.03em;
        }

        .jarvis-greeting p {
          margin: 0;
          color: rgba(255,255,255,.42);
          font-size: 12px;
        }

        .jarvis-live-card {
          margin: 0 18px 12px;
          padding: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-radius: 17px;
          border: 1px solid rgba(139,92,246,.2);
          background: rgba(139,92,246,.07);
        }

        .live-visualizer {
          height: 28px;
          width: 55px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
        }

        .live-visualizer span {
          width: 3px;
          height: 10px;
          border-radius: 10px;
          background: #a78bfa;
          animation: voiceBars .7s ease-in-out infinite alternate;
        }

        .live-copy {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .live-copy strong {
          font-size: 11px;
        }

        .live-copy span {
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.45);
          font-size: 10px;
        }

        .end-voice {
          border: 0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          color: white;
          background: rgba(255,255,255,.07);
          font-size: 10px;
        }

        .jarvis-content {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 15px 22px;
          scrollbar-width: thin;
        }

        .jarvis-message {
          display: flex;
          gap: 9px;
          margin-bottom: 18px;
        }

        .jarvis-message.user {
          justify-content: flex-end;
        }

        .message-avatar {
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c4b5fd;
          background: rgba(139,92,246,.15);
        }

        .message-body {
          max-width: 82%;
        }

        .message-name {
          display: block;
          margin-bottom: 5px;
          color: rgba(255,255,255,.32);
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .15em;
        }

        .jarvis-message.user .message-name {
          text-align: right;
        }

        .message-text {
          padding: 10px 13px;
          border-radius: 14px;
          background: rgba(255,255,255,.055);
          color: rgba(255,255,255,.83);
          font-size: 12px;
          line-height: 1.55;
        }

        .jarvis-message.user .message-text {
          background: #6d28d9;
          color: white;
        }

        .thinking {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        .jarvis-suggestions {
          display: grid;
          gap: 7px;
          margin-top: 5px;
        }

        .jarvis-suggestions button {
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 13px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          text-align: left;
          color: rgba(255,255,255,.62);
          background: rgba(255,255,255,.025);
          font-size: 10px;
        }

        .jarvis-suggestions button svg:first-child {
          color: #a78bfa;
        }

        .jarvis-suggestions button svg:last-child {
          margin-left: auto;
        }

        .jarvis-suggestions button:hover {
          border-color: rgba(139,92,246,.3);
          background: rgba(139,92,246,.08);
          color: white;
        }

        .jarvis-confirm {
          margin: 0 18px 10px;
          padding: 13px;
          border-radius: 16px;
          border: 1px solid rgba(245,158,11,.22);
          background: rgba(245,158,11,.06);
        }

        .confirm-title {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #fbbf24;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .jarvis-confirm span {
          display: block;
          margin-top: 5px;
          color: rgba(255,255,255,.48);
          font-size: 10px;
        }

        .confirm-actions {
          display: flex;
          gap: 7px;
          margin-top: 10px;
        }

        .confirm-actions button {
          border: 0;
          border-radius: 9px;
          padding: 8px 11px;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          color: white;
          background: #7c3aed;
          font-size: 10px;
        }

        .confirm-actions .cancel {
          background: rgba(255,255,255,.07);
        }

        .jarvis-input-area {
          padding: 13px 18px 16px;
          border-top: 1px solid rgba(255,255,255,.06);
          background: rgba(0,0,0,.18);
        }

        .jarvis-input {
          height: 48px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 16px;
          background: rgba(255,255,255,.045);
        }

        .jarvis-input input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          color: white;
          background: transparent;
          font-size: 12px;
        }

        .jarvis-input input::placeholder {
          color: rgba(255,255,255,.3);
        }

        .jarvis-mic,
        .jarvis-send {
          width: 37px;
          height: 37px;
          flex: 0 0 auto;
          border: 0;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,.55);
          background: transparent;
        }

        .jarvis-mic:hover,
        .jarvis-mic.active {
          color: white;
          background: rgba(139,92,246,.22);
        }

        .jarvis-send {
          color: white;
          background: #7c3aed;
        }

        .jarvis-send:disabled {
          opacity: .3;
          cursor: default;
        }

        .jarvis-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 8px;
          color: rgba(255,255,255,.25);
          font-size: 8px;
          letter-spacing: .08em;
        }

        .jarvis-footer span {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        @keyframes jarvisOrbit {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes jarvisPulse {
          0%,100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.07);
          }
        }

        @keyframes jarvisAppear {
          from {
            opacity: 0;
            transform: translateY(18px) scale(.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes voiceBars {
          from {
            transform: scaleY(.35);
          }
          to {
            transform: scaleY(1.6);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 600px) {
          .jarvis-orb {
            right: 17px;
            bottom: 17px;
            width: 58px;
            height: 58px;
          }

          .jarvis-overlay {
            padding: 10px;
          }

          .jarvis-window {
            width: 100%;
            height: calc(100vh - 20px);
            border-radius: 23px;
          }

          .jarvis-page {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
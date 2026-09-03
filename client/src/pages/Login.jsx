import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LockKeyhole, Eye, EyeOff, ArrowRight } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      localStorage.removeItem("yn_token");
localStorage.removeItem("yn_user");

localStorage.setItem("yn_token", data.token);
localStorage.setItem(
  "yn_user",
  JSON.stringify(data.user)
);

navigate("/dashboard", { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand-mark">YN</div>

        <div className="login-heading">
          <p className="eyebrow">YN STUDIO</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage your studio.</p>
        </div>

        <form onSubmit={handleLogin}>
          <label>Username</label>

          <div className="input-wrapper">
            <LockKeyhole size={18} />

            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>

          <label>Password</label>

          <div className="input-wrapper">
            <LockKeyhole size={18} />

            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />

            <button
              type="button"
              className="icon-button"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
  className="login-button"
  disabled={loading}
  type="submit"
>
            {loading ? "Signing in..." : "Sign in"}

            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="login-footer">
          Private studio management system
        </p>
      </div>
    </div>
  );
}

export default Login;
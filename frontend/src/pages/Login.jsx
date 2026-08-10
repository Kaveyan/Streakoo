import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  pageStyle,
  cardStyle,
  titleStyle,
  subtitleStyle,
  inputStyle,
  primaryBtnStyle,
  errorStyle,
  linkStyle,
  fontImport,
} from "./authTheme";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to log in. Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <style>{fontImport}</style>
      <div style={cardStyle}>
        <div style={titleStyle}>Welcome back</div>
        <div style={subtitleStyle}>Log in to keep your streaks going.</div>

        {error && <div style={errorStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            style={inputStyle}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button style={primaryBtnStyle} type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div style={linkStyle}>
          Don't have an account? <Link to="/register" style={{ color: "#2B2A25" }}>Sign up</Link>
        </div>
      </div>
    </div>
  );
}

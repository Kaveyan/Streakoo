import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// The backend sets the auth cookie and redirects the browser here after a
// successful Google login. We just need to refresh the auth state and
// bounce into the app.
export default function AuthSuccess() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      await refresh();
      navigate("/", { replace: true });
    })();
  }, [refresh, navigate]);

  return (
    <div style={{ padding: "2rem", fontFamily: "Inter, sans-serif", background: "#FAF7EF", minHeight: "100vh" }}>
      Signing you in…
    </div>
  );
}

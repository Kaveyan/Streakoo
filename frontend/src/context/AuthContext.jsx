import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchMe, loginUser, registerUser, logoutUser } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    // No point calling /me if we don't even have a token stored.
    if (!localStorage.getItem("token")) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await fetchMe();
      setUser(user);
    } catch {
      localStorage.removeItem("token"); // stale/invalid token
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    const { user, token } = await loginUser({ email, password });
    localStorage.setItem("token", token);
    setUser(user);
  };

  const register = async (name, email, password) => {
    const { user, token } = await registerUser({ name, email, password });
    localStorage.setItem("token", token);
    setUser(user);
  };

  const logout = async () => {
    await logoutUser().catch(() => {}); // best-effort; token deletion below is what actually matters
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

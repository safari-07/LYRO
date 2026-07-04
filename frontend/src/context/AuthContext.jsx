import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [center, setCenter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("lyro_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data.user);
        setCenter(r.data.center);
      })
      .catch(() => localStorage.removeItem("lyro_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    localStorage.setItem("lyro_token", r.data.token);
    setUser(r.data.user);
    setCenter(r.data.center);
    return r.data;
  };

  const register = async (email, password, center_name) => {
    const r = await api.post("/auth/register", { email, password, center_name });
    localStorage.setItem("lyro_token", r.data.token);
    setUser(r.data.user);
    setCenter(r.data.center);
    return r.data;
  };

  const logout = () => {
    localStorage.removeItem("lyro_token");
    setUser(null);
    setCenter(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, center, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

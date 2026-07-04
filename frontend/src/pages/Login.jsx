import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, ArrowRight } from "@phosphor-icons/react";

export default function Login() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("owner@lyro.demo");
  const [password, setPassword] = useState("demo1234");
  const [centerName, setCenterName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/");
  }, [user, loading, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Welcome back!");
      } else {
        await register(email, password, centerName || undefined);
        toast.success("Center created. Let's go!");
      }
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F4F5] lyro-grain flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-[#0A2540] flex items-center justify-center">
            <GraduationCap size={22} weight="bold" color="#fff" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display font-black text-2xl tracking-tight">
              LYRO
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#71717A]">
              For coaching centers
            </span>
          </div>
        </div>

        <div className="lyro-card p-8">
          <div className="mb-6">
            <p className="lyro-eyebrow">
              {mode === "login" ? "Sign in" : "New center"}
            </p>
            <h1 className="font-display font-black text-3xl mt-1 tracking-tight">
              {mode === "login" ? "Track marks. Keep parents in the loop." : "Set up your center"}
            </h1>
            <p className="text-sm text-[#71717A] mt-2">
              {mode === "login"
                ? "One place for marks, AI progress notes and parent updates."
                : "Create an account for your coaching center."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" data-testid="auth-form">
            {mode === "register" && (
              <div>
                <label className="lyro-label">Center name</label>
                <input
                  data-testid="center-name-input"
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  placeholder="e.g. Bright Future Classes"
                  className="lyro-input"
                />
              </div>
            )}
            <div>
              <label className="lyro-label">Email</label>
              <input
                data-testid="email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@center.com"
                className="lyro-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="lyro-label">Password</label>
              <input
                data-testid="password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="lyro-input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            <button
              data-testid="auth-submit-button"
              type="submit"
              disabled={submitting}
              className="lyro-btn-primary w-full mt-2"
            >
              {submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create center"}
              <ArrowRight size={16} weight="bold" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E4E4E7] text-center">
            {mode === "login" ? (
              <button
                data-testid="switch-to-register"
                onClick={() => setMode("register")}
                className="text-sm text-[#0A2540] font-semibold hover:underline"
              >
                New here? Create a center →
              </button>
            ) : (
              <button
                data-testid="switch-to-login"
                onClick={() => setMode("login")}
                className="text-sm text-[#0A2540] font-semibold hover:underline"
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[#71717A] mt-6">
          Demo: <span className="font-mono font-semibold">owner@lyro.demo</span> ·{" "}
          <span className="font-mono font-semibold">demo1234</span>
        </p>
      </div>
    </div>
  );
}

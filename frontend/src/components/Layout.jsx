import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { House, SignOut, GraduationCap, Gear } from "@phosphor-icons/react";

export default function Layout({ children }) {
  const { center, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-[#18181B]">
      <header
        data-testid="app-header"
        className="sticky top-0 z-30 border-b border-[#E4E4E7] bg-white/80 backdrop-blur-xl"
      >
        <div className="lyro-container flex items-center justify-between h-16">
          <button
            data-testid="header-home-button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 bg-[#0A2540] flex items-center justify-center">
              <GraduationCap size={18} weight="bold" color="#fff" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="font-display font-black text-lg tracking-tight">
                LYRO
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#71717A]">
                Marks · Progress · Parents
              </span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            {location.pathname !== "/" && (
              <button
                data-testid="header-batches-link"
                onClick={() => navigate("/")}
                className="lyro-btn-ghost hidden sm:inline-flex"
              >
                <House size={16} weight="bold" /> Batches
              </button>
            )}
            <button
              data-testid="header-settings-link"
              onClick={() => navigate("/settings")}
              className="lyro-btn-ghost"
              title="Settings"
            >
              <Gear size={16} weight="bold" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            {center && (
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-xs font-bold text-[#18181B]" data-testid="center-name">
                  {center.name}
                </span>
                <span className="text-[10px] text-[#71717A]">{center.owner_email}</span>
              </div>
            )}
            <button
              data-testid="logout-button"
              onClick={logout}
              className="lyro-btn-ghost"
              title="Log out"
            >
              <SignOut size={16} weight="bold" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="lyro-container py-6 sm:py-10">{children}</main>
      <footer className="border-t border-[#E4E4E7] mt-16">
        <div className="lyro-container py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[#71717A]">
            LYRO · Built for coaching centers that care.
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA]">
            v1.0 · JEE Ready
          </p>
        </div>
      </footer>
    </div>
  );
}

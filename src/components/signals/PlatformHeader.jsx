import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Plus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function PlatformHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 md:px-16 py-6">
      <Link to="/" className="focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 rounded">
        <p className="font-mono text-xs tracking-[0.3em] uppercase text-graphite/60">Research paper collections</p>
        <p className="font-heading text-lg md:text-xl font-semibold text-graphite tracking-tight">NCI Digest</p>
      </Link>
      <nav className="flex flex-wrap items-center gap-6">
        <Link
          to="/#community"
          className="font-mono text-xs tracking-widest uppercase text-graphite/50 hover:text-cobalt transition-colors flex items-center gap-1"
        >
          Community collections <ChevronRight className="w-3 h-3" />
        </Link>
        <Link
          to="/signals/new"
          className="font-mono text-xs tracking-widest uppercase text-cobalt hover:text-cobalt/80 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> New collection
        </Link>
        {user ? (
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-cobalt/10 text-cobalt font-mono text-xs flex items-center justify-center">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="font-mono text-xs text-graphite/60 hidden sm:inline">{user.name}</span>
            <button
              onClick={handleLogout}
              className="text-graphite/40 hover:text-graphite transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt rounded"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
            className="font-mono text-xs tracking-widest uppercase bg-graphite text-white px-4 py-2 rounded-full hover:bg-graphite/90 transition-colors"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

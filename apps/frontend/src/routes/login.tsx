import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileSearch, Activity, ShieldCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return <AuthCard isAdmin={false} />;
}

export function AuthCard({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const setIsAdmin = useStore((s) => s.setIsAdmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to login");
      }

      if (isAdmin && data.role !== "admin") {
        throw new Error("This account does not have administrator access.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("companyId", data.companyId);
      if (data.companyName)
        localStorage.setItem("companyName", data.companyName);
      localStorage.setItem("email", email);
      setIsAdmin(data.role === "admin");
      navigate({ to: isAdmin ? "/admin" : "/dashboard" });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white text-slate-900 font-sans overflow-hidden">
      <div className="w-full flex h-full relative overflow-hidden">
        {/* Left Column - Hero Section (50%) */}
        <div className="hidden md:flex w-1/2 flex-col justify-between p-16 text-white relative overflow-hidden h-full">
          {/* Hero Image Background */}
          <div className="absolute inset-0 z-0">
            <img
              src="/tender_hero.png"
              alt="Tender Matching Hero"
              className="w-full h-full object-cover object-center scale-110"
            />
            <div className="absolute inset-0 bg-slate-900/80" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />
          </div>

          <div className="relative z-10 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-xl shadow-primary/40">
              <FileSearch className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              TenderMatch
            </span>
          </div>

          <div className="relative z-10 space-y-6 max-w-xl">
            <div className="space-y-3">
              <h1 className="text-5xl font-extrabold tracking-tight leading-tight text-white">
                Bridging the gap <br />
                between <br />
                <span className="text-primary">businesses</span> and{" "}
                <span className="text-primary">tenders</span>.
              </h1>
            </div>
            <p className="text-xl text-slate-300 leading-relaxed">
              Log in to access your personalized match dashboard and start
              winning government contracts today.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                <div className="rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <span>Real-time GeM & CPPP tracking</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                <div className="rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                </div>
                <span>Automated compliance checking</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 pt-6 opacity-0">
            {/* Removed Testimonial */}
          </div>
        </div>

        {/* Right Column - Login Form (50%) */}
        <div className="relative flex w-full md:w-1/2 items-center justify-center p-8 md:p-16 bg-white h-full overflow-hidden">
          <img
            src="/mccia-logo.jpg"
            alt="MCCIA"
            className="absolute top-6 right-6 h-8 w-auto md:top-8 md:right-8"
          />
          <div className="w-full max-w-sm">
            <div className="mb-8 md:hidden flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-xl shadow-primary/20">
                <FileSearch className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                TenderMatch
              </span>
            </div>

            <div className="mb-8 text-center md:text-left">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-2">
                {isAdmin ? "Admin Login" : "Welcome Back"}
              </h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {isAdmin
                  ? "Access the system management console."
                  : "Sign in to manage your company's tender matches."}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-xs text-red-600 font-bold">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Work Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. rajesh@rkttech.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-primary/30 hover:bg-primary/90 hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {loading ? "Signing In..." : "Sign In to Account"}
                {!loading && (
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col gap-4 text-center">
              {isAdmin ? (
                <Link
                  to="/login"
                  className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
                >
                  ← Return to Company Login
                </Link>
              ) : (
                <div className="space-y-4">
                  <Link
                    to="/signup"
                    className="text-sm font-bold text-slate-900 hover:text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    New to TenderMatch?{" "}
                    <span className="text-primary font-extrabold flex items-center gap-1">
                      Create Account <ChevronRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

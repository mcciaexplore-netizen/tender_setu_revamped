import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Building2,
  Briefcase,
  FileBadge,
  IndianRupee,
  Loader2,
  FileSearch,
  Activity,
  Users,
} from "lucide-react";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState("forward");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    companyName: "",
    email: "",
    password: "",
    sectors: [] as string[],
    certifications: [] as string[],
    personnel_credentials: "",
    turnover: "",
  });

  const nextStep = () => {
    setDirection("forward");
    setStep((s) => Math.min(s + 1, 6));
  };

  const prevStep = () => {
    setDirection("backward");
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSectorToggle = (sector: string) => {
    setFormData((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }));
  };

  const handleCertToggle = (cert: string) => {
    setFormData((prev) => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter((c) => c !== cert)
        : [...prev.certifications, cert],
    }));
  };

  const handleSubmit = async () => {
    setStep(6);
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      // Parse the response defensively. If the API URL points at a different
      // web server, it may return an HTML error page; exposing the raw JSON
      // parser exception makes that configuration problem look like a signup
      // validation failure.
      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      let data: { token?: string; companyId?: string; error?: string } = {};
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error("The server returned an invalid response. Please check the API URL.");
        }
      } else {
        throw new Error("The signup service is unavailable at this address. Please check the API URL.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign up");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("companyId", data.companyId);
      localStorage.setItem("companyName", formData.companyName);
      localStorage.setItem("email", formData.email);

      // Keep loading for at least 3 seconds to show the "Scanning" animation
      setTimeout(() => {
        setLoading(false);
        setTimeout(() => {
          navigate({ to: "/dashboard" });
        }, 1000);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setStep(5); // Go back to the form if there's an error
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return (
          formData.companyName.length > 2 &&
          formData.email.length > 5 &&
          formData.password.length >= 12
        );
      case 2:
        return formData.sectors.length > 0;
      case 3:
        return true;
      case 4:
        return formData.personnel_credentials.trim().length > 5;
      case 5:
        return formData.turnover.length > 0;
      default:
        return true;
    }
  };

  return (
    <div className="fixed inset-0 bg-white text-slate-900 font-sans overflow-hidden">
      <div className="w-full flex h-full relative overflow-hidden">
        {/* Left Column - Onboarding Guide (50%) */}
        <div className="hidden md:flex w-1/2 flex-col justify-between p-16 text-white relative overflow-hidden h-full">
          {/* Hero Image Background */}
          <div className="absolute inset-0 z-0">
            <img
              src="/tender_hero.png"
              alt="Tender Matching Hero"
              className="w-full h-full object-cover object-left scale-125"
            />
            <div className="absolute inset-0 bg-slate-900/85" />
          </div>

          <div className="relative z-10 flex items-center gap-2">
            <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-xl shadow-primary/30">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                TenderMatch
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Onboarding Wizard
              </p>
            </div>
          </div>

          <div className="relative z-10 space-y-8 max-w-xl">
            <div className="space-y-3">
              <h2 className="text-5xl font-extrabold tracking-tight leading-tight text-white">
                Unlock your{" "}
                <span className="text-primary">competitive edge</span>.
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed">
                Fill in your details to match against currently available tender sources.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { s: 1, title: "Identity", desc: "Company basics" },
                { s: 2, title: "Domain", desc: "Service sectors" },
                { s: 3, title: "Trust", desc: "Certifications" },
                { s: 4, title: "Team", desc: "Staff resources" },
                { s: 5, title: "Scale", desc: "Financial capacity" },
                { s: 6, title: "Match", desc: "AI Matching" },
              ].map((item) => (
                <div
                  key={item.s}
                  className={`flex items-center gap-3 transition-all duration-500 ${step >= item.s ? "opacity-100 scale-100" : "opacity-20 scale-95"}`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs border-2 ${step >= item.s ? "bg-primary border-primary text-white shadow-lg shadow-primary/30" : "border-slate-700 text-slate-500"}`}
                  >
                    {step > item.s ? "✓" : item.s}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm uppercase tracking-widest">
                      {item.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10">
            <div className="flex gap-1 mb-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`h-0.5 rounded-full transition-all duration-500 ${step === i ? "w-6 bg-primary" : "w-1.5 bg-slate-700"}`}
                />
              ))}
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              Phase {step} active
            </p>
          </div>
        </div>

        {/* Right Column - Form Steps (50%) */}
        <div className="flex w-full md:w-1/2 flex-col items-center justify-center p-8 md:p-12 bg-slate-50/50 h-full overflow-hidden">
          <div className="w-full max-w-lg relative">
            {/* Header (Mobile) */}
            <div className="mb-8 md:hidden flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold text-slate-900">
                  TenderMatch
                </h1>
              </div>
              <p className="text-xs font-bold text-primary">Step {step}/6</p>
            </div>

            {/* Form Content */}
            <div className="relative bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10">
              {error && (
                <div className="mb-6 rounded-xl bg-red-50 border border-red-100 p-4 text-xs text-red-600 font-bold">
                  {error}
                </div>
              )}

              {/* Step 1: Basics */}
              <div
                className={`transition-all duration-500 ${step === 1 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
                  Company Identity.
                </h2>
                <p className="text-sm text-slate-500 mb-8">
                  Enter your official business name and workspace email.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Company Legal Name
                    </label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          companyName: e.target.value,
                        })
                      }
                      placeholder="e.g. Acme Corporation Pvt Ltd"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        Work Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="founder@acme.com"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        Password
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        placeholder="At least 12 characters"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Sectors */}
              <div
                className={`transition-all duration-500 ${step === 2 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
                  Service Domain.
                </h2>
                <p className="text-sm text-slate-500 mb-8">
                  Select the industries where your company has active expertise.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    "IT",
                    "Construction",
                    "Healthcare",
                    "Services",
                    "Manufacturing",
                    "Defence",
                    "Education",
                    "Transport",
                  ].map((sector) => (
                    <button
                      key={sector}
                      onClick={() => handleSectorToggle(sector)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        formData.sectors.includes(sector)
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-lg ${formData.sectors.includes(sector) ? "bg-primary text-white shadow-lg" : "bg-white text-slate-400 shadow-sm"}`}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs">{sector}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Certifications */}
              <div
                className={`transition-all duration-500 ${step === 3 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
                  Trust Assets.
                </h2>
                <p className="text-sm text-slate-500 mb-8">
                  Active certifications significantly improve your match score.
                </p>

                <div className="flex flex-wrap gap-2">
                  {[
                    "ISO 9001",
                    "MSME",
                    "GEM registered",
                    "Startup India",
                    "ISO 27001",
                    "Class 1A Contractor",
                    "FSSAI",
                  ].map((cert) => (
                    <button
                      key={cert}
                      onClick={() => handleCertToggle(cert)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs transition-all ${
                        formData.certifications.includes(cert)
                          ? "border-primary bg-primary text-white shadow-md"
                          : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
                      }`}
                    >
                      <FileBadge className="w-3.5 h-3.5" />
                      {cert}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 4: Personnel Credentials */}
              <div
                className={`transition-all duration-500 ${step === 4 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
                  Team Credentials.
                </h2>
                <p className="text-sm text-slate-500 mb-8">
                  Specify your team's qualifications, degrees, and experience to
                  qualify for strict personnel-based tenders.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Personnel qualifications & experience
                    </label>
                    <textarea
                      value={formData.personnel_credentials}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          personnel_credentials: e.target.value,
                        })
                      }
                      placeholder="e.g., 3 Project Managers with B.Tech, 5 Senior Engineers with 10 years experience"
                      rows={4}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm resize-none shadow-inner"
                    />
                  </div>
                </div>
              </div>

              {/* Step 5: Turnover */}
              <div
                className={`transition-all duration-500 ${step === 5 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
                  Scale Factor.
                </h2>
                <p className="text-sm text-slate-500 mb-8">
                  Annual turnover is used to verify eligibility for large-scale
                  tenders.
                </p>

                <div className="space-y-6">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <IndianRupee className="w-5 h-5 text-slate-300" />
                    </div>
                    <input
                      type="number"
                      value={formData.turnover}
                      onChange={(e) =>
                        setFormData({ ...formData, turnover: e.target.value })
                      }
                      placeholder="e.g. 5,000,000"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-12 pr-6 py-4 text-xl font-black text-slate-900 placeholder:text-slate-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                    <div className="bg-blue-600 p-1.5 rounded-lg shrink-0 h-fit">
                      <Activity className="w-3.5 h-3.5 text-white" />
                    </div>
                    <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                      Data is encrypted and used only for internal eligibility
                      scoring.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 6: Matching Animation */}
              <div
                className={`transition-all duration-700 ${step === 6 ? "opacity-100 block" : "hidden opacity-0"}`}
              >
                <div className="flex flex-col items-center justify-center text-center py-6 space-y-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full animate-pulse" />
                    <div className="relative bg-white border border-slate-100 p-8 rounded-[2rem] shadow-2xl">
                      {loading ? (
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                      ) : (
                        <div className="bg-green-500 p-4 rounded-full shadow-lg">
                          <Activity className="w-8 h-8 text-white" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      {loading ? "Matching..." : "Profile Synced!"}
                    </h2>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                      {loading
                        ? "Scanning available tender sources for matches."
                        : "Opening your tender intelligence command center."}
                    </p>
                  </div>

                  {loading && (
                    <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-primary w-full origin-left animate-progress" />
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Footer */}
              <div
                className={`mt-10 pt-6 border-t border-slate-100 flex items-center justify-between transition-opacity duration-300 ${step === 6 ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              >
                <button
                  onClick={prevStep}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    step === 1
                      ? "opacity-0 pointer-events-none"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={step === 5 ? handleSubmit : nextStep}
                  disabled={!isStepValid()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all"
                >
                  {step === 5 ? "Launch Intelligence" : "Continue"}{" "}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom link */}
            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors"
              >
                Already a member?{" "}
                <span className="text-slate-900 font-black underline decoration-primary/20 underline-offset-4">
                  Sign in
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

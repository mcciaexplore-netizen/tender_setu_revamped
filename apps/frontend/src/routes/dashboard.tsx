import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TenderCard } from "@/components/TenderCard";
import { useStore } from "@/lib/store";
import { useNavigate } from "@tanstack/react-router";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { activeFilter, setFilter, savedTenders, appliedTenders } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tendersList, setTendersList] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("Your Company");
  const [companySectors, setCompanySectors] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [msmeFilters, setMsmeFilters] = useState({
    udyam_priority: false,
    emd_exempt: false,
    gem_category: "",
  });

  const matchQuery = new URLSearchParams({
    ...(msmeFilters.udyam_priority ? { udyam_priority: "true" } : {}),
    ...(msmeFilters.emd_exempt ? { emd_exempt: "true" } : {}),
    ...(msmeFilters.gem_category
      ? { gem_category: msmeFilters.gem_category }
      : {}),
  }).toString();

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    setSyncMessage("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/tenders/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const retryAfter = res.headers.get("retry-after");
        let message = "Sync failed. Please try again.";
        try {
          const payload = await res.json();
          if (typeof payload.error === "string") message = payload.error;
        } catch {
          // Keep the generic message when a proxy returns a non-JSON error.
        }
        if (res.status === 429 && retryAfter) {
          const minutes = Math.max(1, Math.ceil(Number(retryAfter) / 60));
          message = `${message} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
        }
        throw new Error(message);
      }

      const startedPayload = await res.json().catch(() => null);
      if (typeof startedPayload?.message === "string") {
        setSyncMessage(startedPayload.message);
      }

      const matchesRes = await fetch(
        `${API_URL}/api/matches${matchQuery ? `?${matchQuery}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!matchesRes.ok) {
        throw new Error("Failed to load updated matches.");
      }
      const data = await matchesRes.json();

      const mappedTenders = data.map((m: any) => {
        const rawTitle = m.tender.title || "";
        const parts = rawTitle.split("/");
        const realTenderId =
          parts.length > 1
            ? parts[parts.length - 1].trim()
            : m.tender.id.substring(0, 8).toUpperCase();

        const orgMatch = m.tender.raw_text?.match(/Organisation:\s*([^\n]+)/);
        const rawOrg = orgMatch ? orgMatch[1].trim() : "";
        const cleanOrg = rawOrg.split("||")[0].trim();

        return {
          id: m.tender_id,
          title: rawTitle,
          tenderNumber: realTenderId,
          source: m.tender.source,
          issuingAuthority: cleanOrg || m.tender.source || "Public Authority",
          sector: m.tender.sector,
          contractValue: parseFloat(m.tender.value),
          deadline: m.tender.deadline,
          state: "All India",
          sourceStatus: m.tender.source_status ?? "needs_review",
          scopeOfWork: m.tender.raw_text?.substring(0, 150) + "...",
          eligibility: {
            requiredCertifications: m.tender.certifications || [],
          },
          status: "active",
          matchScore: m.overall_score,
          breakdown: {
            certifications: m.score_certifications,
            sectorExperience: m.score_sector,
            financialCapacity: m.score_financial,
            geography: m.score_geography,
            pastProjects: m.score_past_projects,
          },
        };
      });

      setTendersList(mappedTenders);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const fetchMatches = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate({ to: "/login" });
        return;
      }

      try {
        const profileRes = await fetch(`${API_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (!profileData.sectors || profileData.sectors.length === 0) {
            console.log("Incomplete profile detected, redirecting to /profile");
            navigate({ to: "/profile" });
            return;
          }
          if (profileData.companyName) {
            setCompanyName(profileData.companyName);
          }
          if (Array.isArray(profileData.sectors)) {
            setCompanySectors(profileData.sectors);
          }
        }

        const res = await fetch(
          `${API_URL}/api/matches${matchQuery ? `?${matchQuery}` : ""}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          let message = "Failed to fetch matches";
          try {
            const payload = await res.json();
            if (typeof payload.error === "string") message = payload.error;
          } catch {
            // Keep the safe fallback for non-JSON proxy responses.
          }
          throw new Error(message);
        }

        const data = await res.json();

        const mappedTenders = data.map((m: any) => {
          const rawTitle = m.tender.title || "";
          const parts = rawTitle.split("/");
          const realTenderId =
            parts.length > 1
              ? parts[parts.length - 1].trim()
              : m.tender.id.substring(0, 8).toUpperCase();

          const orgMatch = m.tender.raw_text?.match(/Organisation:\s*([^\n]+)/);
          const rawOrg = orgMatch ? orgMatch[1].trim() : "";
          const cleanOrg = rawOrg.split("||")[0].trim();

          return {
            id: m.tender_id,
            title: rawTitle,
            tenderNumber: realTenderId,
            source: m.tender.source,
            issuingAuthority: cleanOrg || m.tender.source || "Public Authority",
            sector: m.tender.sector,
            contractValue: parseFloat(m.tender.value),
            deadline: m.tender.deadline,
            state: "All India",
            sourceStatus: m.tender.source_status ?? "needs_review",
            scopeOfWork: m.tender.raw_text?.substring(0, 150) + "...",
            eligibility: {
              requiredCertifications: m.tender.certifications || [],
            },
            status: "active",
            matchScore: m.overall_score,
            breakdown: {
              certifications: m.score_certifications,
              sectorExperience: m.score_sector,
              financialCapacity: m.score_financial,
              geography: m.score_geography,
              pastProjects: m.score_past_projects,
            },
          };
        });

        setTendersList(mappedTenders);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // 1. Load initial matches from DB
    fetchMatches();

    // Scheduled crawling runs only on the backend. Browser clients fetch
    // persisted matches and may request a manual sync once per server limit.
  }, [navigate, matchQuery]);

  const filters = ["All", ...companySectors];

  const list = tendersList.filter(
    (t) => activeFilter === "All" || t.sector === activeFilter,
  );

  const closingSoonCount = tendersList.filter((t) => {
    const daysLeft =
      (new Date(t.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft > 0 && daysLeft <= 7;
  }).length;

  const avgMatchScore =
    tendersList.length > 0
      ? Math.round(
          tendersList.reduce((acc, t) => acc + (t.matchScore || 0), 0) /
            tendersList.length,
        )
      : 0;

  const stats = [
    {
      label: "New matches",
      value: tendersList.length.toString(),
      sub: "Total available",
      subClass: "text-success",
    },
    {
      label: "Closing soon",
      value: closingSoonCount.toString(),
      sub: "Within 7 days",
      subClass: "text-destructive",
    },
    {
      label: "Saved tenders",
      value: savedTenders.size.toString(),
      sub: `${appliedTenders.size} applied`,
      subClass: "text-muted-foreground",
    },
    {
      label: "Avg match score",
      value: `${avgMatchScore}%`,
      sub: "Across all matches",
      subClass: "text-success",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Your matches
              </h1>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Live Feed Active</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-500 font-bold">
              Tenders ranked for{" "}
              <span className="text-primary">{companyName}</span>.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/95 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 gap-2`}
          >
            {syncing ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Syncing Live Tenders...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                Sync Live Tenders
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {s.value}
              </p>
              <p className={`mt-1 text-xs font-medium ${s.subClass}`}>
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
          <span className="font-medium text-foreground">MSME filters</span>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={msmeFilters.udyam_priority}
              onChange={(event) =>
                setMsmeFilters((current) => ({
                  ...current,
                  udyam_priority: event.target.checked,
                }))
              }
            />{" "}
            Udyam priority
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={msmeFilters.emd_exempt}
              onChange={(event) =>
                setMsmeFilters((current) => ({
                  ...current,
                  emd_exempt: event.target.checked,
                }))
              }
            />{" "}
            EMD exempt
          </label>
          <input
            value={msmeFilters.gem_category}
            onChange={(event) =>
              setMsmeFilters((current) => ({
                ...current,
                gem_category: event.target.value,
              }))
            }
            placeholder="GeM category"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>

        <div className="mt-5 space-y-3">
          {error && (
            <div className="text-destructive p-4 bg-destructive/10 rounded-lg">
              {error}
            </div>
          )}
          {!error && syncMessage && (
            <div className="text-primary p-4 bg-primary/10 rounded-lg">
              {syncMessage}
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <div className="p-8 text-center border rounded-xl border-dashed">
              <p className="text-muted-foreground font-bold">
                Finding your matches, check back soon...
              </p>
            </div>
          )}
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <div className="skeleton mb-3 h-4 w-2/3 rounded" />
                  <div className="skeleton mb-2 h-3 w-1/3 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              ))
            : list.map((t) => <TenderCard key={t.id} tender={t} />)}
        </div>
      </main>
    </div>
  );
}

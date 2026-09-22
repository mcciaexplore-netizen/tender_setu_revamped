import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hourglass, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { TenderCard } from "@/components/TenderCard";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/closing-soon")({
  component: ClosingSoonPage,
});

function ClosingSoonPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tendersList, setTendersList] = useState<any[]>([]);

  useEffect(() => {
    const fetchMatches = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate({ to: "/login" });
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/matches`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch matches");
        const data = await res.json();

        const mapped = data.map((m: any) => {
          const rawTitle = m.tender.title || "";
          const parts = rawTitle.split("/");
          const realTenderId =
            parts.length > 1
              ? parts[parts.length - 1].trim()
              : "Unavailable";
          const orgMatch = m.tender.raw_text?.match(/Organisation:\s*([^\n]+)/);
          const rawOrg = orgMatch ? orgMatch[1].trim() : "";
          const cleanOrg = rawOrg.split("||")[0].trim();

          return {
            id: m.tender_id,
            title: rawTitle,
            tenderNumber: realTenderId,
            source: m.tender.source,
            issuingAuthority: cleanOrg || m.tender.source || "Unavailable",
            sector: m.tender.sector,
            contractValue: Number.isFinite(Number(m.tender.value)) ? Number(m.tender.value) : null,
            deadline: m.tender.deadline,
            state: m.tender.state || "Unavailable",
            sourceStatus: m.tender.source_status ?? "needs_review",
            scopeOfWork: m.tender.raw_text || "",
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
        setTendersList(mapped);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [navigate]);

  const list = tendersList.filter((t) => {
    if (!t.deadline) return false;
    const deadline = new Date(t.deadline).getTime();
    if (!Number.isFinite(deadline)) return false;
    const daysLeft = (deadline - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft > 0 && daysLeft <= 5;
  });

  return (
    <div className="min-h-screen bg-slate-50/50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">
          Closing Soon
        </h1>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
              <Hourglass className="h-6 w-6 animate-pulse" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              No urgent deadlines
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              None of your matching tenders are closing within the next 5 days.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((t) => (
              <TenderCard key={t.id} tender={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

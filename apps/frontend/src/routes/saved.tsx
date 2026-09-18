import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { TenderCard } from "@/components/TenderCard";
import { API_URL } from "@/utils/api";
import { mapRelationshipTender } from "@/lib/tenderMapper";

export const Route = createFileRoute("/saved")({
  component: SavedPage,
});

function SavedPage() {
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
        const res = await fetch(`${API_URL}/api/matches/saved`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch matches");
        const data = await res.json();

        setTendersList(data.map(mapRelationshipTender));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [navigate]);

  const list = tendersList;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">
          Saved Tenders
        </h1>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {list.map((t) => (
              <TenderCard key={t.id} tender={t} removeOnly />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
        <Bookmark className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-900">
        No saved tenders yet
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Go to your{" "}
        <Link
          to="/dashboard"
          className="text-primary font-bold hover:underline"
        >
          matches
        </Link>{" "}
        to save tenders.
      </p>
    </div>
  );
}

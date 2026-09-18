import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { TenderCard } from "@/components/TenderCard";
import { API_URL } from "@/utils/api";
import { mapRelationshipTender } from "@/lib/tenderMapper";

export const Route = createFileRoute("/applied")({
  component: AppliedPage,
});

function AppliedPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tendersList, setTendersList] = useState<any[]>([]);
  const [stages, setStages] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<
    Record<string, { notes: string; reminder_at: string }>
  >({});

  useEffect(() => {
    const fetchMatches = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate({ to: "/login" });
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/matches/applications/board`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch matches");
        const data = await res.json();

        setTendersList(data.map(mapRelationshipTender));
        setStages(
          Object.fromEntries(
            data.map((item: any) => [item.tender_id, item.stage]),
          ),
        );
        setDetails(
          Object.fromEntries(
            data.map((item: any) => [
              item.tender_id,
              {
                notes: item.notes ?? "",
                reminder_at: item.reminder_at
                  ? String(item.reminder_at).slice(0, 16)
                  : "",
              },
            ]),
          ),
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [navigate]);

  const list = tendersList;
  const updateStage = async (
    id: string,
    stage: string,
    updatedDetails = details[id],
  ) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_URL}/api/matches/${id}/application`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stage,
        notes: updatedDetails?.notes ?? "",
        reminder_at: updatedDetails?.reminder_at || null,
      }),
    });
    if (response.ok) setStages((current) => ({ ...current, [id]: stage }));
  };

  const downloadCalendar = async () => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_URL}/api/matches/calendar.ics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = "tendermatch-deadlines.ics";
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">
          Application pipeline
        </h1>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Track only tenders you have explicitly moved into a pipeline stage.
          </p>
          <button
            onClick={() => void downloadCalendar()}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Export deadlines (.ics)
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              No pipeline items yet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Mark a tender as applied from its details page to add it as
              submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="mb-2 flex justify-end">
                  <label className="text-xs text-muted-foreground">
                    Stage{" "}
                    <select
                      value={stages[t.id] ?? "discovered"}
                      onChange={(event) =>
                        void updateStage(t.id, event.target.value)
                      }
                      className="ml-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                    >
                      <option value="discovered">Discovered</option>
                      <option value="interested">Interested</option>
                      <option value="preparing">Preparing</option>
                      <option value="submitted">Submitted</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </label>
                </div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <input
                    value={details[t.id]?.notes ?? ""}
                    onChange={(event) =>
                      setDetails((current) => ({
                        ...current,
                        [t.id]: {
                          ...(current[t.id] ?? { reminder_at: "" }),
                          notes: event.target.value,
                        },
                      }))
                    }
                    onBlur={() =>
                      void updateStage(t.id, stages[t.id] ?? "discovered")
                    }
                    placeholder="Internal note"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={details[t.id]?.reminder_at ?? ""}
                    onChange={(event) => {
                      const next = {
                        ...(details[t.id] ?? { notes: "" }),
                        reminder_at: event.target.value,
                      };
                      setDetails((current) => ({ ...current, [t.id]: next }));
                      void updateStage(
                        t.id,
                        stages[t.id] ?? "discovered",
                        next,
                      );
                    }}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <TenderCard tender={t} showApplied removeAppliedOnly />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

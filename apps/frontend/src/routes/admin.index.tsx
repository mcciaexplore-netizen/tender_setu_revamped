import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type Stat = {
  label: string;
  value: string;
  sub: string;
  subClass: string;
  valueClass?: string;
};
type Review = {
  id: string;
  severity: "red" | "amber";
  tenderName: string;
  source: string;
  fileType: string;
  receivedAgo: string;
  badge: string;
  rawText?: string;
  parsedData?: Record<string, unknown>;
};
type Source = {
  name: string;
  count: number;
  status: "green" | "amber" | "red";
};

function AdminDashboard() {
  const { selectedReviewTender, setSelectedReview } = useStore();
  const [stats, setStats] = useState<Stat[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Review[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState("");

  const resolveReview = async (
    review: Review,
    status: "resolved" | "rejected",
  ) => {
    const token = localStorage.getItem("token");
    if (!token) return setError("Your administrator session is unavailable.");
    if (status === "resolved" && !review.parsedData?.title) {
      return setError(
        "This item has no verified structured data to publish. Edit it in a source-review workflow first.",
      );
    }
    const response = await fetch(
      `${API_URL}/api/admin/review-queue/${review.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          resolved_tender_data:
            status === "resolved" ? review.parsedData : undefined,
        }),
      },
    );
    if (!response.ok) return setError("Unable to update this review item.");
    setReviewQueue((items) => items.filter((item) => item.id !== review.id));
    setSelectedReview(null);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Sign in as an administrator to view live administrative data.");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/admin/stats`, { headers }),
      fetch(`${API_URL}/api/admin/review-queue`, { headers }),
      fetch(`${API_URL}/api/admin/sources`, { headers }),
    ])
      .then(async ([statsResponse, reviewsResponse, sourcesResponse]) => {
        if (!statsResponse.ok || !reviewsResponse.ok || !sourcesResponse.ok)
          throw new Error("Live administrative data is unavailable.");
        const summary = await statsResponse.json();
        const reviews = await reviewsResponse.json();
        const sourceRows = await sourcesResponse.json();
        setStats([
          {
            label: "Tenders",
            value: String(summary.tenders),
            sub: "Database total",
            subClass: "text-muted-foreground",
          },
          {
            label: "Companies",
            value: String(summary.companies),
            sub: "Registered",
            subClass: "text-muted-foreground",
          },
          {
            label: "Matches",
            value: String(summary.matches),
            sub: "Calculated",
            subClass: "text-muted-foreground",
          },
          {
            label: "Needs review",
            value: String(summary.pending_reviews),
            sub: "Awaiting evidence",
            subClass: "text-warning",
          },
        ]);
        setReviewQueue(
          reviews.map((item: any) => ({
            id: item.id,
            severity:
              item.confidence_score !== null && item.confidence_score < 50
                ? "red"
                : "amber",
            tenderName: item.source ?? "Source unavailable",
            source: item.source ?? "Unavailable",
            fileType: "Extracted record",
            receivedAgo: item.created_at
              ? new Date(item.created_at).toLocaleString("en-IN")
              : "Unavailable",
            badge: item.review_reason ?? "Needs review",
            rawText: item.tender_raw_text,
            parsedData: item.parsed_data ?? undefined,
          })),
        );
        setSources(
          sourceRows.map((item: any) => ({
            name: item.source ?? "Unavailable",
            count: Number(item.count) || 0,
            status: item.has_unreviewed ? "amber" : "green",
          })),
        );
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
              <Shield className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              TenderMatch Admin
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Last sync: 4 min ago
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {error || "Live administrative data. No sample values are shown."}
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
              <p
                className={`mt-1 text-2xl font-semibold ${s.valueClass ?? "text-foreground"}`}
              >
                {s.value}
              </p>
              <p className={`mt-1 text-xs font-medium ${s.subClass}`}>
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Manual review queue
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {reviewQueue.length} items waiting
                </p>
              </div>
              <ul>
                {reviewQueue.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() =>
                        setSelectedReview(
                          selectedReviewTender === r.id ? null : r.id,
                        )
                      }
                      className={`flex w-full items-center gap-3 border-b border-border px-5 py-4 text-left transition-colors hover:bg-secondary/40 ${
                        selectedReviewTender === r.id ? "bg-secondary/40" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          r.severity === "red" ? "bg-destructive" : "bg-warning"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.tenderName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.source} · {r.fileType} · {r.receivedAgo}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                          r.severity === "red"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {r.badge}
                      </span>
                      <div className="hidden gap-1.5 sm:flex">
                        <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium">
                          Edit
                        </span>
                        <span className="rounded-md bg-success px-2.5 py-1 text-xs font-medium text-success-foreground">
                          Approve
                        </span>
                      </div>
                    </button>
                    {selectedReviewTender === r.id && (
                      <div className="border-b border-border bg-secondary/20 p-5">
                        <pre className="max-h-56 overflow-auto text-xs text-muted-foreground">
                          {r.rawText ?? "Raw source text unavailable."}
                        </pre>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => void resolveReview(r, "rejected")}
                            className="rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                          >
                            Reject source
                          </button>
                          <button
                            disabled={!r.parsedData?.title}
                            onClick={() => void resolveReview(r, "resolved")}
                            className="rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground disabled:opacity-50"
                          >
                            Publish verified data
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                Source health
              </h2>
            </div>
            <ul>
              {sources.map((s) => {
                const max = Math.max(...sources.map((x) => x.count), 1);
                const pct = (s.count / max) * 100;
                const dot =
                  s.status === "green"
                    ? "bg-success"
                    : s.status === "amber"
                      ? "bg-warning"
                      : "bg-destructive";
                return (
                  <li
                    key={s.name}
                    className="border-b border-border px-5 py-3 last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                        <span className="text-sm font-medium text-foreground">
                          {s.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {s.count} tenders
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-secondary">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

function InlineEditor() {
  const [deadline, setDeadline] = useState("");
  const [turnover, setTurnover] = useState("");
  const [sector, setSector] = useState("Construction");

  const fieldClass = (
    val: string,
    defaultBorder: "green" | "red" | "amber",
  ) => {
    const filled = val.length > 0;
    const border =
      filled || defaultBorder === "green"
        ? "border-success"
        : defaultBorder === "red"
          ? "border-destructive"
          : "border-warning";
    return `w-full rounded-md border-2 ${border} bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20`;
  };

  return (
    <div className="border-b border-border bg-secondary/20 p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Raw extracted text
          </p>
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {`NOTICE INVITING TENDER
Tender no.: MH/PWD/2025/RD-1184
Issuing authority: PWD Nashik Division

Scope: `}
            <mark className="bg-warning/20 text-warning">
              Resurfacing of 14.2 km of state highway SH-21
            </mark>
            {` between
Nashik and Sinnar including bituminous concrete overlay, drainage
repair and roadside furniture replacement.

Estimated cost: `}
            <mark className="bg-warning/20 text-warning">Rs. 8.4 crore</mark>
            {`
EMD: 2% of estimated cost
Submission: ___________________ `}
            <span className="text-destructive">
              [MISSING — could not parse date]
            </span>
            {`
Eligibility: Class 1 contractors with relevant experience
Min annual turnover: __________ `}
            <span className="text-destructive">[MISSING]</span>
            {`
Pre-bid meeting: 14th day at site office
Page 3 likely contains submission deadline — OCR confidence low.`}
          </pre>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Extracted fields — fix and confirm
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Tender title
              </label>
              <input
                readOnly
                value="Resurfacing of state highway SH-21, Nashik–Sinnar"
                className="w-full rounded-md border-2 border-success bg-secondary/40 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Estimated value
              </label>
              <input
                readOnly
                value="Rs. 8.4 Cr"
                className="w-full rounded-md border-2 border-success bg-secondary/40 px-3 py-2 text-sm"
              />
              <ConfidenceBar value={92} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Submission deadline
              </label>
              <input
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="DD MMM YYYY"
                className={fieldClass(deadline, "red")}
              />
              <p className="mt-1 text-xs font-medium text-primary">
                AI could not locate — check page 3
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Min turnover required
              </label>
              <input
                value={turnover}
                onChange={(e) => setTurnover(e.target.value)}
                placeholder="e.g. Rs. 5,00,00,000"
                className={fieldClass(turnover, "red")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Sector / category
              </label>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className={fieldClass(sector, "amber")}
              />
              <ConfidenceBar value={74} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-destructive">
          Cannot publish until all required fields are filled
        </p>
        <div className="flex gap-2">
          <button className="rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5">
            Reject
          </button>
          <button className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Save draft
          </button>
          <button className="rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/90">
            Approve & publish
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-md bg-secondary">
        <div className="h-full bg-success" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

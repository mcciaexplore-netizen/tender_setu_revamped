import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, Clock, Trash2 } from "lucide-react";
import { type Tender, formatINR, daysUntil } from "@/lib/mockData";
import { useEffect, useState } from "react";
import { API_URL } from "@/utils/api";

function scoreColor(score: number) {
  if (score >= 80) return "bg-success/10 text-success border-success/20";
  if (score >= 60) return "bg-warning/10 text-warning border-warning/20";
  return "bg-secondary text-muted-foreground border-border";
}

export function TenderCard({
  tender,
  showApplied = false,
  removeOnly = false,
  removeAppliedOnly = false,
}: {
  tender: Tender;
  showApplied?: boolean;
  removeOnly?: boolean;
  removeAppliedOnly?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${API_URL}/api/matches/${tender.id}/relationship`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((relationship) => {
        if (relationship) {
          setSaved(Boolean(relationship.saved));
          setApplied(Boolean(relationship.applied));
        }
      })
      .catch(() => undefined);
  }, [tender.id]);

  const updateRelationship = async (
    kind: "save" | "apply",
    currentlySet: boolean,
  ) => {
    const token = localStorage.getItem("token");
    if (!token || updating) return;
    setUpdating(true);
    try {
      const response = await fetch(
        `${API_URL}/api/matches/${tender.id}/${kind}`,
        {
          method: currentlySet ? "DELETE" : "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error("Unable to update tender status.");
      if (kind === "save") setSaved(!currentlySet);
      else setApplied(!currentlySet);
    } finally {
      setUpdating(false);
    }
  };
  const days = daysUntil(tender.deadline);
  const urgent = days <= 3;
  const sourceLabel = (tender.sourceStatus ?? "needs_review").replace(
    /_/g,
    " ",
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug text-foreground">
            {tender.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tender.issuingAuthority} ·{" "}
            <span className="font-medium">{tender.source}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span className="font-medium text-foreground">
              {formatINR(tender.contractValue)}
            </span>
            <span
              className={`flex items-center gap-1.5 ${urgent ? "text-destructive" : "text-muted-foreground"}`}
            >
              <Clock className="h-3.5 w-3.5" />
              {urgent
                ? `${days} day${days === 1 ? "" : "s"} left`
                : tender.deadline
                  ? `Due ${new Date(tender.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                  : "Deadline unavailable"}
            </span>
          </div>
        </div>

        <div
          className={`shrink-0 rounded-md border px-2.5 py-1 text-sm font-semibold ${scoreColor(tender.matchScore)}`}
        >
          {tender.matchScore}%
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {tender.sector}
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {tender.state}
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
            {sourceLabel}
          </span>
          {tender.eligibility.requiredCertifications.slice(0, 2).map((c) => (
            <span
              key={c}
              className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
          {showApplied && applied && (
            <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              Applied
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {removeAppliedOnly ? (
            <button
              onClick={() => updateRelationship("apply", applied)}
              disabled={updating}
              className="rounded-md border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
              aria-label="Remove from applied"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => updateRelationship("save", saved)}
              disabled={updating}
              className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={saved ? "Remove bookmark" : "Save tender"}
            >
              {saved || removeOnly ? (
                <BookmarkCheck className="h-4 w-4 text-primary" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </button>
          )}
          <Link
            to="/tender/$id"
            params={{ id: tender.id }}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View details
          </Link>
        </div>
      </div>
    </div>
  );
}

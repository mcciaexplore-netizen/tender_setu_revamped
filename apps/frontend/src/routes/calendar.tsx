import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

type CalendarTender = {
  id: string;
  title: string;
  deadline: string;
  source: string | null;
  source_status: string;
  stage: string | null;
  is_saved: boolean;
  is_applied: boolean;
};

const monthName = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CalendarTender[]>([]);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate({ to: "/login" });
      return;
    }
    fetch(`${API_URL}/api/matches/calendar`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Unable to load the deadline calendar.",
          );
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [navigate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarTender[]>();
    for (const item of items) {
      const date = new Date(item.deadline);
      if (Number.isNaN(date.getTime())) continue;
      const key = dateKey(date);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const exportCalendar = async () => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_URL}/api/matches/calendar.ics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      return setError("Unable to export the deadline calendar.");
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = "tendermatch-deadlines.ics";
    link.click();
    URL.revokeObjectURL(href);
  };

  const today = dateKey(new Date());
  const monthEvents = items.filter((item) => {
    const date = new Date(item.deadline);
    return (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Deadline calendar
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved, applied, and pipeline tender deadlines. Dates unavailable
              in the tender record are not shown.
            </p>
          </div>
          <button
            onClick={() => void exportCalendar()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> Export (.ics)
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
            <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-semibold text-foreground">
                  {monthName.format(month)}
                </h2>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-7 border-l border-t border-border">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (name) => (
                    <div
                      key={name}
                      className="border-b border-r border-border bg-secondary px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                    >
                      {name}
                    </div>
                  ),
                )}
                {days.map((day) => {
                  const key = dateKey(day);
                  const events = eventsByDate.get(key) ?? [];
                  const outside = day.getMonth() !== month.getMonth();
                  return (
                    <div
                      key={key}
                      className={`min-h-28 border-b border-r border-border p-1.5 ${outside ? "bg-secondary/40" : "bg-card"}`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === today ? "bg-primary font-medium text-primary-foreground" : outside ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-1 space-y-1">
                        {events.slice(0, 2).map((event) => (
                          <Link
                            key={event.id}
                            to="/tender/$id"
                            params={{ id: event.id }}
                            title={event.title}
                            className={`block truncate rounded px-1.5 py-1 text-[11px] font-medium ${event.is_applied ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}
                          >
                            {event.title}
                          </Link>
                        ))}
                        {events.length > 2 && (
                          <span className="block px-1 text-[11px] text-muted-foreground">
                            +{events.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <aside className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium text-foreground">This month</h2>
              {monthEvents.length ? (
                <ul className="mt-3 space-y-3">
                  {monthEvents.map((event) => (
                    <li key={event.id}>
                      <Link
                        to="/tender/$id"
                        params={{ id: event.id }}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {event.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {shortDate.format(new Date(event.deadline))}
                        {event.stage
                          ? ` · ${event.stage}`
                          : event.is_saved
                            ? " · saved"
                            : " · applied"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No recorded tender deadlines this month.
                </p>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

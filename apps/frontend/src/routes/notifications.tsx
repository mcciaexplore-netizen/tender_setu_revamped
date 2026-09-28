import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { INDIAN_STATES } from "@/lib/indianLocations";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

const AVAILABLE_SECTORS = [
  "IT",
  "Construction",
  "Healthcare",
  "Services",
  "Manufacturing",
  "Defence",
  "Education",
  "Transport",
  "Energy",
  "Agriculture",
  "Other",
];

interface AlertFilter {
  id: string;
  name: string;
  sectors: string[];
  states: string[];
  districts: string[];
  keywords: string[];
  min_value: string | number | null;
  max_value: string | number | null;
  email_enabled: boolean;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  tender_id: string;
  tender_title: string;
  tender_deadline: string | null;
}

const emptyFormState = {
  name: "",
  sectors: [] as string[],
  states: [] as string[],
  districts: "",
  keywords: "",
  min_value: "",
  max_value: "",
  email_enabled: true,
};

function NotificationsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<AlertFilter[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadAll = async () => {
    const headers = authHeaders();
    if (!headers) {
      navigate({ to: "/login" });
      return;
    }
    try {
      const [notificationsRes, filtersRes] = await Promise.all([
        fetch(`${API_URL}/api/notifications`, { headers }),
        fetch(`${API_URL}/api/notifications/filters`, { headers }),
      ]);
      if (!notificationsRes.ok || !filtersRes.ok) throw new Error("Unable to load notifications.");
      const notificationsData = await notificationsRes.json();
      const filtersData = await filtersRes.json();
      setNotifications(notificationsData.notifications);
      setUnreadCount(notificationsData.unread_count);
      setFilters(filtersData);
    } catch (cause: any) {
      setError(cause.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm(emptyFormState);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (filter: AlertFilter) => {
    setForm({
      name: filter.name,
      sectors: filter.sectors,
      states: filter.states,
      districts: filter.districts.join(", "),
      keywords: filter.keywords.join(", "),
      min_value: filter.min_value === null ? "" : String(filter.min_value),
      max_value: filter.max_value === null ? "" : String(filter.max_value),
      email_enabled: filter.email_enabled,
    });
    setEditingId(filter.id);
    setShowForm(true);
  };

  const toggleSector = (sector: string) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }));
  };

  const toggleState = (state: string) => {
    setForm((prev) => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter((s) => s !== state)
        : [...prev.states, state],
    }));
  };

  const submitFilter = async () => {
    const headers = authHeaders();
    if (!headers) return navigate({ to: "/login" });
    if (form.name.trim().length < 2) {
      setFormError("Give this alert a name.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        sectors: form.sectors,
        states: form.states,
        districts: form.districts.split(",").map((d) => d.trim()).filter(Boolean),
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        min_value: form.min_value === "" ? null : Number(form.min_value),
        max_value: form.max_value === "" ? null : Number(form.max_value),
        email_enabled: form.email_enabled,
      };
      const url = editingId
        ? `${API_URL}/api/notifications/filters/${editingId}`
        : `${API_URL}/api/notifications/filters`;
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save this alert.");
      setFilters((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? data : item))
          : [data, ...current],
      );
      setShowForm(false);
      resetForm();
    } catch (cause: any) {
      setFormError(cause.message || "Unable to save this alert.");
    } finally {
      setSaving(false);
    }
  };

  const deleteFilter = async (id: string) => {
    const headers = authHeaders();
    if (!headers) return navigate({ to: "/login" });
    const response = await fetch(`${API_URL}/api/notifications/filters/${id}`, {
      method: "DELETE",
      headers,
    });
    if (response.ok) setFilters((current) => current.filter((item) => item.id !== id));
  };

  const markRead = async (id: string) => {
    const headers = authHeaders();
    if (!headers) return;
    const response = await fetch(`${API_URL}/api/notifications/${id}/read`, {
      method: "PUT",
      headers,
    });
    if (response.ok) {
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  };

  const markAllRead = async () => {
    const headers = authHeaders();
    if (!headers) return;
    const response = await fetch(`${API_URL}/api/notifications/read-all`, {
      method: "PUT",
      headers,
    });
    if (response.ok) {
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Notification Center
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Mark all as read ({unreadCount})
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Section title="My customized alerts">
          <p className="mb-4 text-sm text-muted-foreground">
            Define rules for sector, location, keywords, or value range. A daily job
            matches new tenders against these rules and notifies you here (and by
            email, if enabled).
          </p>

          <div className="space-y-3">
            {filters.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground">No custom alerts yet.</p>
            )}
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-secondary/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{filter.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      filter.sectors.length ? `Sectors: ${filter.sectors.join(", ")}` : null,
                      filter.states.length ? `States: ${filter.states.join(", ")}` : null,
                      filter.districts.length ? `Districts: ${filter.districts.join(", ")}` : null,
                      filter.keywords.length ? `Keywords: ${filter.keywords.join(", ")}` : null,
                      filter.min_value !== null ? `Min ₹${filter.min_value}` : null,
                      filter.max_value !== null ? `Max ₹${filter.max_value}` : null,
                      filter.email_enabled ? "Email: on" : "Email: off",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No criteria set — matches every new tender."}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => startEdit(filter)}
                    className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Edit alert"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void deleteFilter(filter.id)}
                    className="rounded-md border border-border bg-card p-1.5 text-destructive hover:bg-destructive/10"
                    aria-label="Delete alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showForm ? (
            <div className="mt-4 space-y-4 rounded-md border border-border bg-card p-4">
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Alert name</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. IT tenders in Maharashtra"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Sectors (any)</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_SECTORS.map((sector) => (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => toggleSector(sector)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        form.sectors.includes(sector)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {sector}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">States (any)</p>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {INDIAN_STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        form.states.includes(state)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Districts (comma separated, any)
                  </label>
                  <input
                    value={form.districts}
                    onChange={(event) => setForm({ ...form, districts: event.target.value })}
                    placeholder="Pune, Nagpur"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Keywords (comma separated, any)
                  </label>
                  <input
                    value={form.keywords}
                    onChange={(event) => setForm({ ...form, keywords: event.target.value })}
                    placeholder="server, networking"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Minimum value (₹)
                  </label>
                  <input
                    type="number"
                    value={form.min_value}
                    onChange={(event) => setForm({ ...form, min_value: event.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Maximum value (₹)
                  </label>
                  <input
                    type="number"
                    value={form.max_value}
                    onChange={(event) => setForm({ ...form, max_value: event.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.email_enabled}
                  onChange={(event) => setForm({ ...form, email_enabled: event.target.checked })}
                />
                Also email me a daily digest for this alert
              </label>

              <div className="flex gap-2">
                <button
                  onClick={() => void submitFilter()}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create alert"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add new alert
            </button>
          )}
        </Section>

        <Section title="Notification inbox">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alert matches yet. New tenders are checked against your rules daily.
            </p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md border p-3 text-sm ${
                    item.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        {!item.is_read && <Bell className="h-3.5 w-3.5 text-primary" />}
                        {item.title}
                      </p>
                      <p className="mt-1 text-muted-foreground">{item.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        to="/tender/$id"
                        params={{ id: item.tender_id }}
                        onClick={() => !item.is_read && void markRead(item.id)}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        View tender
                      </Link>
                      {!item.is_read && (
                        <button
                          onClick={() => void markRead(item.id)}
                          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

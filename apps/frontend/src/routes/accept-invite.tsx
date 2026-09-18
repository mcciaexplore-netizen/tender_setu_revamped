import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<{
    email: string;
    role: string;
    companyName: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This invitation link is incomplete.");
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/auth/invitations/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to open this invitation.");
        }
        setInvitation(data);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [token]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to accept this invitation.");
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("companyId", data.companyId);
      localStorage.setItem(
        "companyName",
        invitation?.companyName ?? "Your Company",
      );
      localStorage.setItem("email", invitation?.email ?? "");
      navigate({ to: "/dashboard" });
    } catch (cause: any) {
      setError(cause.message || "Unable to accept this invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Join TenderMatch
        </h1>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : error && !invitation ? (
          <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : invitation ? (
          <form className="mt-5 space-y-4" onSubmit={accept}>
            <p className="text-sm text-muted-foreground">
              You were invited to join{" "}
              <span className="font-medium text-foreground">
                {invitation.companyName}
              </span>{" "}
              as{" "}
              <span className="font-medium text-foreground">
                {invitation.role.replace("_", " ")}
              </span>
              .
            </p>
            <label className="block text-sm font-medium text-foreground">
              Work email
              <input
                value={invitation.email}
                readOnly
                className="mt-1 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-muted-foreground"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Create password
              <input
                type="password"
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Confirm password
              <input
                type="password"
                minLength={12}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={submitting || password.length < 12}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Joining…" : "Accept invitation"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

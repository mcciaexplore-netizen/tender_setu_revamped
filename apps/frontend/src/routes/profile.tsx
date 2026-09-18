import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Pencil, Save, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatINR } from "@/lib/mockData";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completeness, setCompleteness] = useState<{
    checks: Array<{ label: string; complete: boolean }>;
    complete: number;
    total: number;
  } | null>(null);
  const [documents, setDocuments] = useState<
    Array<{
      id: string;
      document_type: string;
      file_name: string;
      created_at: string;
    }>
  >([]);
  const [team, setTeam] = useState<
    Array<{ id: string; email: string; role: string }>
  >([]);
  const [invitations, setInvitations] = useState<
    Array<{ id: string; email: string; role: string; expires_at: string }>
  >([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("bid_manager");
  const [inviteLink, setInviteLink] = useState("");
  const [inviting, setInviting] = useState(false);
  const [documentType, setDocumentType] = useState("other");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("No token found in localStorage");
        navigate({ to: "/login" });
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      try {
        console.log("Fetching profile from backend...");
        const res = await fetch(`${API_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        console.log("Profile data received:", data);
        setProfile(data);
        const completenessResponse = await fetch(
          `${API_URL}/api/company/completeness`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (completenessResponse.ok)
          setCompleteness(await completenessResponse.json());
        const [documentsResponse, teamResponse, invitationsResponse] =
          await Promise.all([
            fetch(`${API_URL}/api/company/documents`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/api/company/team`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/api/company/team/invitations`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);
        if (documentsResponse.ok) setDocuments(await documentsResponse.json());
        if (teamResponse.ok) setTeam(await teamResponse.json());
        if (invitationsResponse.ok)
          setInvitations(await invitationsResponse.json());
      } catch (err: any) {
        console.error("Profile fetch error:", err);
        if (err.name === "AbortError") {
          setError("Request timed out. The server might be slow or down.");
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleSave = async () => {
    if (!editing) {
      setEditing(true);
      return;
    }

    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });

      if (!res.ok) throw new Error("Failed to save profile");
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
            Syncing Intelligence...
          </p>
        </div>
      </div>
    );

  if (error || !profile)
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] p-6 text-center">
          <div className="bg-red-50 text-red-600 p-8 rounded-[2rem] border border-red-100 max-w-md shadow-2xl shadow-red-100/50">
            <h2 className="text-2xl font-black mb-2">Sync Failed</h2>
            <p className="text-sm font-medium mb-6 opacity-80">
              {error ||
                "Unable to retrieve your company profile. Please try logging in again."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white font-black py-3 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
            >
              Retry Sync
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                navigate({ to: "/login" });
              }}
              className="mt-3 w-full bg-white text-red-600 border border-red-100 font-black py-3 rounded-xl hover:bg-red-50 transition-all"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );

  const max = Math.max(...profile.turnover, 1);
  const canManageTeam = ["owner", "admin"].includes(profile.role);

  const uploadDocument = async (file: File | undefined) => {
    const token = localStorage.getItem("token");
    if (!file || !token) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("document_type", documentType);
      form.append("file", file);
      const response = await fetch(`${API_URL}/api/company/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) throw new Error("Unable to upload this document.");
      const uploadedDocument = await response.json();
      setDocuments((items) => [uploadedDocument, ...items]);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setUploading(false);
    }
  };

  const updateTeamRole = async (userId: string, role: string) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_URL}/api/company/team/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      setError("Unable to update this team role.");
      return;
    }
    const updated = await response.json();
    setTeam((items) =>
      items.map((item) =>
        item.id === userId ? { ...item, role: updated.role } : item,
      ),
    );
  };

  const downloadDocument = async (id: string, fileName: string) => {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${API_URL}/api/company/documents/${id}/download`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return setError("Unable to download this document.");
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(href);
  };

  const createInvitation = async () => {
    const token = localStorage.getItem("token");
    if (!token || !inviteEmail.trim()) return;
    setInviting(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/company/team/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to create invitation.");
      const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(data.token)}`;
      setInviteLink(link);
      setInvitations((items) => [data, ...items]);
      setInviteEmail("");
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* The selectable link remains available below. */
      }
    } catch (cause: any) {
      setError(cause.message || "Unable to create invitation.");
    } finally {
      setInviting(false);
    }
  };

  const revokeInvitation = async (id: string) => {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${API_URL}/api/company/team/invitations/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) return setError("Unable to revoke this invitation.");
    setInvitations((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Company profile
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                <Save className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              {saving ? "Saving..." : editing ? "Save profile" : "Edit profile"}
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                navigate({ to: "/login" });
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <Section title="Company info">
          <Grid>
            <Field
              label="Company name"
              value={profile.companyName}
              editing={editing}
              onChange={(v) => setProfile({ ...profile, companyName: v })}
            />
            <Field
              label="Work Email"
              value={profile.email}
              editing={editing}
              onChange={(v) => setProfile({ ...profile, email: v })}
            />
            <Field
              label="Entity type"
              value={profile.entityType || "N/A"}
              editing={editing}
              onChange={(v) => setProfile({ ...profile, entityType: v })}
            />
            <Field
              label="Registration"
              value="Not available"
              editing={false}
              onChange={() => {}}
            />
          </Grid>
        </Section>

        <Section title="Sectors and states">
          <div className="space-y-3">
            <EditableTags
              label="Sectors"
              items={profile.sectors || []}
              editing={editing}
              options={AVAILABLE_SECTORS}
              onChange={(newSectors) =>
                setProfile({ ...profile, sectors: newSectors })
              }
            />
            <Tags label="States served" items={profile.states || []} />
          </div>
        </Section>

        <Section title="Financial info">
          <p className="mb-3 text-sm text-muted-foreground">
            Annual turnover (Self Reported)
          </p>
          <div className="flex items-end gap-6 h-48 pt-10">
            {profile.turnover.map((v: number, i: number) => (
              <div key={i} className="flex flex-1 flex-col items-center group">
                <div className="text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">
                  {formatINR(v)}
                </div>
                <div className="mt-2 flex h-32 w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-primary/20 group-hover:bg-primary transition-all duration-500"
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                </div>
                <div className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  FY {2024 - i}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Certifications">
          <EditableTags
            label=""
            items={profile.certifications || []}
            editing={editing}
            options={AVAILABLE_CERTIFICATIONS}
            onChange={(newCerts) =>
              setProfile({ ...profile, certifications: newCerts })
            }
          />
        </Section>

        <Section title="Personnel Credentials">
          <p className="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Team qualifications, roles & experience
          </p>
          {editing ? (
            <textarea
              value={profile.personnel_credentials || ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  personnel_credentials: e.target.value,
                })
              }
              placeholder="e.g., 3 Project Managers with B.Tech, 5 Senior Engineers with 10 years experience"
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all resize-none shadow-inner"
            />
          ) : (
            <p className="text-sm font-bold text-slate-800 whitespace-pre-line leading-relaxed bg-slate-50/50 p-5 rounded-2xl border border-slate-100/50">
              {profile.personnel_credentials ||
                "No personnel credentials specified yet. Click 'Edit profile' to add your team's details."}
            </p>
          )}
        </Section>

        <Section title="Document vault and profile completeness">
          {!completeness ? (
            <p className="text-sm text-muted-foreground">
              Completeness information is unavailable.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {completeness.complete} of {completeness.total} documented
                business requirements are present.
              </p>
              <div className="flex flex-wrap gap-2">
                {completeness.checks.map((check) => (
                  <span
                    key={check.label}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${check.complete ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}
                  >
                    {check.label}: {check.complete ? "documented" : "missing"}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Document upload is available through the secured
                company-document API; a document-management screen will expose
                it after the unified frontend build is verified.
              </p>
            </>
          )}
        </Section>

        <Section title="Company document vault">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="udyam">Udyam</option>
              <option value="gst">GST</option>
              <option value="pan">PAN</option>
              <option value="iso_certificate">ISO certificate</option>
              <option value="past_project_proof">Past project proof</option>
              <option value="other">Other</option>
            </select>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={uploading}
              onChange={(event) => void uploadDocument(event.target.files?.[0])}
              className="text-sm text-muted-foreground"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            PDF, JPG, or PNG up to 5 MB. Files are stored in the configured
            company database record.
          </p>
          <ul className="mt-4 space-y-2">
            {documents.length ? (
              documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm"
                >
                  <span>{document.file_name}</span>
                  <button
                    onClick={() =>
                      void downloadDocument(document.id, document.file_name)
                    }
                    className="text-primary hover:underline"
                  >
                    Download
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                No company documents uploaded.
              </li>
            )}
          </ul>
        </Section>

        <Section title="Team roles">
          <p className="mb-3 text-sm text-muted-foreground">
            Owners and administrators can set roles and create a secure invite
            link. Share the link manually; TenderMatch does not send an email on
            your behalf.
          </p>
          {canManageTeam && (
            <div className="mb-4 rounded-md border border-border bg-secondary/40 p-3">
              <p className="mb-2 text-sm font-medium text-foreground">
                Invite a teammate
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@company.com"
                  className="min-w-52 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="owner">Owner</option>
                  <option value="bid_manager">Bid Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => void createInvitation()}
                  disabled={inviting || !inviteEmail.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {inviting ? "Creating…" : "Create invite link"}
                </button>
              </div>
              {inviteLink && (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-muted-foreground">
                    This link is shown once and expires in 7 days.
                  </p>
                  <input
                    value={inviteLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                    aria-label="Invitation link"
                  />
                </div>
              )}
            </div>
          )}
          <ul className="space-y-2">
            {team.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{member.email}</span>
                <select
                  value={member.role}
                  onChange={(event) =>
                    void updateTeamRole(member.id, event.target.value)
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  disabled={!canManageTeam}
                >
                  <option value="owner">Owner</option>
                  <option value="bid_manager">Bid Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              </li>
            ))}
          </ul>
          {canManageTeam && invitations.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-foreground">
                Pending invitations
              </p>
              <ul className="space-y-2">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-sm"
                  >
                    <span>
                      {invitation.email} · {invitation.role.replace("_", " ")} ·
                      expires{" "}
                      {new Date(invitation.expires_at).toLocaleDateString(
                        "en-IN",
                      )}
                    </span>
                    <button
                      onClick={() => void revokeInvitation(invitation.id)}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Past projects">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Client type</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Year</th>
                </tr>
              </thead>
              <tbody>
                {(profile.pastProjects || []).map((p: any) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.clientType}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {formatINR(p.value)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.sector}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50">
      <h2 className="mb-6 text-xs font-black uppercase tracking-widest text-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {editing ? (
        <input
          value={value || ""}
          onChange={(e) => onChange && onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
        />
      ) : (
        <p className="text-sm font-bold text-slate-900">
          {value || "Not provided"}
        </p>
      )}
    </div>
  );
}

function Tags({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      {label && (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span
            key={i}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide border border-slate-200/50"
          >
            {i}
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs italic text-slate-400">None specified</span>
        )}
      </div>
    </div>
  );
}

const AVAILABLE_SECTORS = [
  "IT",
  "Defence",
  "Construction",
  "Services",
  "Transport",
  "Education",
  "Manufacturing",
];
const AVAILABLE_CERTIFICATIONS = ["ISO 9001", "MSME", "ISO 27001", "ISO 14001"];

function EditableTags({
  label,
  items,
  editing,
  options,
  onChange,
}: {
  label: string;
  items: string[];
  editing: boolean;
  options: string[];
  onChange: (items: string[]) => void;
}) {
  const toggleItem = (item: string) => {
    if (items.includes(item)) {
      onChange(items.filter((i) => i !== item));
    } else {
      onChange([...items, item]);
    }
  };

  return (
    <div>
      {label && (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editing
          ? options.map((opt) => {
              const selected = items.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleItem(opt)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide border transition-all ${
                    selected
                      ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {opt}
                </button>
              );
            })
          : items.map((i) => (
              <span
                key={i}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide border border-slate-200/50"
              >
                {i}
              </span>
            ))}
        {!editing && items.length === 0 && (
          <span className="text-xs italic text-slate-400">None specified</span>
        )}
      </div>
    </div>
  );
}

import {
  createFileRoute,
  Link,
  useParams,
  useNavigate,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Check,
  Loader2,
  Copy,
  AlertCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useState, useEffect } from "react";
import { formatINR, daysUntil } from "@/lib/mockData";
import { API_URL } from "@/utils/api";

export const Route = createFileRoute("/tender/$id")({
  component: TenderDetail,
});

const breakdownLabels: Record<string, string> = {
  certifications: "Certifications match",
  sectorExperience: "Sector experience",
  financialCapacity: "Financial capacity",
  geography: "Geographic match",
  pastProjects: "Past project similarity",
};

function getRealTenderNumber(data: any): string {
  // 1. Check if raw text has an explicit Reference Number (e.g. Ref/Type: 1 or GEM/2026/B/7433500)
  const refMatch = data.raw_text?.match(/Ref\/Type:\s*([^\n]+)/i);
  if (
    refMatch &&
    refMatch[1] &&
    refMatch[1].trim().length > 1 &&
    !/^\d+$/.test(refMatch[1].trim())
  ) {
    return refMatch[1].trim();
  }

  // 2. Search for GeM Bid format in title or raw text (e.g. GEM/2026/B/7433500)
  const gemMatch =
    data.title?.match(/GEM\/\d{4}\/[A-Z]\/\d+/i) ||
    data.raw_text?.match(/GEM\/\d{4}\/[A-Z]\/\d+/i);
  if (gemMatch) {
    return gemMatch[0];
  }

  // 3. Search for CPPP format in title (e.g. 2026_MES_767829_1)
  const cpppMatch =
    data.title?.match(/(\d{4}_[A-Z0-9]+_\d+_\d+)/i) ||
    data.raw_text?.match(/(\d{4}_[A-Z0-9]+_\d+_\d+)/i);
  if (cpppMatch) {
    return cpppMatch[1];
  }

  // 4. Try to pull digit ID from show-bid-details URL
  if (data.url) {
    const urlMatch = data.url.match(/show-bid-details\/([^\/\s\?]+)/);
    if (urlMatch && urlMatch[1] && urlMatch[1].length > 4) {
      return urlMatch[1];
    }
  }

  // 5. Try to find "Tender No" or "Ref No" in raw text
  const noMatch = data.raw_text?.match(
    /(?:tender|ref|bid)\s*(?:no|number)\.?\s*:\s*([^\n,;\|]+)/i,
  );
  if (noMatch && noMatch[1] && noMatch[1].trim().length > 3) {
    return noMatch[1].trim();
  }

  // 6. Split by slash as a generic fallback
  const titleParts = data.title?.split("/") || [];
  if (titleParts.length > 1) {
    const lastPart = titleParts[titleParts.length - 1].trim();
    if (lastPart.length > 4) return lastPart;
  }

  return "Search by Title";
}

function TenderDetail() {
  const { id } = useParams({ from: "/tender/$id" });
  const navigate = useNavigate();
  const [tender, setTender] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [eligibilityGaps, setEligibilityGaps] = useState<Array<{
    type: string;
    requirement: string;
    status: string;
  }> | null>(null);
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<
    Array<{
      id: string;
      question: string;
      created_at: string;
      response: {
        answer_available: boolean;
        answer_kind: "record_field" | "source_excerpt" | "unavailable";
        answer: string;
        citations: Array<{ label: string; text: string }>;
        needs_manual_review: boolean;
      };
    }>
  >([]);
  const [askError, setAskError] = useState("");
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const fetchTenderAndProfile = async () => {
      const token = localStorage.getItem("token");
      try {
        // Fetch Tender
        const res = await fetch(`${API_URL}/api/tenders/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Tender not found");
        const data = await res.json();

        const rawTitle = data.title || "";
        const parts = rawTitle.split("/");
        const realTenderId = getRealTenderNumber(data);

        const orgMatch = data.raw_text?.match(/Organisation:\s*([^\n]+)/);
        const rawOrg = orgMatch ? orgMatch[1].trim() : "";
        const cleanOrg = rawOrg.split("||")[0].trim();

        const mapped = {
          id: data.id,
          title: rawTitle,
          tenderNumber: realTenderId,
          organisation: cleanOrg || data.source || "Government Portal",
          source: data.source || "Government Portal",
          issuingAuthority: cleanOrg || data.source || "Public Authority",
          sector: data.sector || "General",
          state: data.state || "All India",
          sourceStatus: data.source_status ?? "needs_review",
          contractValue:
            data.value === null || data.value === undefined
              ? null
              : Number(data.value),
          deadline: data.deadline ?? null,
          url: data.url,
          emdAmount:
            data.emd_amount === null || data.emd_amount === undefined
              ? null
              : Number(data.emd_amount),
          matchScore: data.match_score || 0,
          breakdown: {
            certifications: data.score_certifications || 0,
            sectorExperience: data.score_sector || 0,
            financialCapacity: data.score_financial || 0,
            geography: data.score_geography || 0,
            pastProjects: data.score_past_projects || 0,
          },
          scopeOfWork: data.raw_text || "Details pending manual verification.",
          evaluationCriteria: null,
          eligibility: {
            minTurnover:
              data.minimum_turnover === null ||
              data.minimum_turnover === undefined
                ? null
                : Number(data.minimum_turnover),
            minYearsInBusiness: data.minimum_years_in_business ?? null,
            entityTypes: Array.isArray(data.allowed_entity_types)
              ? data.allowed_entity_types
              : [],
            requiredCertifications: data.certifications || [],
          },
          personnelRequirements:
            data.personnel_requirements || "None required.",
        };
        setTender(mapped);

        if (token) {
          const relationship = await fetch(
            `${API_URL}/api/matches/${id}/relationship`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (relationship.ok) {
            const value = await relationship.json();
            setSaved(Boolean(value.saved));
            setApplied(Boolean(value.applied));
          }
          const gapResponse = await fetch(
            `${API_URL}/api/tenders/${id}/gap-report`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (gapResponse.ok) {
            const report = await gapResponse.json();
            setEligibilityGaps(Array.isArray(report.gaps) ? report.gaps : []);
          }
          const questionsResponse = await fetch(
            `${API_URL}/api/tenders/${id}/questions`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (questionsResponse.ok) {
            setQuestions(await questionsResponse.json());
          }
        }

        // Fetch Profile for Pre-Qualification Check
        if (token) {
          try {
            const profileRes = await fetch(`${API_URL}/api/auth/profile`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              setCompanyProfile(profileData);
            }
          } catch (profileErr) {
            console.error("Failed to fetch company profile:", profileErr);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTenderAndProfile();
  }, [id]);

  const askTender = async (prompt = question) => {
    const token = localStorage.getItem("token");
    if (!token) return navigate({ to: "/login" });
    if (!tender || prompt.trim().length < 3) return;
    setAsking(true);
    setAskError("");
    try {
      const response = await fetch(`${API_URL}/api/tenders/${tender.id}/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: prompt.trim() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Tender research is unavailable.");
      setQuestions((items) => [...items, data]);
      setQuestion("");
    } catch (cause: any) {
      setAskError(cause.message || "Tender research is unavailable.");
    } finally {
      setAsking(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );

  if (error || !tender) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-6 py-12 text-center text-muted-foreground">
          <p className="text-xl font-bold text-slate-900 mb-4">
            {error || "Tender not found."}
          </p>
          <Link to="/dashboard" className="text-primary font-bold underline">
            Back to matches
          </Link>
        </div>
      </div>
    );
  }

  const days = daysUntil(tender.deadline);
  const urgent = days <= 3;
  const isSearchByTitle = tender.tenderNumber === "Search by Title";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to matches
        </Link>

        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-blue-600 shrink-0" />
            <div className="w-full">
              <h3 className="text-sm font-bold text-blue-900">
                Official Portal Search Helper
              </h3>
              <p className="mt-1 text-xs text-blue-700 leading-relaxed">
                Indian government tenders are published across different
                systems. Copy these parameters and paste them directly on the
                correct official search page linked below:
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* 1. Tender Reference ID */}
                <div className="flex items-center justify-between gap-3 bg-white border border-blue-200 rounded-lg px-3 py-2 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {isSearchByTitle
                        ? "Search Keyword"
                        : "Tender ID / Ref No"}
                    </span>
                    <span className="text-xs font-black text-slate-900 font-mono tracking-wider line-clamp-1">
                      {tender.tenderNumber}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        isSearchByTitle ? tender.title : tender.tenderNumber,
                      );
                      alert(
                        isSearchByTitle
                          ? "Tender title copied for search!"
                          : "Tender ID copied to clipboard!",
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 hover:bg-blue-100 p-1.5 text-xs font-bold text-blue-700 transition-colors shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy{" "}
                    {isSearchByTitle ? "Title" : "ID"}
                  </button>
                </div>

                {/* 2. Organisation Name */}
                <div className="flex items-center justify-between gap-3 bg-white border border-blue-200 rounded-lg px-3 py-2 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Organisation Name
                    </span>
                    <span className="text-xs font-black text-slate-900 line-clamp-1">
                      {tender.organisation}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tender.organisation);
                      alert("Organisation name copied to clipboard!");
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 hover:bg-blue-100 p-1.5 text-xs font-bold text-blue-700 transition-colors shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>

                {/* 3. Source Portal */}
                <div className="flex items-center justify-between gap-3 bg-white border border-blue-200 rounded-lg px-3 py-2 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Source Portal
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      {tender.source}
                    </span>
                  </div>
                </div>
              </div>

              {/* Portal Guidance & Link recommendation */}
              <div className="mt-4 border-t border-blue-200/50 pt-4">
                <p className="text-xs font-semibold text-blue-900 mb-2">
                  🎯 Recommended Portal to Search:
                </p>
                {tender.source?.toLowerCase().includes("gem") ? (
                  <div>
                    <p className="text-xs text-blue-700 leading-relaxed mb-3">
                      This is a **Government e-Marketplace (GeM)** bid. Search
                      for the copied Tender ID directly on the official GeM
                      BidPlus search portal.
                    </p>
                    <a
                      href="https://bidplus.gem.gov.in/all-bids"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200 animate-pulse"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open GeM BidPlus
                      Search Portal
                    </a>
                  </div>
                ) : tender.source?.toLowerCase().includes("aiims") ? (
                  <div>
                    <p className="text-xs text-blue-700 leading-relaxed mb-3">
                      This is an **AIIMS Hospital** tender. Search for it on the
                      main AIIMS Delhi tenders portal page.
                    </p>
                    <a
                      href="https://www.aiims.edu/index.php/en/tenders/aiims-tender"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200 animate-pulse"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open AIIMS Delhi
                      Tenders Portal
                    </a>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-blue-700 leading-relaxed mb-3">
                      This is a **Central Public Procurement Portal (CPPP)
                      eProcure** tender.
                      <br />
                      <strong className="text-amber-800">
                        ⚠️ IMPORTANT PORTAL ROUTING:
                      </strong>{" "}
                      Make sure you search on the main **eProcurement System**
                      website (`eprocure.gov.in/eprocure/app`), **NOT** the
                      ePublishing system page you are currently viewing, as they
                      are separate databases!
                    </p>
                    <a
                      href="https://eprocure.gov.in/eprocure/app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200 animate-pulse"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open eProcurement
                      Portal (Correct Site)
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider">
              Tender ID: {tender.tenderNumber}
            </span>
            <span className="bg-success/10 text-success border border-success/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              Active Portal Bid
            </span>
          </div>
          <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-[22px]">
            {tender.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              tender.source,
              tender.issuingAuthority,
              tender.sector,
              tender.state,
              (tender.sourceStatus ?? "needs_review").replace(/_/g, " "),
            ].map((b, i) => (
              <span
                key={`${b}-${i}`}
                className="rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground"
              >
                {b}
              </span>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoBox
              label="Contract value"
              value={formatINR(tender.contractValue)}
            />
            <InfoBox
              label="Deadline"
              value={`${days} day${days === 1 ? "" : "s"} left`}
              accent={urgent ? "danger" : undefined}
            />
            <InfoBox label="EMD amount" value={formatINR(tender.emdAmount)} />
          </div>
        </div>

        {/* Dynamic Pre-Qualification and Profile Checklist Side-by-Side Comparison */}
        <div className="mt-5 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
                Pre-Qualification Checklist
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compare what the tender requires against the information filled
                in your company profile.
              </p>
            </div>
            <Link
              to="/profile"
              className="rounded-lg bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/20 transition-colors"
            >
              ✏️ Update Profile Credentials
            </Link>
          </div>

          <div className="overflow-x-auto border border-border rounded-lg bg-secondary/5">
            <table className="w-full border-collapse text-left text-xs min-w-[500px]">
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <th className="p-3 font-semibold text-muted-foreground">
                    Parameter
                  </th>
                  <th className="p-3 font-semibold text-muted-foreground">
                    Required by Tender
                  </th>
                  <th className="p-3 font-semibold text-muted-foreground">
                    Your Profile Credentials
                  </th>
                  <th className="p-3 font-semibold text-muted-foreground text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* 1. Sector */}
                <tr>
                  <td className="p-3 font-semibold text-foreground">
                    Sector Match
                  </td>
                  <td className="p-3 text-muted-foreground font-mono font-bold">
                    {tender.sector}
                  </td>
                  <td className="p-3 text-muted-foreground font-mono">
                    {companyProfile?.sectors?.join(", ") || "Not Configured"}
                  </td>
                  <td className="p-3 text-center">
                    {companyProfile?.sectors?.includes(tender.sector) ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-success/20 p-1.5 text-success font-bold">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive font-black text-xs">
                        Missing
                      </span>
                    )}
                  </td>
                </tr>

                {/* 2. Certifications */}
                <tr>
                  <td className="p-3 font-semibold text-foreground">
                    Mandatory Certifications
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {tender.eligibility.requiredCertifications.length > 0
                      ? tender.eligibility.requiredCertifications.map(
                          (c: string) => (
                            <span
                              key={c}
                              className="inline-block bg-secondary px-1.5 py-0.5 rounded text-[10px] mr-1 font-semibold text-muted-foreground border border-border"
                            >
                              {c}
                            </span>
                          ),
                        )
                      : "None required"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {companyProfile?.certifications?.length > 0
                      ? companyProfile.certifications.map((c: string) => (
                          <span
                            key={c}
                            className="inline-block bg-primary/10 px-1.5 py-0.5 rounded text-[10px] mr-1 font-semibold text-primary border border-primary/20"
                          >
                            {c}
                          </span>
                        ))
                      : "None configured"}
                  </td>
                  <td className="p-3 text-center">
                    {tender.eligibility.requiredCertifications.every(
                      (c: string) =>
                        companyProfile?.certifications?.includes(c),
                    ) ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-success/20 p-1.5 text-success font-bold">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive font-black text-xs">
                        Missing
                      </span>
                    )}
                  </td>
                </tr>

                {/* 3. Personnel Experience */}
                <tr>
                  <td className="p-3 font-semibold text-foreground">
                    Personnel Requirements
                  </td>
                  <td className="p-3 text-muted-foreground font-medium italic">
                    {tender.personnelRequirements}
                  </td>
                  <td className="p-3 text-muted-foreground font-medium">
                    {companyProfile?.personnel_credentials || "None configured"}
                  </td>
                  <td className="p-3 text-center">
                    {companyProfile?.personnel_credentials ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-success/20 p-1.5 text-success font-bold">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive font-black text-xs">
                        Missing
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-primary/30 bg-accent/40 p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Overall match
            </p>
            <p className="mt-1 text-4xl font-semibold text-primary">
              {tender.matchScore}% match
            </p>
          </div>
          <div className="mt-6 space-y-3">
            {Object.entries(tender.breakdown).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {breakdownLabels[k]}
                  </span>
                  <span className="font-medium text-muted-foreground">
                    {v as number}/100
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-md bg-card">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Card title="Scope of work">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tender.scopeOfWork}
              </p>
            </Card>
            <Card title="Evaluation criteria">
              <p className="text-sm text-muted-foreground">
                Not available in the extracted tender record.
              </p>
            </Card>
            <Card title="Form Fields to Keep Ready">
              <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
                When submitting your bid on eProcure, the online form will
                prompt you to enter the following common fields. Gather these
                details in advance:
              </p>
              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-black text-primary shrink-0">•</span>
                  <span>
                    <strong>Bidder Profile</strong>: Company CIN/LLPIN,
                    registered address, and authorized contact details (verified
                    via OTP during registration).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-primary shrink-0">•</span>
                  <span>
                    <strong>DSC Representative</strong>: The exact full name and
                    email of the director/authorized partner linked to the Class
                    3 DSC token.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-primary shrink-0">•</span>
                  <span>
                    <strong>Fee/EMD Payment</strong>: Bank Transaction UTR
                    Number, payment date, and the sending bank's IFSC code (or
                    MSME number if claiming fee exemption).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-primary shrink-0">•</span>
                  <span>
                    <strong>Financial Turnover</strong>: Absolute turnover
                    values in INR for the last 3 financial years (used by
                    eProcure to evaluate minimum turnover eligibility).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-primary shrink-0">•</span>
                  <span>
                    <strong>Price Bid Quote</strong>: Basic unit rate and GST
                    percentage. These must be filled inside the official Excel{" "}
                    <strong>BOQ (Bill of Quantities)</strong> downloaded from
                    the portal.
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Eligibility criteria">
              <dl className="space-y-3 text-sm">
                <Row
                  label="Min turnover"
                  value={formatINR(tender.eligibility.minTurnover)}
                />
                <Row
                  label="Min years in business"
                  value={
                    tender.eligibility.minYearsInBusiness === null
                      ? "Not available"
                      : `${tender.eligibility.minYearsInBusiness} years`
                  }
                />
                <Row
                  label="Allowed entity types"
                  value={
                    tender.eligibility.entityTypes.length
                      ? tender.eligibility.entityTypes.join(", ")
                      : "Not available"
                  }
                />
              </dl>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-foreground">
                  Required certifications
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tender.eligibility.requiredCertifications.map(
                    (c: string) => (
                      <span
                        key={c}
                        className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
                      >
                        {c}
                      </span>
                    ),
                  )}
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-foreground">
                  Delivery state
                </p>
                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                  {tender.state}
                </span>
              </div>
            </Card>

            <Card title="Eligibility gap report">
              {eligibilityGaps === null ? (
                <p className="text-sm text-muted-foreground">
                  Sign in to compare your documented profile with the extracted
                  tender requirements.
                </p>
              ) : eligibilityGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No documented gaps were found in the available tender
                  evidence. This is not a guarantee of eligibility.
                </p>
              ) : (
                <ul className="space-y-2">
                  {eligibilityGaps.map((gap, index) => (
                    <li
                      key={`${gap.type}-${index}`}
                      className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {gap.type}:{" "}
                      </span>
                      {gap.requirement}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Ask this tender">
              <p className="mb-3 text-sm text-muted-foreground">
                Source-grounded research only. Answers quote the tender record
                or extracted text; unavailable details are never guessed.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  "What is the deadline?",
                  "What is the EMD requirement?",
                  "What are the eligibility requirements?",
                  "What personnel requirements apply?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void askTender(suggestion)}
                    disabled={asking}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="e.g. What is the EMD requirement?"
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  disabled={asking || question.trim().length < 3}
                  onClick={() => void askTender()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {asking ? "Researching…" : "Ask"}
                </button>
              </div>
              {askError && (
                <p className="mt-2 text-sm text-destructive">{askError}</p>
              )}
              {questions.length > 0 && (
                <div className="mt-4 space-y-3">
                  {questions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-border p-3 text-sm"
                    >
                      <p className="font-medium text-foreground">
                        {item.question}
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        {item.response.answer}
                      </p>
                      {item.response.citations.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {item.response.citations.map((citation, index) => (
                            <li
                              key={`${item.id}-${index}`}
                              className="rounded-md bg-secondary p-2 text-muted-foreground"
                            >
                              <span className="block text-xs font-medium text-foreground">
                                {citation.label}
                              </span>
                              {citation.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.response.needs_manual_review && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          This tender has not been manually verified; confirm
                          against the source document.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Portal Enrollment Pre-requisites">
              <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
                Before submitting your bid on the government portal, make sure
                your company has these essential credentials and documents
                ready:
              </p>
              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-black text-amber-600 shrink-0">•</span>
                  <span>
                    <strong>Class 3 DSC (Digital Signature)</strong>: A secure
                    USB token is mandatory to digitally sign and authorize all
                    uploaded bidding files.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-amber-600 shrink-0">•</span>
                  <span>
                    <strong>Active Vendor Account</strong>: Complete vendor
                    registration on eProcure/CPPP portal to obtain your secure
                    username and password.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-amber-600 shrink-0">•</span>
                  <span>
                    <strong>Tax & Business Proofs</strong>: Scanned PDFs of
                    Company PAN Card, GSTIN Registration, and Certificate of
                    Incorporation.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-amber-600 shrink-0">•</span>
                  <span>
                    <strong>EMD Transaction Funds</strong>:{" "}
                    <strong>
                      {tender.emdAmount === null
                        ? "Not available in the extracted tender record"
                        : formatINR(tender.emdAmount)}
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-amber-600 shrink-0">•</span>
                  <span>
                    <strong>Technical Setup</strong>: Latest version of Java
                    installed on your machine, using Microsoft Edge (IE
                    Compatibility mode) for seamless DSC token communication.
                  </span>
                </li>
              </ul>
            </Card>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <button
            onClick={async () => {
              const token = localStorage.getItem("token");
              if (!token) return navigate({ to: "/login" });
              const response = await fetch(
                `${API_URL}/api/matches/${tender.id}/save`,
                {
                  method: saved ? "DELETE" : "POST",
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              if (response.ok) setSaved(!saved);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            {saved ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            {saved ? "Saved" : "Save tender"}
          </button>
          <button
            onClick={async () => {
              const token = localStorage.getItem("token");
              if (!token) return navigate({ to: "/login" });
              const response = await fetch(
                `${API_URL}/api/matches/${tender.id}/apply`,
                {
                  method: applied ? "DELETE" : "POST",
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              if (response.ok) {
                if (!applied)
                  await fetch(
                    `${API_URL}/api/matches/${tender.id}/application`,
                    {
                      method: "PUT",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ stage: "submitted" }),
                    },
                  );
                setApplied(!applied);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <Check className="h-4 w-4" />{" "}
            {applied ? "Marked as applied" : "Mark as applied"}
          </button>
          <a
            href={
              tender.url ||
              `https://www.google.com/search?q=${encodeURIComponent(tender.title)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200"
          >
            Apply on Official Portal (Redirect){" "}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </main>
    </div>
  );
}

function InfoBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "danger";
}) {
  return (
    <div
      className={`rounded-md border p-4 ${accent === "danger" ? "border-destructive/30 bg-destructive/5" : "border-border bg-secondary/40"}`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${accent === "danger" ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-medium text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-md bg-secondary">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

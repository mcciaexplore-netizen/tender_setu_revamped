import { useState } from "react";
import { FileText, Loader2, AlertTriangle, Download } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { API_URL } from "@/utils/api";

interface TenderOnePagerData {
  procurement_specifications: {
    scope_of_work: string;
    key_deliverables: string[];
    technical_requirements: string;
  };
  eligibility_criteria: {
    minimum_turnover: string;
    experience_years: number | null;
    required_certifications: string[];
    emd_amount_and_mode: string;
  };
  payment_terms: {
    payment_schedule: string;
    milestones: string[];
    retention_money_percentage: string;
    expected_payment_timeline: string;
  };
  key_highlights: string[];
  analyzed_at: string;
  cached?: boolean;
  generation_error?: string;
}

export function TenderOnePagerModal({
  tenderId,
  tenderTitle,
}: {
  tenderId: string;
  tenderTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TenderOnePagerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchOnePager = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Sign in to generate the 1-pager summary.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/tenders/${tenderId}/one-pager`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to generate the 1-pager summary.");
      setData(body);
    } catch (cause: any) {
      setError(cause.message || "Unable to generate the 1-pager summary.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !data && !loading) void fetchOnePager();
  };

  return (
    <>
      <button
        onClick={() => handleOpenChange(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
      >
        <FileText className="h-4 w-4" /> 1-Pager Summary
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          id="one-pager-print-area"
          className="w-full overflow-y-auto sm:max-w-xl print:overflow-visible"
        >
          <SheetHeader className="print:hidden">
            <SheetTitle>1-Pager Executive Summary</SheetTitle>
            <SheetDescription className="line-clamp-2">
              {tenderTitle}
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 print:hidden">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing tender document with AI…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive print:hidden">
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              {data.generation_error && (
                <div className="mt-4 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 print:hidden">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{data.generation_error}</span>
                </div>
              )}

              {data.key_highlights.length > 0 && (
                <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4 print:hidden">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    Key highlights
                  </p>
                  <ul className="space-y-1.5 text-sm text-foreground">
                    {data.key_highlights.map((item, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interactive tabbed view (screen only) */}
              <div className="mt-4 print:hidden">
                <Tabs defaultValue="procurement">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="procurement">🛠️ Procurement</TabsTrigger>
                    <TabsTrigger value="eligibility">📋 Eligibility</TabsTrigger>
                    <TabsTrigger value="payment">💰 Payment</TabsTrigger>
                  </TabsList>

                  <TabsContent value="procurement">
                    <ProcurementSection data={data.procurement_specifications} />
                  </TabsContent>
                  <TabsContent value="eligibility">
                    <EligibilitySection data={data.eligibility_criteria} />
                  </TabsContent>
                  <TabsContent value="payment">
                    <PaymentSection data={data.payment_terms} />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Full print/export layout (hidden on screen, shown for PDF export) */}
              <div className="hidden print:block print:space-y-4">
                <h1 className="text-lg font-bold text-foreground">
                  1-Pager Executive Summary
                </h1>
                <p className="text-sm text-muted-foreground">{tenderTitle}</p>
                {data.key_highlights.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide">
                      Key highlights
                    </h2>
                    <ul className="mt-1 space-y-1 text-sm">
                      {data.key_highlights.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    🛠️ Procurement specifications
                  </h2>
                  <ProcurementSection data={data.procurement_specifications} plain />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    📋 Eligibility criteria
                  </h2>
                  <EligibilitySection data={data.eligibility_criteria} plain />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    💰 Payment terms & expected schedule
                  </h2>
                  <PaymentSection data={data.payment_terms} plain />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Generated {new Date(data.analyzed_at).toLocaleString("en-IN")}.
                  AI-generated from the extracted tender text; verify against
                  the official tender document before bidding.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between gap-2 print:hidden">
                <p className="text-[11px] text-muted-foreground">
                  Generated {new Date(data.analyzed_at).toLocaleString("en-IN")}
                  {data.cached ? " · cached" : ""}
                </p>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #one-pager-print-area, #one-pager-print-area * { visibility: visible; }
          #one-pager-print-area {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </>
  );
}

function ProcurementSection({
  data,
  plain,
}: {
  data: TenderOnePagerData["procurement_specifications"];
  plain?: boolean;
}) {
  return (
    <div className={plain ? "mt-1 space-y-3 text-sm" : "mt-4 space-y-4 text-sm"}>
      <Field label="Scope of work" value={data.scope_of_work} />
      <ListField label="Key deliverables" items={data.key_deliverables} />
      <Field label="Technical requirements" value={data.technical_requirements} />
    </div>
  );
}

function EligibilitySection({
  data,
  plain,
}: {
  data: TenderOnePagerData["eligibility_criteria"];
  plain?: boolean;
}) {
  return (
    <div className={plain ? "mt-1 space-y-3 text-sm" : "mt-4 space-y-4 text-sm"}>
      <Field label="Minimum turnover" value={data.minimum_turnover} />
      <Field
        label="Experience required"
        value={
          data.experience_years === null
            ? "Not available in the tender record."
            : `${data.experience_years} year${data.experience_years === 1 ? "" : "s"}`
        }
      />
      <ListField label="Required certifications" items={data.required_certifications} />
      <Field label="EMD amount & mode" value={data.emd_amount_and_mode} />
    </div>
  );
}

function PaymentSection({
  data,
  plain,
}: {
  data: TenderOnePagerData["payment_terms"];
  plain?: boolean;
}) {
  return (
    <div className={plain ? "mt-1 space-y-3 text-sm" : "mt-4 space-y-4 text-sm"}>
      <Field label="Payment schedule" value={data.payment_schedule} />
      <ListField label="Milestones" items={data.milestones} />
      <Field label="Retention money %" value={data.retention_money_percentage} />
      <Field label="Expected payment timeline" value={data.expected_payment_timeline} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {items.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-foreground">
              <span className="text-primary">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-foreground">Not available in the tender record.</p>
      )}
    </div>
  );
}

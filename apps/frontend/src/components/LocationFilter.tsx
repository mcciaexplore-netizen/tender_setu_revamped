import { INDIAN_STATES, DISTRICTS_BY_STATE } from "@/lib/indianLocations";

export type AuthorityType = "state" | "central" | "psu";

export interface LocationFilterValue {
  authorityType: AuthorityType | undefined;
  state: string | undefined;
  district: string | undefined;
}

const AUTHORITY_TABS: Array<{ label: string; value: AuthorityType | undefined }> = [
  { label: "All Tenders", value: undefined },
  { label: "State Government", value: "state" },
  { label: "Central Govt", value: "central" },
];

export function LocationFilter({
  value,
  onChange,
}: {
  value: LocationFilterValue;
  onChange: (next: LocationFilterValue) => void;
}) {
  const districts = value.state ? DISTRICTS_BY_STATE[value.state] ?? [] : [];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
      <span className="font-medium text-foreground">Location</span>

      <div className="flex flex-wrap gap-1.5">
        {AUTHORITY_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => onChange({ ...value, authorityType: tab.value })}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              value.authorityType === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <select
        value={value.state ?? ""}
        onChange={(event) =>
          onChange({
            ...value,
            state: event.target.value || undefined,
            district: undefined,
          })
        }
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        <option value="">All states</option>
        {INDIAN_STATES.map((state) => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>

      <select
        value={value.district ?? ""}
        onChange={(event) => onChange({ ...value, district: event.target.value || undefined })}
        disabled={!value.state || districts.length === 0}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="">
          {value.state ? "All districts" : "Select a state first"}
        </option>
        {districts.map((district) => (
          <option key={district} value={district}>
            {district}
          </option>
        ))}
      </select>
    </div>
  );
}

import { Link, useLocation } from "@tanstack/react-router";
import { Bell, FileSearch, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const links = [
  { to: "/dashboard", label: "My matches" },
  { to: "/saved", label: "Saved" },
  { to: "/applied", label: "Applied" },
  { to: "/calendar", label: "Calendar" },
  { to: "/closing-soon", label: "Closing soon" },
  { to: "/profile", label: "Profile" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [initials, setInitials] = useState("US");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const email = localStorage.getItem("email") || "";
      const company = localStorage.getItem("companyName") || "";
      if (email) {
        const namePart = email.split("@")[0];
        const parts = namePart.split(/[._-]/);
        if (parts.length >= 2) {
          setInitials((parts[0][0] + parts[1][0]).toUpperCase());
        } else if (parts[0].length >= 2) {
          setInitials((parts[0][0] + parts[0][1]).toUpperCase());
        } else {
          setInitials(parts[0][0].toUpperCase());
        }
      } else if (company) {
        const parts = company.split(" ");
        if (parts.length >= 2) {
          setInitials((parts[0][0] + parts[1][0]).toUpperCase());
        } else {
          setInitials(company.substring(0, 2).toUpperCase());
        }
      }
    }
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileSearch className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            TenderMatch
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = loc.pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <img
            src="/mccia-logo.jpg"
            alt="MCCIA"
            className="hidden h-8 w-auto sm:block"
          />
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground uppercase">
            {initials}
          </div>
          <button
            className="rounded-md p-2 text-muted-foreground md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

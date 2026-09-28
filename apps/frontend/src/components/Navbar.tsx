import { Link, useLocation } from "@tanstack/react-router";
import { Bell, FileSearch, Menu, Sparkles, X } from "lucide-react";
import { useState, useEffect } from "react";
import { API_URL } from "@/utils/api";

const BOOK_CONSULTATION_URL =
  "https://bookmccia.vercel.app/book/d55b9707-51cb-4a5a-a774-37d455d06bce";

const links = [
  { to: "/dashboard", label: "My matches" },
  { to: "/saved", label: "Saved" },
  { to: "/applied", label: "Applied" },
  { to: "/calendar", label: "Calendar" },
  { to: "/closing-soon", label: "Closing soon" },
  { to: "/notifications", label: "Notifications" },
  { to: "/profile", label: "Profile" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [initials, setInitials] = useState("US");
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${API_URL}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUnreadCount(data.unread_count);
      })
      .catch(() => {
        /* Notification badge is a convenience; a failed fetch just leaves it at 0. */
      });
  }, [loc.pathname]);

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
          <a
            href={BOOK_CONSULTATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/30 transition-all duration-200 hover:from-blue-500 hover:to-purple-500 hover:shadow-md hover:shadow-indigo-500/50 sm:text-sm"
          >
            <Sparkles className="h-4 w-4 animate-pulse text-amber-300" />
            <span className="hidden sm:inline">Book AI Consultation</span>
          </a>
          <Link
            to="/notifications"
            className="relative rounded-md p-2 text-muted-foreground hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-destructive" />
            )}
          </Link>
          <img
            src="/mccia-logo.jpg"
            alt="MCCIA"
            className="h-8 w-auto"
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

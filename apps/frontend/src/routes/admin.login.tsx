import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "./login";

export const Route = createFileRoute("/admin/login")({
  component: () => <AuthCard isAdmin={true} />,
});

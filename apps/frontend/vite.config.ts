import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Dev only: forward /api to the local backend so the frontend works on any
  // machine without a machine-specific VITE_API_URL. Override the target with
  // VITE_PROXY_TARGET if the backend runs on a different port.
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:3000";

  return {
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    // Prevent an unrelated parent-directory PostCSS config from being applied.
    css: { postcss: { plugins: [] } },
    server: {
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});

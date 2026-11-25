import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the app from /Heloro/, while Vercel and local preview use the root.
const base = process.env.GITHUB_ACTIONS === "true" ? "/Heloro/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react-vendor";
          if (id.includes("/node_modules/@supabase/")) return "supabase-vendor";
          if (id.includes("/node_modules/lucide-react/")) return "icons";
          if (id.includes("/node_modules/zod/")) return "validation";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

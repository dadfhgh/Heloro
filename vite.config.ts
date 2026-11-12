import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the app from /Heloro/, while Vercel and local preview use the root.
const base = process.env.GITHUB_ACTIONS === "true" ? "/Heloro/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // heavy libs
          if (id.includes("/node_modules/ethers/")) return "ethers";

          // react core
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          )
            return "react";

          // router separated (often helps keep react chunk smaller)
          if (id.includes("/node_modules/react-router/") || id.includes("/node_modules/react-router-dom/")) return "router";

          // everything else
          return "vendor";
        },
      },
    },
  },
});

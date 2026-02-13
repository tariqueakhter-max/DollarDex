import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: { overlay: false }, // dev only: stops overlay stealing clicks
  },

  // Optional: makes `npm run preview` accessible on LAN / some setups
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
  },

  build: {
    // Keeps build warning quiet if you still have some big chunks,
    // but we also split vendors below.
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        manualChunks: {
          // Better caching + smaller initial load
          react: ["react", "react-dom", "react-router-dom"],
          ethers: ["ethers"],
        },
      },
    },
  },
});

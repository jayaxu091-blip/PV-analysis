import { defineConfig } from "vite";

export default defineConfig({
  root: "restored-app",
  publicDir: false,
  build: { outDir: "../dist", emptyOutDir: true },
  optimizeDeps: { entries: ["index.html"] },
  server: {
    fs: { allow: [process.cwd()] },
    watch: { ignored: ["**/model_output/**", "**/pole vault videos miss and makes/**", "**/.pnpm-store/**", "**/output/**", "**/.pose-tools/**", "**/.model-tools/**", "**/.video-tools/**", "**/.git*/**", "**/tmp/**", "**/backend/**", "**/tools/research_revision_2/**"] },
  },
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Shared assets dir (mrs/.gitignore ignores dist/ — keep built HTML outside dist/) */
const outDir = path.resolve(__dirname, "../assets");

function renameWidgetHtml(): Plugin {
  return {
    name: "rt4d-rename-widget-html",
    closeBundle() {
      const from = path.join(outDir, "index.html");
      const to = path.join(outDir, "rt4d-viewer.html");
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), renameWidgetHtml()],
  build: {
    outDir,
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
});

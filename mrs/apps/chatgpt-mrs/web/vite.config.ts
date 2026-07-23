import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Shared assets dir consumed by @mrs/chatgpt-app-server */
const assetsDir = path.resolve(__dirname, "../assets");

function renameWidgetHtml(): Plugin {
  return {
    name: "mrs-rename-widget-html",
    closeBundle() {
      const from = path.join(assetsDir, "index.html");
      const to = path.join(assetsDir, "mrs-viewport.html");
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), renameWidgetHtml()],
  resolve: {
    alias: [
      {
        find: "@mrs/renderer-core/render/canvas",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/render/canvas-renderer.js"
        ),
      },
      {
        find: "@mrs/renderer-core/surfaces",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/surfaces/index.js"
        ),
      },
      {
        find: "@mrs/renderer-core/math",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/math/index.js"
        ),
      },
      {
        find: "@mrs/renderer-core/inspector",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/inspector/index.js"
        ),
      },
      {
        find: "@mrs/renderer-core/live-link",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/live-link/index.js"
        ),
      },
      {
        find: "@mrs/renderer-core",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-core/src/index.js"
        ),
      },
      {
        find: "@mrs/scene-schema",
        replacement: path.resolve(
          __dirname,
          "../../../packages/scene-schema/src/index.ts"
        ),
      },
      {
        find: "@mrs/renderer-web",
        replacement: path.resolve(
          __dirname,
          "../../../packages/renderer-web/src/index.ts"
        ),
      },
    ],
  },
  build: {
    outDir: assetsDir,
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
      output: {
        entryFileNames: "mrs-viewport.js",
        assetFileNames: "mrs-viewport.[ext]",
      },
    },
  },
});

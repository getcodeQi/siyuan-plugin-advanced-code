import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    minify: "esbuild",
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["siyuan"],
      output: { assetFileNames: "index.css" },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/mandelguessr/" : "/",
  plugins: [react()],
  worker: { format: "es" },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

// The app version has exactly one home: build/config.yml's info.version.
// Injecting it here means the About screen cannot drift from the DMG name,
// because there is no second copy to forget — the failure mode this replaces
// was a release shipping with one file left behind.
//
// The two-space indent and the double quotes are load-bearing: config.yml also
// has an unindented, single-quoted `version: '3'` schema key that must not be
// picked up. Throwing rather than defaulting is deliberate — an empty version
// would silently render "· darwin/arm64" with nothing in front of it.
function appVersion(): string {
  const configPath = path.resolve(__dirname, "../build/config.yml");
  const match = fs.readFileSync(configPath, "utf8").match(/^ {2}version: "([^"]*)"/m);
  if (!match) {
    throw new Error(`${configPath}: could not read info.version (expected '  version: "x.y.z"')`);
  }
  return match[1];
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), wails("./bindings")],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "bindings"),
    },
  },
});

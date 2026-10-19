import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/* Setup shows these two: the build time and the last commit (date + short hash), so a stale cache is easy to spot. */
const git = (args) => { try { return execSync("git " + args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const now = new Date().toISOString();
const build = now.slice(0, 10) + " " + now.slice(11, 16) + " UTC";
const last = git("log -1 --format=%cs") ? git("log -1 --format=%cs") + " (" + git("log -1 --format=%h") + ")" : "unknown";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
  },
  define: {
    __BUILD__: JSON.stringify(build),
    __LAST_CHANGED__: JSON.stringify(last),
  },
});

// Copy the committed offline basemap into public/ so Vite serves it at /hohenfels.pmtiles.
// Runs automatically before `dev` and `build`. The copy in public/ is gitignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data/hohenfels.pmtiles");
const dest = resolve(here, "../public/hohenfels.pmtiles");

if (!existsSync(src)) {
  console.error(`sync-assets: source not found: ${src}\nRun backend/scripts/build_basemap.sh first.`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`sync-assets: copied basemap -> ${dest}`);

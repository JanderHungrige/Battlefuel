// Copy committed offline assets into public/ so Vite serves them:
//   - the basemap at /hohenfels.pmtiles
//   - the company logos at /logos/*           (v2 Wave 11 F3 order-mask branding)
//   - the official logistic PDFs at /docs/*    (v2 Wave 11 F8 info-docs tab)
// Runs automatically before `dev` and `build`. The copies in public/ are gitignored.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const src = resolve(repoRoot, "data/hohenfels.pmtiles");
const dest = resolve(here, "../public/hohenfels.pmtiles");

if (!existsSync(src)) {
  console.error(`sync-assets: source not found: ${src}\nRun backend/scripts/build_basemap.sh first.`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`sync-assets: copied basemap -> ${dest}`);

// Copy a directory of files (by extension allow-list) into a public/ subdirectory.
// Missing source dirs are skipped with a warning (assets are optional / may arrive later).
function copyDir(srcDir, destSub, allowExt) {
  const absSrc = resolve(repoRoot, srcDir);
  if (!existsSync(absSrc)) {
    console.warn(`sync-assets: skipping ${srcDir} (not present)`);
    return;
  }
  const absDest = resolve(here, "../public", destSub);
  mkdirSync(absDest, { recursive: true });
  let n = 0;
  for (const name of readdirSync(absSrc)) {
    if (allowExt && !allowExt.includes(extname(name).toLowerCase())) continue;
    copyFileSync(join(absSrc, name), join(absDest, name));
    n += 1;
  }
  console.log(`sync-assets: copied ${n} file(s) from ${srcDir} -> public/${destSub}/`);
}

copyDir("company Logos", "logos", [".png", ".jpg", ".jpeg", ".svg", ".webp"]);
copyDir("Official logistic documents", "docs", [".pdf"]);

// Write a manifest of the served PDFs so the Info Docs tab can list them (v2 Wave 11 F8).
// Just the filenames — the frontend derives titles/groups (pure, tested in infoDocs.ts).
const docsDir = resolve(here, "../public/docs");
const pdfs = existsSync(docsDir)
  ? readdirSync(docsDir).filter((n) => extname(n).toLowerCase() === ".pdf").sort()
  : [];
mkdirSync(docsDir, { recursive: true });
writeFileSync(join(docsDir, "manifest.json"), JSON.stringify(pdfs, null, 2));
console.log(`sync-assets: wrote docs manifest (${pdfs.length} pdf(s)) -> public/docs/manifest.json`);

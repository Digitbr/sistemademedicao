// Copia só os arquivos públicos do site para dist/ (publicação no Netlify).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const FILES = ["index.html", "login.html", "app.js", "login.js", "styles.css"];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(PUBLIC_DIR, file), path.join(DIST, file));
fs.cpSync(path.join(PUBLIC_DIR, "assets"), path.join(DIST, "assets"), { recursive: true });
console.log("Site copiado de public/ para dist/:", [...FILES, "assets/"].join(", "));

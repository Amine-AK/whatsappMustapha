// Copies the barcode reader's WebAssembly file into public/scanner/, so the app
// serves it itself (works offline, no CDN). Runs after npm install and before
// dev / build; the copy always matches the installed zxing-wasm version.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, "package.json"));
let from;
try {
  // zxing-wasm comes with barcode-detector.
  const pkg = path.dirname(require.resolve("zxing-wasm/package.json", { paths: [path.dirname(require.resolve("barcode-detector/package.json"))] }));
  from = path.join(pkg, "dist", "reader", "zxing_reader.wasm");
} catch {
  from = path.join(root, "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");
}
const to = path.join(root, "public", "scanner", "zxing_reader.wasm");
if (!existsSync(from)) {
  console.error(`copy-zxing-wasm: ${from} not found (run npm install)`);
  process.exit(1);
}
mkdirSync(path.dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`copy-zxing-wasm: ${path.relative(root, to)}`);

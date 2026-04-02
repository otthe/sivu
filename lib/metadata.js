import fs from "node:fs";
import path from "node:path";
import { extractTemplateMetadata } from "./parser.js";

//metadata registry
export const templateMeta = new Map();

// recursive scan for .sivu files
function scanTemplates(dir, baseDir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanTemplates(fullPath, baseDir, results);
    } else if (entry.isFile() && entry.name.endsWith(".sivu")) {
      const rel = path.relative(baseDir, fullPath);
      results.push({ fullPath, rel });
    }
  }

  return results;
}

export function buildTemplateMetadata(dir) {
  const files = scanTemplates(dir, dir);

  for (const { fullPath, rel } of files) {
    const content = fs.readFileSync(fullPath, "utf-8");
    const meta = extractTemplateMetadata(content);

    templateMeta.set(rel, meta);
  }
}

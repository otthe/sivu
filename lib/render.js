import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

import { templateCache, scriptCache, pruneCache } from "./cache.js";
import { compileTemplateString } from "./parser.js";
import { createContext } from "./context.js";
import { TemplateExit, TemplateRedirect } from "./error.js";

// same include syntax your parser already recognizes
const INCLUDE_TOKEN = /<\?include\s+["']([\s\S]*?)["']\s*\?>/g;

// layout filename (simple v1)
const LAYOUT_FILE = "_layout.sivu";

// where to yield:
const YIELD_MARKER_RE = /<\?=\s*\$_YIELD\s*\(\s*\)\s*;?\s*\?>/;

const MAX_COMPILED = 500; // strings
const MAX_SCRIPTS  = 200; // vm.Script objects

// ---------------------------
// Runtime helpers
// ---------------------------

function requireRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("renderTemplateByName requires runtime = { projectDir, config }");
  }
  const { projectDir, config } = runtime;
  if (!projectDir || typeof projectDir !== "string") {
    throw new Error("runtime.projectDir is required");
  }
  if (!config || typeof config !== "object") {
    throw new Error("runtime.config is required");
  }
  if (!config.template_dir_location) {
    throw new Error("config.template_dir_location is required");
  }
  return { projectDir, config };
}

function getTemplateDir(projectDir, config) {
  // projectDir should be the user project root (usually process.cwd() in CLI)
  return path.resolve(projectDir, config.template_dir_location);
}

function stripLeadingSlashes(p) {
  return String(p || "").replace(/^\/+/, "");
}

/**
 * Resolve a path under TEMPLATE_DIR safely.
 * Throws if escape is attempted.
 */
function resolveUnderTemplateDir(TEMPLATE_DIR, requested) {
  const rel = stripLeadingSlashes(requested);
  const abs = path.resolve(TEMPLATE_DIR, rel);
  if (!abs.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Path escapes template directory: " + requested);
  }
  return abs;
}

/**
 * Resolve an include path relative to baseDir, preventing escaping TEMPLATE_DIR.
 */
function resolveIncludePath(TEMPLATE_DIR, baseDir, requested) {
  const rel = stripLeadingSlashes(requested);
  const target = path.resolve(baseDir, rel);
  if (!target.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Include path escapes template directory: " + requested);
  }
  return target;
}

/**
 * Expand template source by inlining included templates recursively.
 * Returns one combined .sivu source string.
 */
async function expandTemplateSource(TEMPLATE_DIR, filePath, stack = []) {
  const normalized = path.resolve(filePath);

  if (!normalized.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Template not allowed: " + normalized);
  }

  if (stack.includes(normalized)) {
    throw new Error("Include cycle detected: " + normalized);
  }

  let src;
  try {
    src = await fs.readFile(normalized, "utf8");
  } catch {
    throw new Error("Failed to read template: " + normalized);
  }

  const baseDir = path.dirname(normalized);
  const nextStack = stack.concat([normalized]);

  // Replace include tokens with expanded content (done on raw template before compile)
  let out = "";
  let lastIndex = 0;

  for (const match of src.matchAll(INCLUDE_TOKEN)) {
    const idx = match.index ?? 0;
    out += src.slice(lastIndex, idx);

    const includeRel = (match[1] || "").trim();
    const includeAbs = resolveIncludePath(TEMPLATE_DIR, baseDir, includeRel);

    const includedSource = await expandTemplateSource(TEMPLATE_DIR, includeAbs, nextStack);
    out += includedSource;

    lastIndex = idx + match[0].length;
  }

  out += src.slice(lastIndex);
  return out;
}

// ---------------------------
// Public API
// ---------------------------

export async function renderTemplateByName(templateName, req = {}, runtime) {
  const { projectDir, config } = requireRuntime(runtime);
  const TEMPLATE_DIR = getTemplateDir(projectDir, config);

  const pagePath = resolveUnderTemplateDir(TEMPLATE_DIR, templateName);

  // Create VM context for this render (per request)
  // Pass runtime into context if you want it available there later (optional).
  const { context, cleanup } = createContext(req, pagePath, runtime);

  try {
    // 1) Expand (inline) the page first
    const expandedPageSource = await expandTemplateSource(TEMPLATE_DIR, pagePath, []);

    let finalSource = expandedPageSource;
    let finalFilename = pagePath;

    // 2) Optional layout wrapping (PHP-style: layout before + page + layout after)
    if (config.use_layout_file) {
      const layoutPath = resolveUnderTemplateDir(TEMPLATE_DIR, LAYOUT_FILE);

      let expandedLayoutSource = null;
      try {
        await fs.access(layoutPath);
        expandedLayoutSource = await expandTemplateSource(TEMPLATE_DIR, layoutPath, []);
      } catch {
        expandedLayoutSource = null;
      }

      if (expandedLayoutSource) {
        const m = expandedLayoutSource.match(YIELD_MARKER_RE);
        if (!m) {
          throw new Error(`Layout file missing <?= $_YIELD() ?> marker: ${LAYOUT_FILE}`);
        }

        const idx = m.index;
        const before = expandedLayoutSource.slice(0, idx);
        const after = expandedLayoutSource.slice(idx + m[0].length);

        finalSource = before + expandedPageSource + after;
        finalFilename = layoutPath;
      }
    }

    // 3) Compile (cached)
    // Cache key should be stable across projects + templates.
    // Use the finalFilename (layout or page) plus a hash of the pagePath used.
    
    //const cacheKey = `${finalFilename}::wrapped::${pagePath}`;
    const sourceHash = crypto.createHash("sha1").update(finalSource).digest("hex");
    const cacheKey = `${finalFilename}::wrapped::${pagePath}::${sourceHash}`;

    console.log("cache key: " + cacheKey);

    console.log("template cache size: " + templateCache.size);

    console.log("script cache size: " + scriptCache.size);

    let compiled;
    if (config.cache_compiled_templates) {
      compiled = templateCache.get(cacheKey);
      if (!compiled) {
        compiled = compileTemplateString(finalSource);
        templateCache.set(cacheKey, compiled);
        pruneCache(templateCache, MAX_COMPILED);
      }
    } else {
      compiled = compileTemplateString(finalSource);
    }

    let script;
    if (config.cache_scripts) {
      script = scriptCache.get(cacheKey);
      if (!script) {
        script = new vm.Script(`(async () => { ${compiled} })()`, {
          filename: finalFilename});
        scriptCache.set(cacheKey, script);
        pruneCache(scriptCache, MAX_SCRIPTS);
      }
    } else {
      script = new vm.Script(`(async () => { ${compiled} })()`, {
        filename: finalFilename});
    }
    
    try {
      return await script.runInContext(context);
    } catch (error) {
      if (error instanceof TemplateRedirect) throw error;
      if (error instanceof TemplateExit) return error.message || "";
      throw error;
    }
  } finally {
    cleanup();
  }
}
const fs = require("fs").promises;
const path = require("path");
const vm = require("vm");

const config = require("../config.js");
const { templateCache } = require("./cache.js");
const { compileTemplateString } = require("./parser.js");
const { createContext } = require("./context.js");
const { TemplateExit, TemplateRedirect } = require("./error.js");

// IMPORTANT: resolve to an absolute canonical path
const TEMPLATE_DIR = path.resolve(__dirname, "..", config.template_dir_location);

// same include syntax your parser already recognizes
const INCLUDE_TOKEN = /<\?include\s+["']([\s\S]*?)["']\s*\?>/g;

// where to yield:
const LAYOUT_FILE = "_layout.sivu";

// layout file should be executed in order, what comes after yield, will be executed after yield...
const YIELD_MARKER_RE = /<\?=\s*\$_YIELD\s*\(\s*\)\s*;?\s*\?>/;

/**
 * Resolve an include path relative to baseDir, preventing escaping TEMPLATE_DIR.
 */
function resolveIncludePath(baseDir, requested) {
  const rel = String(requested || "").replace(/^\/+/, ""); // strip leading /
  const target = path.resolve(baseDir, rel);

  if (!target.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Include path escapes template directory: " + requested);
  }
  return target;
}

/**
 * Expand template source by inlining included templates recursively.
 * Returns one combined .sivu source string (still contains <?sivu ...?> and <?= ... ?>).
 */
async function expandTemplateSource(filePath, stack = []) {
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

  // Replace include tokens with expanded content
  // NOTE: this is done on the raw template, before compiling to JS.
  let out = "";
  let lastIndex = 0;

  for (const match of src.matchAll(INCLUDE_TOKEN)) {
    const idx = match.index ?? 0;
    out += src.slice(lastIndex, idx);

    const includeRel = (match[1] || "").trim();
    const includeAbs = resolveIncludePath(baseDir, includeRel);

    const includedSource = await expandTemplateSource(includeAbs, nextStack);
    out += includedSource;

    lastIndex = idx + match[0].length;
  }

  out += src.slice(lastIndex);
  return out;
}

async function renderTemplateByName(templateName, req = {}) {
  const pagePath = path.resolve(TEMPLATE_DIR, String(templateName).replace(/^\/+/, ""));
  if (!pagePath.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Template not allowed: " + templateName);
  }

  const { context, cleanup } = createContext(req, pagePath);

  try {
    // Expand (inline) the page first
    const expandedPageSource = await expandTemplateSource(pagePath, []);

    let finalSource = expandedPageSource;
    let finalFilename = pagePath;

    if (config.use_layout_file) {
      const layoutPath = path.resolve(TEMPLATE_DIR, LAYOUT_FILE);

      // If layout file exists, wrap. If not, fall back to page.
      let expandedLayoutSource = null;
      try {
        await fs.access(layoutPath);
        expandedLayoutSource = await expandTemplateSource(layoutPath, []);
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

        // PHP-style: layout before + page + layout after (single script, shared scope)
        finalSource = before + expandedPageSource + after;
        finalFilename = layoutPath;
      }
    }

    // Compile (cached)
    const cacheKey = finalFilename + "::wrapped::" + templateName;
    let compiled;
    if (config.cache_compiled_templates) {
      compiled = templateCache.get(cacheKey);
      if (!compiled) {
        compiled = compileTemplateString(finalSource);
        templateCache.set(cacheKey, compiled);
      }
    } else {
      compiled = compileTemplateString(finalSource);
    }

    const script = new vm.Script(`(async () => { ${compiled} })()`, {
      filename: finalFilename,
    });

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

module.exports = { renderTemplateByName };
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
  const filePath = path.resolve(TEMPLATE_DIR, String(templateName).replace(/^\/+/, ""));

  if (!filePath.startsWith(TEMPLATE_DIR + path.sep)) {
    throw new Error("Template not allowed: " + templateName);
  }

  const { context, cleanup } = createContext(req, filePath);

  try {
    // 1) Render the requested page
    const expandedPageSource = await expandTemplateSource(filePath, []);
    const compiledPage = config.cache_compiled_templates
      ? (templateCache.get(filePath + "::page") ??
         (() => {
           const c = compileTemplateString(expandedPageSource);
           templateCache.set(filePath + "::page", c);
           return c;
         })())
      : compileTemplateString(expandedPageSource);

    const pageScript = new vm.Script(`(async () => { ${compiledPage} })()`, {
      filename: filePath,
    });

    let pageHtml;
    try {
      pageHtml = await pageScript.runInContext(context);
    } catch (error) {
      if (error instanceof TemplateRedirect) throw error;
      if (error instanceof TemplateExit) return error.message || "";
      throw error;
    }

    // 2) If layout disabled, return page as-is
    if (!config.use_layout_file) {
      return pageHtml;
    }

    // 3) Render layout with yield
    context.__sivu.yieldContent = pageHtml;

    const layoutPath = path.resolve(TEMPLATE_DIR, LAYOUT_FILE);

    // If layout file doesn't exist, fall back to page
    let layoutSrc;
    try {
      await fs.access(layoutPath);
    } catch {
      return pageHtml;
    }

    const expandedLayoutSource = await expandTemplateSource(layoutPath, []);
    const compiledLayout = config.cache_compiled_templates
      ? (templateCache.get(layoutPath + "::layout") ??
         (() => {
           const c = compileTemplateString(expandedLayoutSource);
           templateCache.set(layoutPath + "::layout", c);
           return c;
         })())
      : compileTemplateString(expandedLayoutSource);

    const layoutScript = new vm.Script(`(async () => { ${compiledLayout} })()`, {
      filename: layoutPath,
    });

    try {
      return await layoutScript.runInContext(context);
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

// async function renderTemplateByName(templateName, req = {}) {
//   const filePath = path.resolve(TEMPLATE_DIR, String(templateName).replace(/^\/+/, ""));

//   // same check as includes
//   if (!filePath.startsWith(TEMPLATE_DIR + path.sep)) {
//     throw new Error("Template not allowed: " + templateName);
//   }

//   const { context, cleanup } = createContext(req, filePath);

//   try {
//     // 1) inline includes into one big template source
//     const expandedSource = await expandTemplateSource(filePath, []);

//     console.log("expanded source: ");
//     console.log(expandedSource);

//     // 2) compile to JS (optionally cached)
//     let compiled;
//     const cacheKey = filePath + "::expanded"; // simple key; you can improve later

//     if (config.cache_compiled_templates) {
//       compiled = templateCache.get(cacheKey);
//       if (!compiled) {
//         compiled = compileTemplateString(expandedSource);
//         templateCache.set(cacheKey, compiled);
//       }
//     } else {
//       compiled = compileTemplateString(expandedSource);
//     }

//     // 3) execute once
//     const script = new vm.Script(`(async () => { ${compiled} })()`, {
//       filename: filePath,
//     });

//     try {
//       return await script.runInContext(context);
//     } catch (error) {
//       // handle control-flow signals
//       if (error instanceof TemplateRedirect) throw error;
//       if (error instanceof TemplateExit) return error.message || "";
//       throw error;
//     }
//   } finally {
//     cleanup();
//   }
// }























// const fs = require('fs').promises;
// const path = require('path');
// const config = require('../config.js');
// const { templateCache } = require('./cache.js');
// const vm = require('vm');
// const { compileTemplateString } = require('./parser.js');
// const { createContext } = require('./context.js');
// const { TemplateExit } = require('./error.js');
// const TEMPLATE_DIR = path.join(__dirname, "..", config.template_dir_location);

// function resolveIncludePath(baseDir, requested) {
//   const target = path.isAbsolute(requested)
//     ? path.normalize(requested)
//     : path.normalize(path.join(baseDir, requested));
//   if (!target.startsWith(TEMPLATE_DIR)) {
//     throw new Error('Include path escapes template directory: ' + requested);
//   }
//   return target;
// }

// async function renderTemplateByName(templateName, req = {}) {
//   const filePath = path.join(TEMPLATE_DIR, templateName);
//   const { context, cleanup } = createContext(req, filePath);
//   try {
//     return await renderTemplateFileAsync(filePath, context, []);
//   } finally {
//     cleanup(); // always close DB's
//   }
// }

// async function renderTemplateFileAsync(filePath, context, stack = []) {
//   const normalized = path.normalize(filePath);
//   if (!normalized.startsWith(TEMPLATE_DIR)) {
//     throw new Error('Template not allowed: ' + filePath);
//   }

//   if (stack.includes(normalized)) {
//     throw new Error('Include cycle detected: ' + normalized);
//   }

//   let src;
//   try {
//     src = await fs.readFile(normalized, 'utf8');
//   } catch (err) {
//     throw new Error('Failed to read template: ' + normalized);
//   }

//   // let compiled = templateCache.get(normalized);
//   // if (!compiled) {
//   //   compiled = compileTemplateString(src);
//   //   templateCache.set(normalized, compiled);
//   // }

//   let compiled = null;
//   if (config.cache_compiled_templates) {
//     compiled = templateCache.get(normalized);

//     if (!compiled) {
//       compiled = compileTemplateString(src);
//       templateCache.set(normalized, compiled);
//     }
//   } else {
//     compiled = compileTemplateString(src);
//   }

//   const prevInclude = context.__include;

//   context.__include = async function(relPath) {
//     const baseDir = path.dirname(normalized);
//     const resolved = resolveIncludePath(baseDir, relPath);
//     return await renderTemplateFileAsync(resolved, context, stack.concat([normalized]));
//   };

//   // const script = new vm.Script(`(async () => { ${compiled} })()`, {
//   //   filename: normalized,
//   // });

//   const script = new vm.Script(`(async function() { ${compiled} })()`, {
//     filename: normalized,
//   });

//   let result;
//   try {
//     result = await script.runInContext(context);
//   } catch(error) {
//     if (error instanceof TemplateExit) {
//       return error.message || "";
//     }
//     throw error;
//   } finally {
//     if (prevInclude === undefined) delete context.__include;
//     else context.__include = prevInclude;
//   }

//   return result;
// }

// module.exports = {
//   renderTemplateByName
// }
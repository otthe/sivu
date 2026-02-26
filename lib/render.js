const fs = require('fs').promises;
const path = require('path');
const config = require('../config.js');
const { templateCache } = require('./cache.js');
const vm = require('vm');
const { compileTemplateString } = require('./parser.js');
const { createContext } = require('./context.js');
const { TemplateExit } = require('./error.js');
const TEMPLATE_DIR = path.join(__dirname, "..", config.template_dir_location);

function resolveIncludePath(baseDir, requested) {
  const target = path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.normalize(path.join(baseDir, requested));
  if (!target.startsWith(TEMPLATE_DIR)) {
    throw new Error('Include path escapes template directory: ' + requested);
  }
  return target;
}

async function renderTemplateByName(templateName, req = {}) {
  const filePath = path.join(TEMPLATE_DIR, templateName);
  const { context, cleanup } = createContext(req, filePath);
  try {
    return await renderTemplateFileAsync(filePath, context, []);
  } finally {
    cleanup(); // always close DB's
  }
}

async function renderTemplateFileAsync(filePath, context, stack = []) {
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(TEMPLATE_DIR)) {
    throw new Error('Template not allowed: ' + filePath);
  }

  if (stack.includes(normalized)) {
    throw new Error('Include cycle detected: ' + normalized);
  }

  let src;
  try {
    src = await fs.readFile(normalized, 'utf8');
  } catch (err) {
    throw new Error('Failed to read template: ' + normalized);
  }

  // let compiled = templateCache.get(normalized);
  // if (!compiled) {
  //   compiled = compileTemplateString(src);
  //   templateCache.set(normalized, compiled);
  // }

  let compiled = null;
  if (config.cache_compiled_templates) {
    compiled = templateCache.get(normalized);

    if (!compiled) {
      compiled = compileTemplateString(src);
      templateCache.set(normalized, compiled);
    }
  } else {
    compiled = compileTemplateString(src);
  }

  const prevInclude = context.__include;

  context.__include = async function(relPath) {
    const baseDir = path.dirname(normalized);
    const resolved = resolveIncludePath(baseDir, relPath);
    return await renderTemplateFileAsync(resolved, context, stack.concat([normalized]));
  };

  const script = new vm.Script(`(async () => { ${compiled} })()`, {
    filename: normalized,
  });

  let result;
  try {
    result = await script.runInContext(context);
  } catch(error) {
    if (error instanceof TemplateExit) {
      return error.message || "";
    }
    throw error;
  } finally {
    if (prevInclude === undefined) delete context.__include;
    else context.__include = prevInclude;
  }

  return result;
}

module.exports = {
  renderTemplateByName
}
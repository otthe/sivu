const path = require("path");
const vm = require("vm");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const { createRequire } = require("node:module");
const { TemplateExit, TemplateRedirect } = require("./error");

// -----------------------
// Runtime helpers
// -----------------------

function requireRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("createContext requires runtime = { projectDir, config }");
  }
  const { projectDir, config } = runtime;
  if (!projectDir || typeof projectDir !== "string") {
    throw new Error("runtime.projectDir is required");
  }
  if (!config || typeof config !== "object") {
    throw new Error("runtime.config is required");
  }
  return { projectDir, config };
}

function getDataDir(projectDir, config) {
  // default to "<projectDir>/data"
  const rel = config.data_dir_location ?? "data";
  return path.resolve(projectDir, rel);
}

// -----------------------

function createContext(req = {}, templatePath, runtime) {
  const { projectDir, config } = requireRuntime(runtime);
  const DATA_DIR = getDataDir(projectDir, config);

  const openedDBs = [];

  // Ensure req.session exists (session middleware should provide it, but be defensive)
  if (!req.session) req.session = {};

  function var_dump(obj) {
    try {
      return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
    } catch (err) {
      return `<pre>[var_dump error: ${err.message}]</pre>`;
    }
  }

  // ---------------------
  // html safety helpers
  // ---------------------
  const SAFE_HTML = Symbol.for("sivu.safe_html");

  function html(raw) {
    return {
      [SAFE_HTML]: true,
      value: String(raw ?? ""),
    };
  }

  function isHtml(v) {
    return !!(v && typeof v === "object" && v[SAFE_HTML] === true);
  }

  function __toHtml(value) {
    if (value == null) return "";

    // Explicitly trusted HTML
    if (isHtml(value)) {
      return value.value;
    }

    // Auto-escape if enabled
    if (config.autoescape_html) {
      return escapeHtml(String(value));
    }

    // Raw output otherwise
    return String(value);
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function htmlentities(str) {
    if (typeof str !== "string") return str;
    return str.replace(/[\u00A0-\u9999<>&]/gim, function (i) {
      return `&#${i.charCodeAt(0)};`;
    });
  }

  function raw(value) {
    return html(value);
  }

  // ------------------------
  //db adapters
  // ------------------------
  function connect(type = "sqlite3", options = {}) {
    if (type !== "sqlite") throw new Error("Only sqlite db supported for now");

    let file = options.file || "default.db";

    // sqlite special case
    if (file !== ":memory:") {
      // Resolve relative DB files under DATA_DIR
      if (!path.isAbsolute(file)) {
        file = path.resolve(DATA_DIR, file);
      } else {
        file = path.resolve(file);
      }

      // Enforce DB must remain under data dir
      if (!file.startsWith(DATA_DIR + path.sep)) {
        throw new Error("DB path must be inside data dir");
      }
    }

    const db = new Database(file);
    openedDBs.push(db);

    return {
      query(sql, params = []) {
        return db.prepare(sql).all(...params);
      },
      get(sql, params = []) {
        return db.prepare(sql).get(...params);
      },
      run(sql, params = []) {
        return db.prepare(sql).run(...params);
      },
      close() {
        db.close();
      },
    };
  }

  function generateCsrfToken(session) {
    if (!session._csrfToken) {
      session._csrfToken = crypto.randomBytes(32).toString("hex");
    }
    return session._csrfToken;
  }

  function verifyCsrfToken(session, token) {
    if (!session._csrfToken || typeof token !== "string") return false;
    const a = Buffer.from(session._csrfToken);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /*
  function csrfField(session) {
    return `<input type="hidden" name="_csrf" value="${generateCsrfToken(session)}">`;
  }*/

  function csrfField(session) {
    const token = generateCsrfToken(session);
    // Token is safe as an attribute value, but escape anyway for defense-in-depth.
    // (hex today, but future-proof)
    const safeToken = escapeHtml(String(token));

    return html(`<input type="hidden" name="_csrf" value="${safeToken}">`);
  }

  function die(message = "") {
    throw new TemplateExit(message);
  }

  function exit(message = "") {
    throw new TemplateExit(message);
  }

  // -----------------------
  // Flash (BIFs)
  // -----------------------

  function flash(key, value) {
    req.session.__flash ??= {};
    req.session.__flash[key] = value;
    return "";
  }

  function flashPeek(key, def = null) {
    const bag = req.session.__flash || {};
    return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : def;
  }

  function flashGet(key, def = null) {
    const bag = req.session.__flash || {};
    if (!Object.prototype.hasOwnProperty.call(bag, key)) return def;
    const val = bag[key];
    delete bag[key];
    if (Object.keys(bag).length === 0) delete req.session.__flash;
    else req.session.__flash = bag;
    return val;
  }

  function flashAll() {
    const bag = req.session.__flash || {};
    delete req.session.__flash;
    return bag;
  }

  // -----------------------
  // Redirect/back (BIFs)
  // -----------------------

  function isSafeRedirectTarget(target) {
    return typeof target === "string" && target.startsWith("/") && !target.startsWith("//");
  }

  function redirect(to, status = 303) {
    if (!isSafeRedirectTarget(to)) throw new Error("Unsafe redirect target");
    throw new TemplateRedirect(to, status);
  }

  function back(status = 303, fallback = "/") {
    if (!isSafeRedirectTarget(fallback)) fallback = "/";
    throw new TemplateRedirect(fallback, status);
  }

  // Use per-template require for relative imports inside templates
  const templateRequire = createRequire(templatePath);

  // internal per-render state
  const __sivu = { yieldContent: "" };

  const context = vm.createContext({
    // exports/imports
    require: templateRequire,
    __dirname: path.dirname(templatePath),
    __filename: templatePath,
    module: { exports: {} },
    exports: {},

    // other globals
    console,
    Math,
    Date,
    JSON,
    String,
    Number,
    Array,
    Object,

    var_dump,
    escapeHtml,
    htmlentities,
    html,
    __toHtml,
    raw,

    connect,

    generateCsrfToken,
    verifyCsrfToken,
    csrfField,

    flash,
    flashPeek,
    flashGet,
    flashAll,

    redirect,
    back,

    // layout rendering
    __sivu,
    $_YIELD: () => __sivu.yieldContent,

    // control
    die,
    exit,

    // PHP-like vars
    $_GET: req.query || {},
    $_POST: req.body || {},
    $_SESSION: req.session || {},
    $_COOKIE: req.cookies || {}, // requires cookie-parser middleware to be populated
    $_ENV: process.env,
    $_SERVER: {
      requestMethod: req.method,
      requestUri: req.originalUrl,
      httpHost: req.hostname,
      httpUserAgent: req.get("user-agent"),
    },

    // useful for debugging / advanced usage
    __RUNTIME: { projectDir, config, dataDir: DATA_DIR },
  });

  return {
    context,
    cleanup: () => {
      for (const db of openedDBs) {
        try {
          db.close();
        } catch {}
      }
    },
  };
}

module.exports = { createContext };
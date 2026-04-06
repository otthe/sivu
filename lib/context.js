import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import { TemplateExit, TemplateRedirect } from "./error.js";
import { TemplateResponse } from "./response.js";

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

export function createContext(req = {}, templatePath, runtime) {
  const { projectDir, config } = requireRuntime(runtime);
  const DATA_DIR = getDataDir(projectDir, config);

  const openedDBs = [];

  // Ensure req.session exists (session middleware should provide it, but be defensive)
  if (!req.session) req.session = {};

  // ---------------------
  // html safety helpers
  // ---------------------
  const SAFE_HTML = Symbol.for("sivu.safe_html");

  function dump(obj) {
    try {
      return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
    } catch (err) {
      return `<pre>[dump error: ${err.message}]</pre>`;
    }
  }

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

  function htmlEntities(str) {
    if (typeof str !== "string") return str;
    return str.replace(/[\u00A0-\u9999<>&]/gim, function (i) {
      return `&#${i.charCodeAt(0)};`;
    });
  }

  function raw(value) {
    return html(value);
  }

  // ------------------------
  // db adapters
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

    if (config.sqlite_wal_mode) {
      db.pragma('journal_mode = WAL');
    }

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

  function csrf(session) {
    const token = generateCsrfToken(session);
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

  // ----------------------------
  //  NONCE
  // ----------------------------
  function nonce() {
    return req.res?.locals?.nonce || "";
  }

  // ----------------------------
  //  json responses
  // -----------------------------
  function status(code) {
    const n = Number(code);
    if (!Number.isInteger(n) || n < 100 || n > 599) throw new Error("Invalid status code");
    __sivu.response.status = n;
    return "";
  }
  
  function header(name, value) {
    const k = String(name || "").toLowerCase();
    if (!k) throw new Error("Header name required");
    __sivu.response.headers[k] = String(value ?? "");
    return "";
  }

  function contentType(value) {
    return header("content-type", value);
  }
  
  function json(data, code = 200) {
    const body = JSON.stringify(data);
    const headers = { ...__sivu.response.headers };
  
    // set defaults
    headers["content-type"] ??= "application/json; charset=utf-8";
  
    throw new TemplateResponse(body, {
      status: Number.isInteger(code) ? code : __sivu.response.status,
      headers,
    });
  }
  
  function send(body = "", code = null) {
    const headers = { ...__sivu.response.headers };
    throw new TemplateResponse(String(body ?? ""), {
      status: code == null ? __sivu.response.status : code,
      headers,
    });
  }

  // -----------------------
  // session management
  // -----------------------
  function sessionExists() {
    return !!req.session;
  }
  
  function sessionId() {
    return req.sessionID || null;
  }
  
  async function sessionRegenerate() {
    if (!req.session || typeof req.session.regenerate !== "function") {
      throw new Error("Session regeneration is not available");
    }
  
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
  
    return "";
  }
  
  async function sessionDestroy() {
    if (!req.session || typeof req.session.destroy !== "function") {
      throw new Error("Session destroy is not available");
    }
  
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
  
    return "";
  }
  
  async function sessionSave() {
    if (!req.session || typeof req.session.save !== "function") {
      throw new Error("Session save is not available");
    }
  
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
  
    return "";
  }
  
  async function sessionReload() {
    if (!req.session || typeof req.session.reload !== "function") {
      throw new Error("Session reload is not available");
    }
  
    await new Promise((resolve, reject) => {
      req.session.reload((err) => (err ? reject(err) : resolve()));
    });
  
    return "";
  }

  // -----------------------
  // Template module loading (ESM)
  // -----------------------
  const templateDir = path.dirname(templatePath);

  /**
   * Import a JS module from templates using ESM.
   *
   * Usage inside templates:
   *   const { formatDate } = await $import("./format.js");
   *   const pkg = await $import("some-package");
   *
   * Notes:
   * - Relative specifiers are resolved from the current template file’s directory.
   * - Bare specifiers (packages, node builtins) are passed to Node's resolver.
   */
  async function importModule(specifier) {
    if (typeof specifier !== "string" || specifier.trim() === "") {
      throw new Error("importModule(specifier) requires a non-empty string");
    }

    const s = specifier.trim();

    // Relative / absolute paths -> file URL
    if (s.startsWith("./") || s.startsWith("../") || s.startsWith("/") || s.startsWith("file:")) {
      const abs = s.startsWith("file:")
        ? s
        : path.resolve(templateDir, s); // yes, even for "/x" this becomes under templateDir; user can pass "../" etc
      const url = s.startsWith("file:") ? s : pathToFileURL(abs).href;
      const mod = await import(url);
      return mod;
    }

    // Bare specifier (package, node:fs, etc.)
    return import(s);
  }

  // internal per-render state
  //const __sivu = { yieldContent: "" };
  const __sivu = { yieldContent: "", response: { status: 200, headers: {} } };

  const context = vm.createContext({
    // IMPORTANT: CommonJS require/module/exports are intentionally NOT provided anymore.
    // Templates should use: await importModule("./x.js") or await importModule("pkg")
    // also give it shorter alias
    $importModule: importModule,
    $import: importModule, 

    __dirname: templateDir,
    __filename: templatePath,

    console, // AHA! so this needs to be shared instance between app and lib

    $dump: dump,
    $escapeHtml: escapeHtml,
    $htmlEntities: htmlEntities,
    $html: html,
    __toHtml,
    $raw: raw,

    $connect: connect,

    $generateCsrfToken: generateCsrfToken,
    $verifyCsrfToken: verifyCsrfToken,
    $csrf: csrf,

    $nonce: nonce,  //could be superglobal as well?

    $flash: flash,
    $flashPeek: flashPeek,
    $flashGet: flashGet,
    $flashAll: flashAll,

    $status: status,
    $header: header,
    $contentType: contentType,
    $json: json,
    $send: send,

    $sessionExists: sessionExists,
    $sessionId: sessionId,
    $sessionRegenerate: sessionRegenerate,
    $sessionDestroy: sessionDestroy,
    $sessionSave: sessionSave,
    $sessionReload: sessionReload,

    $redirect: redirect,
    $back: back,

    // layout rendering
    __sivu,
    $yield: () => __sivu.yieldContent,

    // control
    $die: die,
    $exit: exit,

    // superglobals
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
    __RUNTIME: { projectDir, config, dataDir: DATA_DIR }
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
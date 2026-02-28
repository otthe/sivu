/*App Factory*/

// externals
const path = require("path");
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

//internals
const { renderTemplateByName } = require("./render.js");
const { TemplateRedirect, TemplateExit } = require("./error.js");

// Needs to path to projects location
function buildPaths(projectDir, config) {
  const TEMPLATE_DIR = path.resolve(projectDir, config.template_dir_location);
  const PUBLIC_DIR = path.resolve(projectDir, config.public_dir_location);
  return { TEMPLATE_DIR, PUBLIC_DIR };
}

// Root call
function createApp({projectDir, config}) {
  const FILE_EXTENSION = ".sivu";
  const APP_403_MESSAGE = "Forbidden.";
  const APP_404_MESSAGE = "Not found.";

  const app = express();

  const {TEMPLATE_DIR, PUBLIC_DIR} = buildPaths(projectDir, config);

  // -----------------------
  // Helpers
  // -----------------------

  function isTimingSafeEqual(a, b) {
    // constant-time compare for strings (best-effort)
    if (typeof a !== "string" || typeof b !== "string") return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  /**
   * Resolve a template-relative path safely under TEMPLATE_DIR.
   * Throws on traversal or invalid resolution.
   */
  function resolveTemplatePath(requestedPath) {
    // Remove leading "/" so path.resolve doesn't treat it as absolute
    const rel = String(requestedPath).replace(/^\/+/, "");

    const resolved = path.resolve(TEMPLATE_DIR, rel);

    // Must be inside TEMPLATE_DIR (note the trailing separator)
    if (!resolved.startsWith(TEMPLATE_DIR + path.sep)) {
      throw new Error("Path traversal blocked");
    }

    return { rel, resolved };
  }

  /**
   * Validate that the requested path is a public page template (.sivu) and not a partial.
   * Returns a normalized relative path (e.g. "users/add.sivu").
   */
  function validatePublicTemplateRequest(requestedPath) {
    const { rel } = resolveTemplatePath(requestedPath);
    
    if (!rel.endsWith(FILE_EXTENSION)) {
      throw new Error("Not a sivu file");
    }

    // Disallow direct access to any path segment starting with "_" (not just basename)
    // e.g. "_header.sivu" or "admin/_secret.sivu"
    const parts = rel.split(path.sep);
    if (parts.some((p) => p.startsWith("_"))) {
      throw new Error("Partial not accessible");
    }

    return rel;
  }

  // -----------------------
  // Apply Middleware
  // -----------------------

  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: config.public_asset_caching_time,
      // optional hardening:
      fallthrough: true,
      index: false,
    })
  );

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(
    session({
      secret: config.session_secret,
      resave: false,
      saveUninitialized: false, // safer default
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: Boolean(config.cookie_secure), // set true when behind HTTPS
      },
    })
  );

  // Optional: ensure a CSRF token exists for the session (so csrfField() can rely on it)
  app.use((req, _res, next) => {
    if (!req.session._csrfToken) {
      req.session._csrfToken = crypto.randomBytes(32).toString("hex");
    }
    next();
  });

  if (config.force_csrf_middleware) {
    app.use((req, res, next) => {
      // Only enforce for state-changing methods (you can extend this)
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
        const token = req.body?._csrf;
        const expected = req.session?._csrfToken;

        if (!isTimingSafeEqual(String(token || ""), String(expected || ""))) {
          return res.status(403).send("Invalid CSRF token");
        }
      }
      next();
    });
  }

  // -----------------------
  // Routes
  // -----------------------

  app.get("/", async (req, res) => {
    if (!config.root_file) {
      return res.status(501).send("Root file is not configured");
    }

    try {
      // root_file should be something like "index.sivu"
      const rel = validatePublicTemplateRequest(config.root_file);
      const html = await renderTemplateByName(rel, req, {projectDir, config});
      res.send(html);
    } catch (error) {
      console.error(error);
      res.status(404).send(APP_404_MESSAGE);
    }
  });

  const sivuRoute = /^\/.+\.sivu$/;

  app.get(sivuRoute, async (req, res) => {
    try {
      const rel = validatePublicTemplateRequest(req.path);
      const html = await renderTemplateByName(rel, req, {projectDir, config});
      res.send(html);
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg.includes("Partial") || msg.includes("traversal") || msg.includes("Not a sivu")) {
        return res.status(403).send(APP_403_MESSAGE);
      }
      console.error(error);
      res.status(404).send(APP_404_MESSAGE);
    }
  });

  function actionNameFromPage(relPagePath) {
    // relPagePath like "add_user.sivu" or "users/add_user.sivu"
    const dir = path.dirname(relPagePath);
    const base = path.basename(relPagePath);
    const actionBase = "_" + base;
    return dir === "." ? actionBase : path.join(dir, actionBase);
  }

  app.post(sivuRoute, async (req, res) => {
    try {
      // 1) validate requested public .sivu page (not underscore)
      const relPage = validatePublicTemplateRequest(req.path);

      // 2) map to underscore action
      const relAction = actionNameFromPage(relPage);

      // 3) execute action template (it can call flash(), redirect(), etc.)
      const htmlOrEmpty = await renderTemplateByName(relAction, req, {projectDir, config});

      // If action produced output and didn't redirect, you can decide what to do:
      // - send it, or
      // - default to 204, or
      // - treat as an error
      return res.send(htmlOrEmpty ?? "");
    } catch (err) {
      if (err instanceof TemplateRedirect) {
        return res.redirect(err.status, err.location);
      }
      if (err instanceof TemplateExit) {
        return res.send(String(err.message || ""));
      }

      const msg = String(err?.message || "");
      if (msg.includes("Partial") || msg.includes("traversal") || msg.includes("Not a sivu")) {
        return res.status(403).send(APP_403_MESSAGE);
      }

      console.error(err);
      return res.status(404).send(APP_404_MESSAGE);
    }
  });

  app.use((_req, res) => {
    res.status(404).send(APP_404_MESSAGE);
  });

  return app;
}

module.exports = { createApp };


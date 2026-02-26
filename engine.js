// externals
const path = require("path");
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

// internals
const config = require("./config.js");
const { renderTemplateByName } = require("./lib/render.js");

const FILE_EXTENSION = ".sivu";
const APP_403_MESSAGE = "Forbidden.";
const APP_404_MESSAGE = "Not found.";

const app = express();

// Resolve base directories once (canonical absolute paths)
const TEMPLATE_DIR = path.resolve(__dirname, config.template_dir_location);
const PUBLIC_DIR = path.resolve(__dirname, config.public_dir_location);

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
// Middleware
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
    const html = await renderTemplateByName(rel, req);
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
    const html = await renderTemplateByName(rel, req);
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

app.post(sivuRoute, async (req, res) => {
  try {
    const rel = validatePublicTemplateRequest(req.path);
    const html = await renderTemplateByName(rel, req);
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

// Optional: default 404 for everything else
app.use((_req, res) => {
  res.status(404).send(APP_404_MESSAGE);
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});


// //externals
// const fs = require('fs').promises;
// const path = require('path');
// const vm = require('vm');
// const express = require('express');
// const session = require('express-session');
// const Database = require('better-sqlite3')
// const crypto = require("crypto");

// //internals
// const config = require('./config.js');
// const { templateCache } = require('./lib/cache.js');
// const { renderTemplateByName } = require('./lib/render.js');

// const TEMPLATE_DIR = path.join(__dirname, config.template_dir_location);

// if (!resolvedPath.startsWith(TEMPLATE_DIR + path.sep)) {
//   return res.status(403).send(APP_403_MESSAGE);
// }

// // const templateCache = new Map();
// const FILE_EXTENSION=".sivu";
// const APP_403_MESSAGE = "Forbidden.";
// const APP_404_MESSAGE = "Not found.";

// const app = express();

// app.use(express.static(path.join(__dirname, config.public_dir_location), {
//   maxAge: config.public_asset_caching_time
// }));

// // for application/x-www-form-urlencoded
// app.use(express.urlencoded({ extended: true }));

// // for application/json
// app.use(express.json());

// app.use(session({
//   secret: config.session_secret,// used to sign the session ID cookie
//   resave: false,                // don’t save session if unmodified
//   saveUninitialized: true,      // save new sessions
//   cookie: { secure: false }     // set to true with HTTPS
// }));

// if (config.force_csrf_middleware) {
//   app.use((req, res, next) => {
//     if (req.method === "POST") {
//       const token = req.body._csrf;
//       if (!req.session._csrfToken || token !== req.session._csrfToken) {
//         return res.status(403).send("Invalid CSRF token");
//       }
//     }
//     next();
//   });
// }

// app.get('/', async (req, res) => {
//   if (!config.root_file) {
//     return res.status(501).send('Root file is not configured');
//   }
//   try {
//     const html= await renderTemplateByName(config.root_file, req);
//     res.send(html);
//   } catch (error) {
//     console.error(error);
//     res.status(404).send(APP_404_MESSAGE);
//   }
// });

// app.get('/:file', async (req, res) => {
//   const fileName =req.params.file;
//   const filePath =path.join(TEMPLATE_DIR, fileName);

//   if (!filePath.startsWith(TEMPLATE_DIR)) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   if (!fileName.endsWith(FILE_EXTENSION)) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   //partials should not be directly accessible
//   if (path.basename(fileName).startsWith('_')) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   try {
//     const html = await renderTemplateByName(fileName, req);
//     res.send(html);
//   } catch (error) {
//     console.error(error);
//     res.status(404).send(APP_404_MESSAGE);
//   }
// });

// app.post('/:file', async (req, res) => {
//   const fileName = req.params.file;
//   const filePath = path.join(TEMPLATE_DIR, fileName);

//   if (!filePath.startsWith(TEMPLATE_DIR)) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   if (!fileName.endsWith(FILE_EXTENSION)) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   //partials should not be directly accessible
//   if (path.basename(fileName).startsWith('_')) {
//     return res.status(403).send(APP_403_MESSAGE);
//   }

//   try {
//     const html = await renderTemplateByName(fileName, req);
//     res.send(html);
//   } catch (error) {
//     console.error(error);
//     res.status(404).send(APP_404_MESSAGE);
//   }
// });

// app.listen(config.port, () => {
//   console.log(`Server running on port ${config.port}`);
//   console.log(global);
// });
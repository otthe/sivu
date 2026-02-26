const path = require('path');
const vm = require('vm');
const Database = require('better-sqlite3')
const crypto = require("crypto");
const { createRequire } = require("node:module");
const { TemplateExit, TemplateRedirect } = require('./error');

function createContext(req={}, templatePath) {
  const openedDBs = [];

  function var_dump(obj) {
    try {
      return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
    } catch (err) {
      return `<pre>[var_dump error: ${err.message}]</pre>`;
    }
  }
  
  function htmlspecialchars(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  function htmlentities(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[\u00A0-\u9999<>&]/gim, function (i) {
      return `&#${i.charCodeAt(0)};`;
    });
  }

  function connect(type='sqlite3', options={}){
    if (type !== 'sqlite') throw new Error('Only sqlite db supported for now');

    const file = options.file || 'default.db';
    const db = new Database(file);
    openedDBs.push(db);

    const wrapper = {
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

    return wrapper;
  }

  function generateCsrfToken(session) {
    if (!session._csrfToken) {
      session._csrfToken = crypto.randomBytes(32).toString("hex");
    }
    return session._csrfToken;
  }

  // function verifyCsrfToken(session, token) {
  //   return session._csrfToken && token === session._csrfToken;
  // }

  function verifyCsrfToken(session, token) {
    if (!session._csrfToken || typeof token !== "string") return false;
    const a = Buffer.from(session._csrfToken);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function csrfField(session) {
    return `<input type="hidden" name="_csrf" value="${generateCsrfToken(session)}">`;
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
    return ""; // so calling <?= flash(...) ?> doesn't print "undefined"
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
    // allow only site-relative paths, block protocol-relative //evil.com
    return typeof target === "string" && target.startsWith("/") && !target.startsWith("//");
  }

  function redirect(to, status = 303) {
    if (!isSafeRedirectTarget(to)) {
      throw new Error("Unsafe redirect target");
    }
    throw new TemplateRedirect(to, status);
  }

  function back(status = 303, fallback = "/") {
    // safest default: only relative fallback; referer is often absolute.
    // If you want to use referer, parse + same-origin check first.
    if (!isSafeRedirectTarget(fallback)) fallback = "/";
    throw new TemplateRedirect(fallback, status);
  }

  const templateRequire = createRequire(templatePath);

  const context = vm.createContext({
    // exports/imports
    require: templateRequire,
    __dirname: path.dirname(templatePath),
    __filename: templatePath,
    module: { exports: {} },
    exports: {},    
    
    //other
    console,
    Math,
    Date,
    JSON,
    String,
    Number,
    Array,
    Object,
    
    var_dump,
    htmlspecialchars,
    htmlentities,
    
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

    die,
    exit,
    $_GET: req.query || {},
    $_POST: req.body || {},
    $_SESSION: req.session || {},
    $_COOKIE: req.cookies || {},
    $_ENV: process.env,
    $_SERVER: {
      requestMethod: req.method,
      requestUri: req.originalUrl,
      httpHost: req.hostname,
      httpUserAgent: req.get('user-agent'),
    }
  }); // shared context
  
  //console.log(context);

  return {
    context,
    cleanup: () => {
      openedDBs.forEach((db) => {
        db.close();
      });
    }
  };
}

module.exports = {createContext};
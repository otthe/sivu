const path = require('path');
const vm = require('vm');
const Database = require('better-sqlite3')
const crypto = require("crypto");
const { createRequire } = require("node:module");
const { TemplateExit } = require('./error');

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

  function verifyCsrfToken(session, token) {
    return session._csrfToken && token === session._csrfToken;
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

  console.log(context);

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
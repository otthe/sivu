//externals
const fs = require('fs').promises;
const path = require('path');
const vm = require('vm');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3')
const crypto = require("crypto");

//internals
const config = require('./config.js');
const { templateCache } = require('./lib/cache.js');
const { renderTemplateByName } = require('./lib/render.js');

const TEMPLATE_DIR = path.join(__dirname, config.template_dir_location);
// const templateCache = new Map();
const FILE_EXTENSION=".sivu";
const APP_403_MESSAGE = "Forbidden.";
const APP_404_MESSAGE = "Not found.";

const app = express();

app.use(express.static(path.join(__dirname, config.public_dir_location), {
  maxAge: config.public_asset_caching_time
}));

// for application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// for application/json
app.use(express.json());

app.use(session({
  secret: config.session_secret,// used to sign the session ID cookie
  resave: false,                // don’t save session if unmodified
  saveUninitialized: true,      // save new sessions
  cookie: { secure: false }     // set to true with HTTPS
}));

if (config.force_csrf_middleware) {
  app.use((req, res, next) => {
    if (req.method === "POST") {
      const token = req.body._csrf;
      if (!req.session._csrfToken || token !== req.session._csrfToken) {
        return res.status(403).send("Invalid CSRF token");
      }
    }
    next();
  });
}

app.get('/', async (req, res) => {
  if (!config.root_file) {
    return res.status(501).send('Root file is not configured');
  }
  try {
    const html= await renderTemplateByName(config.root_file, req);
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(404).send(APP_404_MESSAGE);
  }
});

app.get('/:file', async (req, res) => {
  const fileName =req.params.file;
  const filePath =path.join(TEMPLATE_DIR, fileName);

  if (!filePath.startsWith(TEMPLATE_DIR)) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  if (!fileName.endsWith(FILE_EXTENSION)) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  //partials should not be directly accessible
  if (path.basename(fileName).startsWith('_')) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  try {
    const html = await renderTemplateByName(fileName, req);
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(404).send(APP_404_MESSAGE);
  }
});

app.post('/:file', async (req, res) => {
  const fileName = req.params.file;
  const filePath = path.join(TEMPLATE_DIR, fileName);

  if (!filePath.startsWith(TEMPLATE_DIR)) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  if (!fileName.endsWith(FILE_EXTENSION)) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  //partials should not be directly accessible
  if (path.basename(fileName).startsWith('_')) {
    return res.status(403).send(APP_403_MESSAGE);
  }

  try {
    const html = await renderTemplateByName(fileName, req);
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(404).send(APP_404_MESSAGE);
  }
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(global);
});
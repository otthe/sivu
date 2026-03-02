const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const path = require("node:path");

// ---- Mock render.js BEFORE requiring app.js ----
// Your app.js does: const { renderTemplateByName } = require("./render.js");
// so we must provide a function reference that stays the same, but whose behavior we can swap.

const renderModulePath = require.resolve(path.join(__dirname, "../../lib/render.js"));

let renderImpl = async () => "<p>DEFAULT</p>";
function renderTemplateByName(...args) {
  return renderImpl(...args);
}

// Inject into require cache
require.cache[renderModulePath] = {
  id: renderModulePath,
  filename: renderModulePath,
  loaded: true,
  exports: { renderTemplateByName },
};

// Now require app.js (it will capture our mocked renderTemplateByName)
const { createApp } = require("../../lib/app.js");

function makeConfig(overrides = {}) {
  return {
    template_dir_location: "templates",
    public_dir_location: "public",
    public_asset_caching_time: 0,
    session_secret: "test-secret",
    cookie_secure: false,
    force_csrf_middleware: false,
    root_file: "index.sivu",
    ...overrides,
  };
}

test("GET / returns 501 when root_file is not configured", async () => {
  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig({ root_file: "" }),
  });

  const res = await request(app).get("/");
  assert.equal(res.status, 501);
  assert.match(res.text, /Root file is not configured/);
});

test("GET / renders root_file when configured", async () => {
  renderImpl = async () => "<h1>HOME</h1>";

  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig({ root_file: "index.sivu" }),
  });

  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.equal(res.text, "<h1>HOME</h1>");
});

test("GET /users/list.sivu renders that page", async () => {
  renderImpl = async () => "<p>OK</p>";

  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig(),
  });

  const res = await request(app).get("/users/list.sivu");
  assert.equal(res.status, 200);
  assert.equal(res.text, "<p>OK</p>");
});

test("GET denies access to partials (segments starting with _)", async () => {
  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig(),
  });

  const res1 = await request(app).get("/_header.sivu");
  assert.equal(res1.status, 403);
  assert.equal(res1.text, "Forbidden.");

  const res2 = await request(app).get("/admin/_secret.sivu");
  assert.equal(res2.status, 403);
  assert.equal(res2.text, "Forbidden.");
});

test("POST maps public page to underscore action template", async () => {
  // We’ll also capture what app asked to render
  let calledWith = null;
  renderImpl = async (rel) => {
    calledWith = rel;
    return "ACTION OK";
  };

  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig(),
  });

  const res = await request(app)
    .post("/users/add.sivu")
    .type("form")
    .send({ name: "Ada" });

  assert.equal(res.status, 200);
  assert.equal(res.text, "ACTION OK");
  assert.equal(calledWith, "users/_add.sivu");
});

test("POST enforces CSRF when force_csrf_middleware=true", async () => {
  // If CSRF fails, render should not be called; we’ll set it to throw if it does.
  renderImpl = async () => {
    throw new Error("render should not be called when CSRF fails");
  };

  const app = createApp({
    projectDir: process.cwd(),
    config: makeConfig({ force_csrf_middleware: true }),
  });

  const res = await request(app)
    .post("/users/add.sivu")
    .type("form")
    .send({ name: "Ada", _csrf: "wrong" });

  assert.equal(res.status, 403);
  assert.equal(res.text, "Invalid CSRF token");
});
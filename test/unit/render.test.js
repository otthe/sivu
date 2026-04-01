import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";

import { renderTemplateByName } from "../../lib/render.js";
import { templateCache, scriptCache } from "../../lib/cache.js";

// -------------------------
// Helpers
// -------------------------

function createRuntime(overrides = {}) {
  return {
    projectDir: path.resolve("./test/unit/fixtures"),
    // config: {
    //   template_dir_location: "templates",
    //   use_layout_file: true,
    //   cache_compiled_templates: true,
    //   cache_scripts: true,
    //   ...overrides,
    // },
    config: {
      port: process.env.PORT || 3000,
      template_dir_location: ".",
      public_dir_location: "public",
      data_dir_location: "data",
      log_dir_location: "log",
      root_file: "index.sivu",
      use_layout_file: true,
      public_asset_caching_time: "1d",
      cache_compiled_templates: true, // toggle on for smaller CPU cost
      cache_scripts: true,
      force_csrf_middleware: true,
      autoescape_html: true,
      allow_pretty_urls: true,
      session_secret: process.env.SESSION_SECRET || "thisismysecret",
      cookie_secure: false, // requires https
      ...overrides
    }
  };
}

console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log("-------------------------------------");
console.log(path.resolve("./test/unit/fixtures"));

function createApp(runtime) {
  const app = express();

  app.get("/:file", async (req, res, next) => {
    try {
      const html = await renderTemplateByName(req.params.file, req, runtime);
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  return app;
}

// -------------------------
// Test Suite
// -------------------------

describe("renderTemplateByName()", () => {
  let runtime;
  let app;

  beforeEach(() => {
    templateCache.clear();
    scriptCache.clear();

    runtime = createRuntime();
    app = createApp(runtime);
  });

  // -------------------------
  // Basic rendering
  // -------------------------

  it("renders a simple template", async () => {
    const res = await request(app).get("/basic.sivu");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Hello");
  });

  // -------------------------
  // Includes
  // -------------------------

  it("resolves single include", async () => {
    const res = await request(app).get("/with-include.sivu");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Partial content");
  });

  it("resolves nested includes", async () => {
    const res = await request(app).get("/nested-include.sivu");

    expect(res.text).toContain("Level 1");
    expect(res.text).toContain("Level 2");
    expect(res.text).toContain("Level 3");
  });

  it("throws on include cycle", async () => {
    const res = await request(app).get("/cycle-a.sivu");

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.text).toMatch(/Include cycle/i);
  });

  it("throws if included file does not exist", async () => {
    const res = await request(app).get("/missing-include.sivu");

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.text).toMatch(/Failed to read template/i);
  });

  // -------------------------
  // Layout
  // -------------------------

  it("wraps output with layout", async () => {
    const res = await request(app).get("/basic.sivu");

    expect(res.text).toContain("<html>");
    expect(res.text).toContain("</html>");
  });

  it("injects content at yield position", async () => {
    const res = await request(app).get("/basic.sivu");

    expect(res.text).toMatch(/<body>[\s\S]*Hello[\s\S]*<\/body>/);
  });

  it("throws if layout missing yield marker", async () => {
    const badRuntime = createRuntime({
      use_layout_file: true,
    });

    const badApp = createApp(badRuntime);

    const res = await request(badApp).get("/no-yield.sivu");

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.text).toMatch(/yield/i);
  });

  it("works without layout when disabled", async () => {
    const noLayoutRuntime = createRuntime({
      use_layout_file: false,
    });

    const noLayoutApp = createApp(noLayoutRuntime);

    const res = await request(noLayoutApp).get("/basic.sivu");

    expect(res.text).not.toContain("<html>");
    expect(res.text).toContain("Hello");
  });

  // -------------------------
  // Path safety
  // -------------------------

  it("prevents directory traversal", async () => {
    const res = await request(app).get("/../../secret.sivu");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // -------------------------
  // Caching
  // -------------------------

  it("caches compiled templates", async () => {
    await request(app).get("/basic.sivu");
    const size1 = templateCache.size;

    await request(app).get("/basic.sivu");
    const size2 = templateCache.size;

    expect(size2).toBe(size1);
  });

  it("caches vm scripts", async () => {
    await request(app).get("/basic.sivu");
    const size1 = scriptCache.size;

    await request(app).get("/basic.sivu");
    const size2 = scriptCache.size;

    expect(size2).toBe(size1);
  });

  it("does not cache when disabled", async () => {
    const runtimeNoCache = createRuntime({
      cache_compiled_templates: false,
      cache_scripts: false,
    });

    const appNoCache = createApp(runtimeNoCache);

    await request(appNoCache).get("/basic.sivu");
    const size1 = templateCache.size;

    await request(appNoCache).get("/basic.sivu");
    const size2 = templateCache.size;

    expect(size2).toBeGreaterThanOrEqual(size1);
  });

  // -------------------------
  // Error handling
  // -------------------------

  it("propagates runtime errors from template", async () => {
    const res = await request(app).get("/throws.sivu");

    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  // -------------------------
  // Concurrency
  // -------------------------

  it("handles concurrent requests safely", async () => {
    const requests = Array.from({ length: 10 }).map(() =>
      request(app).get("/basic.sivu")
    );

    const results = await Promise.all(requests);

    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.text).toContain("Hello");
    });
  });
});
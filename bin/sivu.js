#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  CONFIG_TEMPLATE,
  STYLES_TEMPLATE,
  HEADER_TEMPLATE,
  LAYOUT_TEMPLATE,
  INDEX_TEMPLATE,
  ADD_TODO_TEMPLATE,
  DELETE_TODO_TEMPLATE,
  JAVASCRIPT_TEMPLATE,
  GITIGNORE_TEMPLATE,
  ENV_TEMPLATE,
} from "../lib/scaffold.js";

import { createApp } from "../lib/app.js";

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { flag: "wx" }); // fail if exists
}

function dirLooksEmpty(abs) {
  if (!fs.existsSync(abs)) return true;
  const entries = fs.readdirSync(abs);
  return entries.length === 0;
}

function runNpmInstall(abs) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["install"], {
    cwd: abs,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("npm install failed");
  }
}

function initProject(projectName) {
  if (!projectName) {
    throw new Error("Usage: sivu init <project_name>");
  }

  const abs = path.resolve(process.cwd(), projectName);

  //prevent nuking an existing folder
  fs.mkdirSync(abs, { recursive: true });
  if (!dirLooksEmpty(abs)) {
    throw new Error(`Target directory is not empty: ${abs}`);
  }

  const pkg = {
    name: path.basename(abs) || "sivu-app",
    private: true,
    scripts: {
      dev: "sivu dev",
      start: "sivu start",
    },
    dependencies: {
      "@sivu/framework": "^0.0.1",
      dotenv: "^17.3.1",
    },
  };

  writeFileSafe(path.join(abs, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  writeFileSafe(path.join(abs, "config.js"), CONFIG_TEMPLATE);

  writeFileSafe(path.join(abs, "public", "styles.css"), STYLES_TEMPLATE);

  writeFileSafe(path.join(abs, "root", "_header.sivu"), HEADER_TEMPLATE);
  writeFileSafe(path.join(abs, "root", "_layout.sivu"), LAYOUT_TEMPLATE);
  writeFileSafe(path.join(abs, "root", "index.sivu"), INDEX_TEMPLATE);
  writeFileSafe(path.join(abs, "root", "_add_todo.sivu"), ADD_TODO_TEMPLATE);
  writeFileSafe(path.join(abs, "root", "_delete_todo.sivu"), DELETE_TODO_TEMPLATE);
  writeFileSafe(path.join(abs, "root", "format.js"), JAVASCRIPT_TEMPLATE);

  writeFileSafe(path.join(abs, ".env"), ENV_TEMPLATE);
  writeFileSafe(path.join(abs, ".gitignore"), GITIGNORE_TEMPLATE);

  fs.mkdirSync(path.join(abs, "data"), { recursive: true });

  console.log("Installing dependencies (npm install)...");
  runNpmInstall(abs);

  console.log(`\nInitialized Sivu project in: ${abs}`);
  console.log(`Next:\n  cd ${projectName}\n  npm run dev`);
}

async function loadConfig(projectDir) {
  const configPath = path.resolve(projectDir, "config.js");
  const url = pathToFileURL(configPath).href;

  // Works for both ESM and CommonJS config.js:
  // - ESM: module exports are on the namespace object
  // - CJS: module.exports is exposed as `default`
  const mod = await import(url);
  return mod.default ?? mod;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "init") {
    const target = args[1] || ".";
    return initProject(target);
  }

  // default: run server
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);

  const app = createApp({ projectDir, config });

  // ensure data dir exists
  fs.mkdirSync(path.resolve(projectDir, config.data_dir_location ?? "data"), { recursive: true });

  const port = config.port || 3000;
  app.listen(port, () => console.log(`Sivu running on port ${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
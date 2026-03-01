#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { 
  CONFIG_TEMPLATE, 
  STYLES_TEMPLATE, 
  HEADER_TEMPLATE,
  LAYOUT_TEMPLATE,
  INDEX_TEMPLATE,
  ADD_TODO_TEMPLATE,
  DELETE_TODO_TEMPLATE,
  GITIGNORE_TEMPLATE,
  ENV_TEMPLATE } = require("../lib/scaffold.js");

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
    throw new Error('Usage: sivu init <project_name>');
  }

  const abs = path.resolve(process.cwd(), projectName);

  // Prevent nuking an existing folder
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

  writeFileSafe(path.join(abs, ".env"), ENV_TEMPLATE);
  writeFileSafe(path.join(abs, ".gitignore"), GITIGNORE_TEMPLATE);

  // data dir (matches default config)
  fs.mkdirSync(path.join(abs, "data"), { recursive: true });

  // Install dependencies (framework + dotenv)
  console.log("Installing dependencies (npm install)...");
  runNpmInstall(abs);

  console.log(`\nInitialized Sivu project in: ${abs}`);
  console.log(`Next:\n  cd ${projectName}\n  npm run dev`);
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
  const config = require(path.resolve(projectDir, "config.js"));
  const { createApp } = require("../lib/app.js");
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
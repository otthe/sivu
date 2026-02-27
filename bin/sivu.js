#!/usr/bin/env node
const path = require("path");

function loadUserConfig(projectDir) {
  const configPath = path.resolve(projectDir, "config.js");
  // user config is CommonJS in your project; if ESM later, you can add dynamic import support
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(configPath);
}

async function main() {
  const projectDir = process.cwd();
  const config = loadUserConfig(projectDir);

  const { createApp } = require("../lib/app.js");

  const app = createApp({ projectDir, config });

  const port = config.port || 3000;
  app.listen(port, () => console.log(`Sivu running on port ${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
import { build } from "esbuild";

await build({
  entryPoints: ["bin/sivu.js"],
  outfile: "dist/cli.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,

  // Native / runtime deps: keep them external so node_modules versions are used
  external: [
    "express",
    "express-session",
    "better-sqlite3",
    "crypto",
    "fs",
    "path",
    "vm",
    "node:module",
  ],
});
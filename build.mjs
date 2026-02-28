// build.mjs
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const options = {
  entryPoints: ["bin/sivu.js"],
  outfile: "dist/cli.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,

  // Keep runtime deps external (native + large deps)
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
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("esbuild: watching (dist/cli.cjs)");
} else {
  await esbuild.build(options);
  console.log("esbuild: built (dist/cli.cjs)");
}


/*import { build } from "esbuild";

const watch = process.argv.includes("--watch");

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
  watch: watch && {
    onRebuild(error) {
      if (error) console.error("rebuild failed:", error);
      else console.log("rebuild ok");
    },
  },
});

console.log("built", watch ? "(watching)" : "");*/
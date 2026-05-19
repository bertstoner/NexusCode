import esbuild from "esbuild";
import { chmod } from "fs/promises";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    "readline",
    "fs",
    "path",
    "os",
    "child_process",
    "crypto",
    "stream",
    "util",
    "events",
    "fast-glob",
    "chalk",
    "ora",
    "marked",
    "marked-terminal",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: false,
  sourcemap: true,
});

await chmod("dist/index.js", 0o755);
console.log("Build complete: dist/index.js");

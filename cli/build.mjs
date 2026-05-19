import esbuild from "esbuild";
import { chmod, readFile } from "fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf-8"));

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
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  minify: false,
  sourcemap: true,
});

await chmod("dist/index.js", 0o755);
console.log("Build complete: dist/index.js");

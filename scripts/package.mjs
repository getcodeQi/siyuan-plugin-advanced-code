import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const staging = join(root, "work", "package");
const outDir = join(root, "outputs");
const zipPath = join(outDir, "package.zip");

async function copyTree(src, dest) {
  const srcStat = await stat(src);
  if (srcStat.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const entry of await readdir(src)) {
      await copyTree(join(src, entry), join(dest, entry));
    }
    return;
  }
  await mkdir(join(dest, ".."), { recursive: true });
  await copyFile(src, dest);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

await rm(staging, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(staging, { recursive: true });
await mkdir(outDir, { recursive: true });

for (const file of [
  "plugin.json",
  "README.md",
  "README_zh_CN.md",
  "icon.png",
  "preview.png",
]) {
  await copyTree(join(root, file), join(staging, basename(file)));
}

for (const file of await readdir(join(root, "dist"))) {
  await copyTree(join(root, "dist", file), join(staging, file));
}

await run("zip", ["-qry", relative(staging, zipPath), "."], { cwd: staging });
console.log(zipPath);

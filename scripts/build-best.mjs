import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...opts
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status === null ? 1 : result.status);
}

function hasWsl() {
  if (platform() !== "win32") {
    return false;
  }
  const r = spawnSync("where.exe", ["wsl.exe"], { stdio: "ignore", shell: false });
  return r.status === 0;
}

function isWslHealthy() {
  if (!hasWsl()) {
    return false;
  }
  const r = spawnSync("wsl.exe", ["--", "bash", "-lc", "echo ok"], {
    stdio: "ignore",
    shell: false,
    timeout: 15000
  });
  return r.status === 0;
}

const root = process.cwd();
const ps = resolve(root, "scripts", "wsl-run.ps1");

if (platform() === "win32" && existsSync(ps) && isWslHealthy()) {
  console.log("build-best: using WSL (recommended on Windows + OneDrive)…");
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps,
    "-Command",
    "npm install && npm run build:clean"
  ]);
} else {
  console.log("build-best: using local npm (WSL unavailable)…");
  run("npm", ["run", "build:clean"], { cwd: root });
}

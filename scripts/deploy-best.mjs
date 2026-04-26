import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

function npmCmd() {
  return platform() === "win32" ? "npm.cmd" : "npm";
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: platform() === "win32",
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
  // If WSL is hung/unreachable, don't block deploy—fall back to Windows.
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
  console.log("deploy-best: using WSL (recommended on Windows + OneDrive)…");
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps,
    "-Command",
    "npm install && npm run deploy:clean"
  ]);
} else {
  console.log("deploy-best: using local npm (WSL unavailable)…");
  run(npmCmd(), ["run", "deploy:clean"], { cwd: root });
}

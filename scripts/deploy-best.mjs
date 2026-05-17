import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";
import { applyProductionBuildEnv } from "./apply-production-build-env.mjs";
import { applyCloudflareAuthForWrangler } from "./cloudflare-wrangler-auth.mjs";

applyCloudflareAuthForWrangler();
applyProductionBuildEnv();

function npmCmd() {
  return platform() === "win32" ? "npm.cmd" : "npm";
}

function run(cmd, args, opts = {}) {
  const shouldUseShell =
    platform() === "win32" && cmd.toLowerCase().endsWith("npm.cmd");
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: shouldUseShell,
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

function bashSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/** Bash exports so WSL sees the same env as Windows (not inherited from Win → WSL). */
function wslDeployCommand() {
  const exports = [];
  const u = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (u) {
    exports.push(`export NEXT_PUBLIC_SITE_URL=${bashSingleQuote(u)}`);
  }
  const cdn = process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL?.trim();
  if (cdn) {
    exports.push(`export NEXT_PUBLIC_IMAGE_CDN_BASE_URL=${bashSingleQuote(cdn)}`);
  }
  const email = process.env.CLOUDFLARE_EMAIL?.trim();
  const apiKey = process.env.CLOUDFLARE_API_KEY?.trim();
  if (email && apiKey) {
    exports.push(`export CLOUDFLARE_EMAIL=${bashSingleQuote(email)}`);
    exports.push(`export CLOUDFLARE_API_KEY=${bashSingleQuote(apiKey)}`);
    exports.push("unset CLOUDFLARE_API_TOKEN");
  }
  const prefix = exports.length ? `${exports.join(" && ")} && ` : "";
  return `${prefix}npm install && npm run deploy:clean`;
}

if (platform() === "win32" && existsSync(ps) && isWslHealthy()) {
  console.log("deploy-best: using WSL (recommended on Windows + OneDrive)…");
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps,
    "-Command",
    wslDeployCommand()
  ]);
} else {
  console.log("deploy-best: using local npm (WSL unavailable)…");
  run(npmCmd(), ["run", "deploy:clean"], { cwd: root });
}

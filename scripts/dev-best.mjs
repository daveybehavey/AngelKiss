/**
 * Prefer WSL for `next dev` on Windows (OneDrive + Next can hang on native Windows).
 * Falls back to Windows with an explicit IPv4 bind.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { platform } from "node:os";
import { resolve } from "node:path";

const root = process.cwd();
const ps = resolve(root, "scripts", "wsl-run.ps1");

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

function resolveNextCli() {
  try {
    const require = createRequire(resolve(root, "package.json"));
    return require.resolve("next/dist/bin/next");
  } catch {
    return null;
  }
}

function isPortFree(host, port) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolvePromise(false));
    server.listen({ host, port }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function pickPort(host, preferred, maxTries = 20) {
  const start = Number(preferred);
  if (!Number.isFinite(start)) {
    return 3010;
  }
  for (let i = 0; i < maxTries; i++) {
    const candidate = start + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(host, candidate)) {
      return candidate;
    }
  }
  return start;
}

function forwardSignals(child) {
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      try {
        child.kill(sig);
      } catch {
        /* ignore */
      }
    });
  }
}

const hostWin = "127.0.0.1";
const hostWsl = "0.0.0.0";

let child;

const preferredPort = process.env.PORT?.trim() || "3010";

async function main() {
  const port = await pickPort(hostWin, preferredPort, 30);
  const nextCli = resolveNextCli();
  if (!nextCli) {
    console.error("dev-best: run npm install first (missing the next package).");
    process.exit(1);
  }

  if (platform() === "win32" && existsSync(ps) && isWslHealthy()) {
    console.log(
      `dev-best: using WSL — open http://${hostWin}:${port} in your browser (Windows forwards this port to WSL2).`
    );
    child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ps,
        "-Quick",
        "-Command",
        `(test -d node_modules || npm install) && npx next dev -H ${hostWsl} -p ${port}`
      ],
      { cwd: root, stdio: "inherit", shell: false }
    );
  } else if (platform() === "win32") {
    console.log(`dev-best: WSL unavailable — using Windows. Open http://${hostWin}:${port}`);
    child = spawn(process.execPath, [nextCli, "dev", "-H", hostWin, "-p", String(port)], {
      cwd: root,
      stdio: "inherit",
      shell: false
    });
  } else {
    console.log(`dev-best: local Next.js — http://${hostWin}:${port}`);
    child = spawn(process.execPath, [nextCli, "dev", "-H", hostWin, "-p", String(port)], {
      cwd: root,
      stdio: "inherit",
      shell: false
    });
  }

  if (!child || !child.pid) {
    console.error("dev-best: failed to start dev server");
    process.exit(1);
  }

  forwardSignals(child);
  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
  child.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


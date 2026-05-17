import { spawnSync } from "node:child_process";
import { platform } from "node:os";

function hasCmd(cmd, args = ["--version"]) {
  const r = spawnSync(cmd, args, { stdio: "ignore", shell: false });
  return r.status === 0;
}

function hasWhere(target) {
  if (platform() !== "win32") {
    return hasCmd(target, ["--version"]);
  }
  const r = spawnSync("where.exe", [target], { stdio: "ignore", shell: false });
  return r.status === 0;
}

function hasWsl() {
  if (platform() !== "win32") {
    return false;
  }
  const r = spawnSync("where.exe", ["wsl.exe"], { stdio: "ignore", shell: false });
  return r.status === 0;
}

function wslDefaultDistro() {
  const r = spawnSync("wsl.exe", ["-l", "-q"], { encoding: "utf8", shell: false });
  if (r.status !== 0) {
    return null;
  }
  const lines = String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines[0] ?? null;
}

function print(title) {
  console.log(`\n== ${title} ==`);
}

print("Platform");
console.log(platform());

print("Node");
console.log(`node: ${hasCmd("node", ["-v"]) ? "ok" : "MISSING"}`);
console.log(
  `npm: ${
    hasWhere(platform() === "win32" ? "npm.cmd" : "npm") ? "ok" : "MISSING"
  }`
);

print("Git");
console.log(hasCmd("git", ["--version"]) ? "ok" : "MISSING");

print("Cloudflare Wrangler (Windows)");
console.log(
  hasWhere(platform() === "win32" ? "npx.cmd" : "npx")
    ? "npx: ok (try: npx wrangler --version)"
    : "npx: MISSING"
);

if (platform() === "win32") {
  print("WSL");
  console.log(hasWsl() ? "wsl.exe: present" : "wsl.exe: MISSING (install WSL for best OpenNext reliability)");

  if (hasWsl()) {
    const distro = wslDefaultDistro();
    if (!distro) {
      console.log(
        "WSL distros: none installed yet. Finish WSL setup, then run: wsl.exe --install -d Ubuntu"
      );
    } else {
      console.log(`WSL default distro (first listed): ${distro}`);
      const r = spawnSync(
        "wsl.exe",
        ["--", "bash", "-lc", "node -v && npm -v && git --version"],
        { stdio: "inherit", shell: false }
      );
      console.log(`\nWSL toolchain check exit: ${r.status ?? "null"}`);
    }
  }
}

console.log("\nNext:");
console.log("- Dev: npm run dev  →  open http://127.0.0.1:3010 (uses WSL on Windows when healthy)");
console.log("- Dev without WSL: npm run dev:win");
console.log("- Deploy (auto-WSL on Windows if installed): npm run deploy");
console.log("- If WSL toolchain missing inside Ubuntu: install Node/npm there, then npx wrangler login");

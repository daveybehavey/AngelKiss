param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Command
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  Write-Error "wsl.exe not found. Install WSL first."
}

# Encode the remote command safely (handles quotes/newlines).
$remoteB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Command))

# Encode the whole bash bootstrap as base64 too, to avoid PowerShell quoting issues.
$bootstrap = @'
set -eu
set -o pipefail

REMOTE_CMD="$(printf "%s" "REMOTE_B64_PLACEHOLDER" | base64 -d)"

WIN_SRC="${WIN_SRC:-/mnt/c/Users/david/OneDrive/Desktop/AngelKiss}"
DST="${WSL_REPO:-$HOME/code/AngelKiss}"

if [[ ! -d "$WIN_SRC" ]]; then
  echo "wsl-run: expected Windows checkout at: $WIN_SRC" >&2
  echo "wsl-run: set WIN_SRC to your repo path on /mnt/c/... if different." >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
if [[ ! -d "$DST" ]]; then
  echo "wsl-run: creating WSL checkout: $DST"
  mkdir -p "$DST"
  if command -v rsync >/dev/null 2>&1; then
    echo "wsl-run: syncing (excluding node_modules/.next) ..."
    rsync -a --delete --exclude node_modules --exclude .next --exclude .open-next "$WIN_SRC/" "$DST/"
  else
    echo "wsl-run: rsync not installed; using tar copy (excluding node_modules/.next) ..."
    (cd "$WIN_SRC" && tar --exclude=node_modules --exclude=.next --exclude=.open-next -cf - .) | (cd "$DST" && tar -xf -)
  fi
else
  if command -v rsync >/dev/null 2>&1; then
    echo "wsl-run: syncing (excluding node_modules/.next) ..."
    rsync -a --delete --exclude node_modules --exclude .next --exclude .open-next "$WIN_SRC/" "$DST/"
  else
    echo "wsl-run: rsync not installed; refreshing via tar copy (excluding node_modules/.next) ..."
    rm -rf "$DST"
    mkdir -p "$DST"
    (cd "$WIN_SRC" && tar --exclude=node_modules --exclude=.next --exclude=.open-next -cf - .) | (cd "$DST" && tar -xf -)
  fi
fi

cd "$DST"
exec bash -lc "$REMOTE_CMD"
'@

$bootstrap = $bootstrap.Replace("REMOTE_B64_PLACEHOLDER", $remoteB64)
$bootstrapB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($bootstrap))

# PowerShell writes CRLF; strip \r after decoding to keep bash happy.
wsl.exe -- bash -lc "echo $bootstrapB64 | base64 -d | tr -d '\r' | bash"

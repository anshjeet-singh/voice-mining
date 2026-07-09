#!/bin/zsh
# Installs the Voice Mining worker as a macOS LaunchAgent: starts on login,
# restarts if it crashes, logs to worker/logs/worker.log. Run once:
#   zsh scripts/install-worker-agent.sh
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.voicemining.worker.plist"
LOG_DIR="$REPO/worker/logs"
mkdir -p "$LOG_DIR"

# Stop any previous version of the agent
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.voicemining.worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$REPO" &amp;&amp; exec npx tsx scripts/worker.ts</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/worker.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/worker.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST"
echo "Installed and started. The worker now runs automatically on login and restarts on crash."
echo "Logs:    tail -f $LOG_DIR/worker.log"
echo "Stop:    launchctl unload $PLIST"
echo "Restart: launchctl unload $PLIST && launchctl load $PLIST"

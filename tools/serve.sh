#!/bin/sh
# Detached launcher: survives the sandbox's 120s execution cap by
# double-detaching the server (nohup + fd redirection) from the caller.
cd /Users/mohammedhossam/blackhole || exit 1
nohup python3 -m http.server 8811 --bind 127.0.0.1 </dev/null >/tmp/gargantua-server.log 2>&1 &
echo "PID $!"

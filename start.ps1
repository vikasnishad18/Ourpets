$ErrorActionPreference = "Stop"

$port = 5173

Write-Host "Starting local server on http://localhost:$port/"
Write-Host "Press Ctrl+C to stop."

try {
  python -m http.server $port
} catch {
  try {
    py -m http.server $port
  } catch {
    throw "Python not found. Install Python or run any static server in this folder."
  }
}


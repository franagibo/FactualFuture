# Kill all processes listening on port 4200 (Angular dev server)
$port = 4200
$connections = netstat -ano | findstr ":$port"

if (-not $connections) {
    Write-Host "No process found listening on port $port" -ForegroundColor Yellow
    exit 0
}

$pids = @()
foreach ($line in $connections) {
    # netstat -ano output: proto local remote state PID (last column)
    $parts = $line.Trim() -split '\s+'
    $procId = $parts[-1]
    if ($procId -match '^\d+$' -and $procId -ne '0') {
        $pids += $procId
    }
}
$pids = $pids | Sort-Object -Unique

foreach ($procId in $pids) {
    Write-Host "Killing process PID $procId (port $port)..." -ForegroundColor Cyan
    taskkill /PID $procId /F 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Done." -ForegroundColor Green
    } else {
        Write-Host "  Failed (may need admin)." -ForegroundColor Red
    }
}
Write-Host "Port $port should be free now." -ForegroundColor Green

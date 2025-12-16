# Load Test Script for WoBePlaner (PowerShell)
# Tests concurrent API requests to Supabase

$SUPABASE_URL = "https://ivushmxpmymbqvryxhgf.supabase.co"
$SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2dXNobXhwbXltYnF2cnl4aGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzIzNzE3MTIsImV4cCI6MjA0Nzk0NzcxMn0.VsrPD_edHn2L9vF-LL4sMN_sGVNT_S2GufQdhZeIIBA"

$CONCURRENT_USERS = 20
$REQUESTS_PER_USER = 5

Write-Host ""
Write-Host "[LOAD TEST] WoBePlaner Load Test (PowerShell)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "[CONFIG]"
Write-Host "   - Concurrent Users: $CONCURRENT_USERS"
Write-Host "   - Requests per User: $REQUESTS_PER_USER"
Write-Host "   - Total Requests: $($CONCURRENT_USERS * $REQUESTS_PER_USER)"
Write-Host ""

$endpoints = @(
    "/rest/v1/",
    "/rest/v1/profiles?select=id&limit=1",
    "/rest/v1/shifts?select=id&limit=1",
    "/rest/v1/absences?select=id&limit=1"
)

$headers = @{
    "apikey"        = $SUPABASE_ANON_KEY
    "Authorization" = "Bearer $SUPABASE_ANON_KEY"
}

Write-Host "[START] Starting $CONCURRENT_USERS concurrent users..." -ForegroundColor Yellow

$startTime = Get-Date

# Create parallel jobs
$jobs = @()
for ($i = 0; $i -lt $CONCURRENT_USERS; $i++) {
    $jobs += Start-Job -ScriptBlock {
        param($url, $key, $endpoints, $requestCount)
        
        $headers = @{
            "apikey"        = $key
            "Authorization" = "Bearer $key"
        }
        
        $userResults = @()
        
        for ($j = 0; $j -lt $requestCount; $j++) {
            $endpoint = $endpoints | Get-Random
            $fullUrl = "$url$endpoint"
            
            try {
                $sw = [System.Diagnostics.Stopwatch]::StartNew()
                $response = Invoke-WebRequest -Uri $fullUrl -Headers $headers -Method GET -TimeoutSec 10 -ErrorAction Stop
                $sw.Stop()
                
                $userResults += @{
                    Success      = $true
                    StatusCode   = $response.StatusCode
                    ResponseTime = $sw.ElapsedMilliseconds
                }
            }
            catch {
                $userResults += @{
                    Success      = $false
                    Error        = $_.Exception.Message
                    ResponseTime = 0
                }
            }
            
            Start-Sleep -Milliseconds 100
        }
        
        return $userResults
    } -ArgumentList $SUPABASE_URL, $SUPABASE_ANON_KEY, $endpoints, $REQUESTS_PER_USER
}

# Wait for all jobs
Write-Host "[WAITING] Processing requests..." -ForegroundColor Gray
$allResults = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job

$endTime = Get-Date
$totalTime = ($endTime - $startTime).TotalMilliseconds

# Process results
$successful = 0
$failed = 0
$responseTimes = @()

foreach ($result in $allResults) {
    if ($result.Success) {
        $successful++
        $responseTimes += $result.ResponseTime
    }
    else {
        $failed++
    }
}

$total = $successful + $failed

# Calculate statistics
if ($responseTimes.Count -gt 0) {
    $sortedTimes = $responseTimes | Sort-Object
    $avg = ($responseTimes | Measure-Object -Average).Average
    $min = $sortedTimes[0]
    $max = $sortedTimes[-1]
    $p50 = $sortedTimes[[math]::Floor($sortedTimes.Count * 0.5)]
    $p95 = $sortedTimes[[math]::Floor($sortedTimes.Count * 0.95)]
    $p99 = $sortedTimes[[math]::Floor($sortedTimes.Count * 0.99)]
}
else {
    $avg = $min = $max = $p50 = $p95 = $p99 = 0
}

$successRate = if ($total -gt 0) { [math]::Round(($successful / $total) * 100, 1) } else { 0 }
$requestsPerSec = if ($totalTime -gt 0) { [math]::Round($total / ($totalTime / 1000), 2) } else { 0 }

Write-Host ""
Write-Host "[RESULTS] Load Test Results" -ForegroundColor Green
Write-Host "==========================="
Write-Host ""
Write-Host "[STATS] Request Statistics:"
Write-Host "   Total Requests:    $total"
Write-Host "   [OK] Successful:   $successful ($successRate%)" -ForegroundColor $(if ($successRate -ge 95) { "Green" } else { "Yellow" })
Write-Host "   [FAIL] Failed:     $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host ""
Write-Host "[PERF] Performance:"
Write-Host "   Total Time:        $([math]::Round($totalTime))ms ($([math]::Round($totalTime/1000, 2))s)"
Write-Host "   Requests per sec:  $requestsPerSec"
Write-Host ""
Write-Host "[TIMES] Response Times:"
Write-Host "   Min:               $($min)ms"
Write-Host "   Max:               $($max)ms"
Write-Host "   Average:           $([math]::Round($avg))ms"
Write-Host "   P50 (Median):      $($p50)ms"
Write-Host "   P95:               $($p95)ms"
Write-Host "   P99:               $($p99)ms"
Write-Host ""

# Assessment
Write-Host "[ASSESSMENT]" -ForegroundColor Cyan
if ($successRate -ge 99 -and $p95 -lt 500) {
    Write-Host "   EXCELLENT - Ready for production" -ForegroundColor Green
}
elseif ($successRate -ge 95 -and $p95 -lt 1000) {
    Write-Host "   GOOD - Acceptable performance" -ForegroundColor Green
}
elseif ($successRate -ge 90 -and $p95 -lt 2000) {
    Write-Host "   FAIR - May need optimization" -ForegroundColor Yellow
}
else {
    Write-Host "   POOR - Needs significant improvement" -ForegroundColor Red
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Load test complete!" -ForegroundColor Cyan
Write-Host ""

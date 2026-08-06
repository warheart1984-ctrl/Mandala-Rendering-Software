# Test Sovereign X endpoints
$serverProcess = Start-Process -FilePath "node" -ArgumentList "mrs/mcp/server.js" -WorkingDirectory "G:\Mandala Rendering Software" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
    $headers = @{ 
        "X-API-Key" = "mrs_director_test_key_12345"
        "Idempotency-Key" = "test-sx-route-001"
    }
    
    Write-Host "Testing Sovereign X route..."
    $body = @{ 
        scene = @{
            meshes = @(
                @{
                    id = "tesseract"
                    vertices4D = @(@(0,0,0,0), @(1,0,0,0), @(1,1,0,0), @(0,1,0,0), @(0,0,1,0), @(1,0,1,0), @(1,1,1,0), @(0,1,1,0))
                    indices = @(0,1,2, 0,2,3, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 2,3,7, 2,7,6, 1,2,6, 1,6,5, 0,3,7, 0,7,4)
                    materialId = "lambertian-white"
                }
            )
            surfaces = @(
                @{
                    id = "lambertian-white"
                    type = "lambertian"
                    albedo = @(0.8, 0.8, 0.8)
                }
            )
        }
        renderParams = @{
            resolution = @{ width = 200; height = 150 }
            samplesPerPixel = 4
            maxDepth = 2
        }
        identity = @{
            requestId = "sx-test-001"
            actorId = "4dce.director"
        }
        evidenceIds = @("ev-ascension-001", "ev-ascension-002")
        priority = "normal"
        context = @{
            evidence = @{
                id = "ev-sx-001"
                worldId = "test-world"
                timelineId = "test-timeline"
                items = @(@{ id = "ev-ascension-001" }, @{ id = "ev-ascension-002" })
            }
            lattice = @{
                nodeState = "active"
                spineState = "ready"
                dependencyMap = @{}
            }
            gpu = @{ available = $true }
        }
    } | ConvertTo-Json -Depth 10
    
    $result = Invoke-WebRequest -Uri http://localhost:8081/api/v1/sovereignx/route -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
    Write-Host "SovereignX Route: $($result.Content)"
    
    Write-Host ""
    Write-Host "Testing Sovereign X stats..."
    $headers2 = @{ "X-API-Key" = "mrs_director_test_key_12345" }
    $stats = Invoke-WebRequest -Uri http://localhost:8081/api/v1/sovereignx/stats -Method GET -Headers $headers2 -ErrorAction Stop
    Write-Host "SovereignX Stats: $($stats.Content)"
    
    Write-Host ""
    Write-Host "Testing Sovereign X HIP detect..."
    $hip = Invoke-WebRequest -Uri http://localhost:8081/api/v1/sovereignx/hip/detect -Method POST -Body '{}' -ContentType "application/json" -Headers $headers2 -ErrorAction Stop
    Write-Host "SovereignX HIP: $($hip.Content)"
    
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
} finally {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
}
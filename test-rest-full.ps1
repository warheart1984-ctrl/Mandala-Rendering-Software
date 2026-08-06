# Test REST endpoints
$serverProcess = Start-Process -FilePath "node" -ArgumentList "mrs/mcp/server.js" -WorkingDirectory "G:\Mandala Rendering Software" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
    $headers = @{ 
    "X-API-Key" = "mrs_director_test_key_12345"
    "Idempotency-Key" = "test-render-001"
}
    
    Write-Host "Testing health..."
    $health = Invoke-WebRequest -Uri http://localhost:8081/health -Method GET -ErrorAction Stop
    Write-Host "Health: $($health.Content)"
    
    Write-Host "Testing ready..."
    $ready = Invoke-WebRequest -Uri http://localhost:8081/ready -Method GET -ErrorAction Stop
    Write-Host "Ready: $($ready.Content)"
    
    Write-Host "Testing version..."
    $version = Invoke-WebRequest -Uri http://localhost:8081/version -Method GET -ErrorAction Stop
    Write-Host "Version: $($version.Content)"
    
    Write-Host "Testing render..."
    $body = @{ 
        scene = @{
            meshes = @(
                @{
                    id = "test-cube"
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
        render = @{
            resolution = @{ width = 200; height = 150 }
            samplesPerPixel = 4
            maxDepth = 2
        }
        identity = @{
            requestId = "test-001"
            actorId = "4dce.director"
        }
        context = @{
            actorIdentity = @{
                id = "4dce.director"
                type = "director"
            }
            evidence = @{
                id = "ev-test-001"
                worldId = "test-world"
                timelineId = "test-timeline"
                items = @(
                    @{ id = "ev-ascension-001" }
                    @{ id = "ev-ascension-002" }
                )
            }
            lattice = @{
                nodeState = "active"
                spineState = "ready"
                dependencyMap = @{}
            }
            gpu = @{ available = $true }
        }
    } | ConvertTo-Json -Depth 10
    
    $render = Invoke-WebRequest -Uri http://localhost:8081/render -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
    Write-Host "Render: $($render.Content)"
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
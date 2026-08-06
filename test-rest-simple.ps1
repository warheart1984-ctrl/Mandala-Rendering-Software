# Test REST endpoints with simple body
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
    
    Write-Host "Testing render (simple)..."
    $body = @{ 
        scene = @{
            meshes = @(
                @{
                    id = "test-cube"
                    vertices4D = @(@(0,0,0,0), @(1,0,0,0))
                    indices = @(0,1)
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
        context = @{
            evidence = @{
                id = "ev-test-001"
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
    
    Write-Host "Body length: $($body.Length)"
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
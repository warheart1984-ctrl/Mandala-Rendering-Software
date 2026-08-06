# Test DEP endpoint
$body = @{ 
    intentId = "dep-test-001"
    intent = @{
        id = "intent-dep-001"
        type = "render"
        prompt = "Render a 4D tesseract with Lambertian materials"
    }
    timelineId = "test-timeline"
    worldId = "test-world"
    parameters = @{
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
    }
    context = @{
        actorIdentity = @{
            id = "4dce.director"
            type = "director"
        }
        evidence = @{
            id = "ev-dep-001"
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

try {
    $headers = @{ 
        "X-API-Key" = "mrs_director_test_key_12345"
        "Idempotency-Key" = "test-dep-001"
    }
    $result = Invoke-WebRequest -Uri http://localhost:8081/api/v1/dep/execute -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
    Write-Host "DEP Execute: $($result.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
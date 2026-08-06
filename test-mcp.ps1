# Test MCP endpoint
$body = @{ 
    toolId = "mrs.render.rt4d"
    params = @{ 
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
            requestId = "mcp-test-001"
            actorId = "4dce.director"
        }
    }
    context = @{ 
        actorIdentity = @{ id = "4dce.director"; type = "director" }
        evidence = @{ 
            id = "ev-mcp-001"
            worldId = "test-world"
            timelineId = "test-timeline"
            items = @(@{ id = "ev-ascension-001" }, @{ id = "ev-ascension-002" })
        }
        lattice = @{ nodeState = "active"; spineState = "ready"; dependencyMap = @{} }
        gpu = @{ available = $true }
    }
} | ConvertTo-Json -Depth 10

try {
    $result = Invoke-WebRequest -Uri http://localhost:8080 -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Write-Host "MCP Render: $($result.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
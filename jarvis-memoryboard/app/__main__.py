import os
import uvicorn

if __name__ == "__main__":
    host = os.getenv("JARVIS_HOST", "0.0.0.0")
    port = int(os.getenv("JARVIS_PORT", "8001"))
    uvicorn.run("app.main:app", host=host, port=port, reload=True)

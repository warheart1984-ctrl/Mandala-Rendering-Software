<<<<<<< Updated upstream
import uvicorn
from app.main import app

if __name__ == "__main__":
=======
import uvicorn
from app.main import app

if __name__ == "__main__":
>>>>>>> Stashed changes
    uvicorn.run("app.main:app", host="0.0.0.0", port=8787, log_level="debug")
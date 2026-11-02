"""
Vaani — Local Development Runner
Starts both the FastAPI backend (port 8000) and the Vite React frontend (port 5173).
"""
import sys
import subprocess
import time
import os

def run():
    print("=" * 60)
    print("  Starting Vaani — Multilingual News Intelligence Agent")
    print("=" * 60)

    # 1. Start FastAPI Backend via uvicorn
    print("\n[1/2] Launching Backend on http://127.0.0.1:8000 ...")
    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
    backend_proc = subprocess.Popen(backend_cmd)

    # Allow backend to bind
    time.sleep(2)

    # 2. Start Vite Frontend
    print("[2/2] Launching Frontend on http://localhost:5173 ...")
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_proc = subprocess.Popen([npm_cmd, "run", "dev"], cwd=frontend_dir)

    print("\n" + "=" * 60)
    print("  Application running!")
    print("  - Frontend: http://localhost:5173")
    print("  - Backend API: http://127.0.0.1:8000/docs")
    print("  Press Ctrl+C to terminate both servers.")
    print("=" * 60 + "\n")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nTerminating servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    run()

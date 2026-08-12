import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import models, schemas  # noqa: F401  (keep module attributes importable via app.main)
from .db import Base, engine, SessionLocal, get_db  # noqa: F401  (get_db re-exported)
from .routers import inventory, discovery, auth, users, tenants, vrfs, backups
from .routers import orchestrator, admin, visibility, switch_config
from .core.db_migrations import migrate_db_columns  # noqa: F401  (re-exported)
from .core.startup import initialize_database, start_background_loops
from app.core.logging_config import get_logger
from app.core.constants import (
    LIFECYCLE_COMPLIANT,  # noqa: F401  (re-exported)
    LIFECYCLE_DRIFTED,  # noqa: F401  (re-exported)
    LIFECYCLE_DISCOVERED,  # noqa: F401  (re-exported)
)
from .drivers.factory import resolve_southbound_driver  # noqa: F401  (re-exported)

logger = get_logger(__name__)

# Initialize FastAPI App
app = FastAPI(title="Enterprise SDN Controller — Core Ingress & Validation Orchestrator")

app.include_router(inventory.router)
app.include_router(discovery.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tenants.router)
app.include_router(vrfs.router)
app.include_router(backups.router)


@app.get("/api/v5/")
@app.get("/api/v5")
@app.head("/api/v5/")
@app.head("/api/v5")
def api_v5_root():
    return {"status": "ok", "message": "Enterprise SDN API Gateway"}


app.include_router(orchestrator.router)
app.include_router(admin.router)
app.include_router(visibility.router)
app.include_router(switch_config.router)


@app.get("/", response_class=HTMLResponse)
async def serve_admin_dashboard():
    if os.path.exists("frontend/dist/index.html"):
        from fastapi.responses import FileResponse
        return FileResponse("frontend/dist/index.html")
    return _ADMIN_FALLBACK_HTML


_ADMIN_FALLBACK_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=/docs">
  <title>SDN Controller</title>
</head>
<body>
  <p>Enterprise SDN Controller API is running. The web UI is available once the frontend is built. <a href="/docs">Open API docs</a>.</p>
</body>
</html>
"""

# Mount React frontend static assets if the folder is present
if os.path.exists("frontend/dist"):
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")


# Ensure database tables exist on application startup (convenient local bootstrapping)
@app.on_event("startup")
def startup_db_configure():
    initialize_database()


@app.on_event("startup")
async def start_gnmi_discovery_background():
    await start_background_loops()

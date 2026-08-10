"""Shared constant values used across the SDN controller.

Centralizing lifecycle/state strings avoids drift between the FastAPI app,
Celery workers, and router modules. `main.py` re-exports these so existing
`from app.main import LIFECYCLE_*` imports keep working unchanged.
"""

# Switch lifecycle states (stored in switches.lifecycle_status)
LIFECYCLE_COMPLIANT = "compliant_active"
LIFECYCLE_DRIFTED = "configuration_drifted"
LIFECYCLE_DISCOVERED = "discovered_raw"

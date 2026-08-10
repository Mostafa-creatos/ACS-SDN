"""Southbound driver factory.

Resolves a vendor string to the concrete network driver implementation.
Extracted from `app.main` so Celery worker modules can import it without
pulling in the entire FastAPI application (breaks the main<->workers import
cycle). `app.main` re-exports this function for backwards compatibility.
"""

from .dell_os10 import DellOS10Driver
from .arista_eos import AristaEosDriver


def resolve_southbound_driver(vendor: str):
    v = vendor.lower()
    if v == "dell_os10":
        return DellOS10Driver()
    elif v == "arista_eos":
        return AristaEosDriver()
    elif v in ["nokia", "nokia_srlinux", "timetra"]:
        from .nokia_srlinux import NokiaSrlinuxDriver
        return NokiaSrlinuxDriver()
    else:
        raise ValueError(f"Southbound network driver not implemented for vendor: {vendor}")

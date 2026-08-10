"""Centralized logging configuration for the SDN controller.

All runtime modules obtain a logger via `get_logger(__name__)` and emit
structured log records instead of using `print()`. Console output is routed
through a single `sdn.controller` logger tree so formatting and levels are
consistent across the FastAPI app, Celery workers, and utility modules.
"""

import logging
import sys
from typing import Optional

_LOGGER_TREE = "sdn.controller"
_CONFIGURED = False


def configure_logging(level: Optional[int] = None) -> None:
    """Configure the `sdn.controller` logger tree exactly once.

    Safe to call from any module (idempotent). If a level is not supplied,
    INFO is used so existing console diagnostics remain visible by default.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True

    root_logger = logging.getLogger(_LOGGER_TREE)
    root_logger.setLevel(level if level is not None else logging.INFO)
    root_logger.propagate = False

    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced child logger of the `sdn.controller` tree."""
    configure_logging()
    return logging.getLogger(f"{_LOGGER_TREE}.{name}")

"""Application startup helpers (DB bootstrap, seed, legacy sync, background loops).

Extracted from ``app.main`` (Phase C structural refactor). ``app.main`` keeps
the thin ``@app.on_event("startup")`` handlers that delegate here.
"""
import os

from app.db import Base, engine, SessionLocal
from app.core.db_migrations import migrate_db_columns
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def initialize_database():
    # In production, database migrations would be handled via Alembic
    Base.metadata.create_all(bind=engine)
    migrate_db_columns(engine)

    # Seed database only when SEED_ON_STARTUP=true (dev/demo environments)
    if os.getenv("SEED_ON_STARTUP", "false").lower() == "true":
        from app.scripts.clean_and_seed_new_fabrics import clean_and_seed
        clean_and_seed()

    # Self-healing database sync: migrate legacy users with tenant_id to user_tenant_memberships
    try:
        from app.models import User, UserTenantMembership
        db_sync = SessionLocal()
        users_with_tenant = db_sync.query(User).filter(User.tenant_id != None).all()
        synced = False
        for u in users_with_tenant:
            # Check if membership already exists
            exists = db_sync.query(UserTenantMembership).filter(
                UserTenantMembership.user_id == u.user_id,
                UserTenantMembership.tenant_id == u.tenant_id
            ).first()
            if not exists:
                role = u.role or "readonly"
                if role == "Platform Admin": role = "platform_admin"
                elif role == "Tenant Operator": role = "operator"
                elif role == "Tenant Auditor": role = "readonly"

                membership = UserTenantMembership(
                    user_id=u.user_id,
                    tenant_id=u.tenant_id,
                    role=role
                )
                db_sync.add(membership)
                logger.info(f"[STARTUP SYNC] Created UserTenantMembership for user {u.username} in tenant {u.tenant_id} as {role}")
                synced = True
        if synced:
            db_sync.commit()
        db_sync.close()
    except Exception as e:
        logger.error(f"[STARTUP SYNC ERROR] Failed to sync user tenant memberships: {e}")


async def start_background_loops():
    import asyncio
    from app.workers.sync_tasks import start_periodic_discovery_loop, start_periodic_telemetry_loop, start_periodic_backup_schedule_loop
    logger.info("[gNMI STARTUP] Initiating background topology discovery, telemetry and backup scheduler loops...")
    asyncio.create_task(start_periodic_discovery_loop(30))
    asyncio.create_task(start_periodic_telemetry_loop(10))
    asyncio.create_task(start_periodic_backup_schedule_loop())

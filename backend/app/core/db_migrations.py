"""Hand-rolled SQLite migration helpers (kept out of app.main).

Extracted from ``app.main`` (Phase C structural refactor). ``migrate_db_columns``
is re-exported by ``app.main`` for backwards compatibility (tests import it).
"""
from sqlalchemy import text

def migrate_db_columns(engine):
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "switches" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("switches")]
        with engine.begin() as conn:
            if "model" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN model VARCHAR(100) DEFAULT 'C9300-48P'"))
            if "os_version" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os_version VARCHAR(100) DEFAULT 'IOS XE 17.9.4'"))
            if "status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN status VARCHAR(32) DEFAULT 'Up'"))
            if "uptime" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN uptime VARCHAR(100) DEFAULT '2 weeks 0 days 18 hours'"))
            if "serial_number" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN serial_number VARCHAR(128) DEFAULT ''"))
            if "location" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN location VARCHAR(255) DEFAULT 'Casablanca, Morocco'"))
            if "device_type" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN device_type VARCHAR(64) DEFAULT 'Switch'"))
            if "os_type" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os_type VARCHAR(64) DEFAULT 'IOS-XE'"))
            if "client_tenant" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN client_tenant VARCHAR(128) DEFAULT 'AtlasWave Maroc Demo'"))
            if "last_collection_timestamp" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN last_collection_timestamp TIMESTAMP DEFAULT NULL"))
            if "credentials_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN credentials_status VARCHAR(64) DEFAULT 'Valid'"))
            if "ports_up" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ports_up INTEGER DEFAULT 24"))
            if "ports_all" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ports_all INTEGER DEFAULT 24"))
            if "chassis_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN chassis_status VARCHAR(64) DEFAULT 'Ready'"))
            if "running_config" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN running_config TEXT DEFAULT ''"))
            if "startup_config" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN startup_config TEXT DEFAULT ''"))
            if "configured_vrfs" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN configured_vrfs JSON DEFAULT '[]'"))
            # Dell OS10 specific columns
            if "service_tag" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN service_tag VARCHAR(64) DEFAULT ''"))
            if "part_number" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN part_number VARCHAR(64) DEFAULT ''"))
            if "ppid" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN ppid VARCHAR(64) DEFAULT ''"))
            if "express_service_code" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN express_service_code VARCHAR(64) DEFAULT ''"))
            if "management_mac" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN management_mac VARCHAR(17) DEFAULT ''"))
            if "os10_license_status" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN os10_license_status VARCHAR(32) DEFAULT 'Licensed'"))
            if "temperature" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN temperature VARCHAR(16) DEFAULT 'Normal'"))
            if "cpu_usage" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN cpu_usage FLOAT DEFAULT NULL"))
            if "memory_usage" not in columns:
                conn.execute(text("ALTER TABLE switches ADD COLUMN memory_usage FLOAT DEFAULT NULL"))

        # Migrate device_interfaces columns
        if "device_interfaces" in inspector.get_table_names():
            iface_cols = [c["name"] for c in inspector.get_columns("device_interfaces")]
            with engine.begin() as conn:
                if "switchport_mode" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN switchport_mode VARCHAR(16) DEFAULT 'trunk'"))
                if "transceiver_type" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_type VARCHAR(32) DEFAULT NULL"))
                if "transceiver_serial" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_serial VARCHAR(64) DEFAULT NULL"))
                if "transceiver_qualified" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN transceiver_qualified BOOLEAN DEFAULT TRUE"))
                if "mtu" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN mtu INTEGER DEFAULT 9216"))
                if "errors_in" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN errors_in BIGINT DEFAULT 0"))
                if "errors_out" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN errors_out BIGINT DEFAULT 0"))
                if "discards_in" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN discards_in BIGINT DEFAULT 0"))
                if "discards_out" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN discards_out BIGINT DEFAULT 0"))
                if "last_flapped" not in iface_cols:
                    conn.execute(text("ALTER TABLE device_interfaces ADD COLUMN last_flapped TIMESTAMP DEFAULT NULL"))

        # Migrate audit_logs columns
        if "audit_logs" in inspector.get_table_names():
            audit_cols = [c["name"] for c in inspector.get_columns("audit_logs")]
            with engine.begin() as conn:
                if "ip_address" not in audit_cols:
                    conn.execute(text("ALTER TABLE audit_logs ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL"))
                if "user_agent" not in audit_cols:
                    conn.execute(text("ALTER TABLE audit_logs ADD COLUMN user_agent VARCHAR(512) DEFAULT NULL"))
                if "request_method" not in audit_cols:
                    conn.execute(text("ALTER TABLE audit_logs ADD COLUMN request_method VARCHAR(10) DEFAULT NULL"))
                if "request_url" not in audit_cols:
                    conn.execute(text("ALTER TABLE audit_logs ADD COLUMN request_url VARCHAR(512) DEFAULT NULL"))
                if "payload" not in audit_cols:
                    conn.execute(text("ALTER TABLE audit_logs ADD COLUMN payload JSON DEFAULT NULL"))

        # Migrate policy_approvals columns
        if "policy_approvals" in inspector.get_table_names():
            policy_cols = [c["name"] for c in inspector.get_columns("policy_approvals")]
            with engine.begin() as conn:
                if "requested_by" not in policy_cols:
                    conn.execute(text("ALTER TABLE policy_approvals ADD COLUMN requested_by VARCHAR(100) DEFAULT 'system'"))

        # Migrate provisioning_jobs columns
        if "provisioning_jobs" in inspector.get_table_names():
            job_cols = [c["name"] for c in inspector.get_columns("provisioning_jobs")]
            with engine.begin() as conn:
                if "device_statuses" not in job_cols:
                    conn.execute(text("ALTER TABLE provisioning_jobs ADD COLUMN device_statuses JSON DEFAULT '{}'"))

        # Migrate ztp_discovery_pool columns
        if "ztp_discovery_pool" in inspector.get_table_names():
            ztp_cols = [c["name"] for c in inspector.get_columns("ztp_discovery_pool")]
            with engine.begin() as conn:
                if "ztp_logs" not in ztp_cols:
                    conn.execute(text("ALTER TABLE ztp_discovery_pool ADD COLUMN ztp_logs TEXT DEFAULT ''"))

    # Migration: Drop FabricBlueprint (removed in Sprint 5)
    if "fabrics" in inspector.get_table_names():
        fab_cols = [c["name"] for c in inspector.get_columns("fabrics")]
        with engine.begin() as conn:
            if "blueprint_id" in fab_cols:
                conn.execute(text("ALTER TABLE fabrics DROP COLUMN blueprint_id"))
            if "loopback_pool" not in fab_cols:
                conn.execute(text("ALTER TABLE fabrics ADD COLUMN loopback_pool VARCHAR(255) DEFAULT '10.200.1.0/24'"))
            if "vtep_pool" not in fab_cols:
                conn.execute(text("ALTER TABLE fabrics ADD COLUMN vtep_pool VARCHAR(255) DEFAULT '10.250.1.0/24'"))
    if "fabric_blueprints" in inspector.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE fabric_blueprints"))

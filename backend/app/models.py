import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, Float, BigInteger, UniqueConstraint, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from .db import Base

class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    vrfs = relationship("TenantVrf", back_populates="tenant", cascade="all, delete-orphan")

class FabricBlueprint(Base):
    __tablename__ = "fabric_blueprints"

    blueprint_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    underlay_p2p_cidr = Column(String(45), nullable=False)
    loopback_cidr = Column(String(45), nullable=False)
    vtep_cidr = Column(String(45), nullable=False)
    system_mtu = Column(Integer, default=9216)

    # Relationships
    fabrics = relationship("Fabric", back_populates="blueprint")

class Fabric(Base):
    __tablename__ = "fabrics"

    fabric_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fabric_name = Column(String(100), nullable=False, unique=True)
    blueprint_id = Column(UUID(as_uuid=True), ForeignKey("fabric_blueprints.blueprint_id", ondelete="RESTRICT"))
    global_bgp_asn = Column(Integer, nullable=False)

    # Relationships
    blueprint = relationship("FabricBlueprint", back_populates="fabrics")
    switches = relationship("Switch", back_populates="fabric", cascade="all, delete-orphan")
    subnets = relationship("IpamSubnet", back_populates="fabric", cascade="all, delete-orphan")

class ZtpDiscoveryPool(Base):
    __tablename__ = "ztp_discovery_pool"

    discovery_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mac_address = Column(String(17), nullable=False, unique=True)
    serial_number = Column(String(128), nullable=False, unique=True)
    hardware_vendor = Column(String(64), nullable=False)  # 'dell_os10', 'arista_eos', etc.
    hardware_model = Column(String(64), nullable=False)
    current_dhcp_ip = Column(String(45), nullable=False)
    base_os_version = Column(String(32), nullable=False)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_boot_request = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    onboarding_status = Column(String(32), default="pending")  # 'pending', 'provisioned', 'failed'
    error_message = Column(String, nullable=True)

    # Relationships
    switch_reference = relationship("Switch", back_populates="discovery_reference")

class Switch(Base):
    __tablename__ = "switches"

    switch_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fabric_id = Column(UUID(as_uuid=True), ForeignKey("fabrics.fabric_id", ondelete="CASCADE"))
    discovery_id = Column(UUID(as_uuid=True), ForeignKey("ztp_discovery_pool.discovery_id", ondelete="SET NULL"), nullable=True)
    hostname = Column(String(255), nullable=False, unique=True)
    management_ip = Column(String(45), nullable=False)
    vendor = Column(String(64), nullable=False)
    role = Column(String(64), nullable=False)  # 'spine', 'leaf', etc.
    local_bgp_asn = Column(Integer, nullable=False)
    loopback_0_ip = Column(String(45), nullable=False, unique=True)
    vtep_ip = Column(String(45), nullable=True, unique=True)
    lifecycle_status = Column(String(64), default="discovered_raw")
    configuration_drift_category = Column(String(255), nullable=True)
    configuration_checksum = Column(String(64), nullable=True)
    last_successful_sync = Column(DateTime, nullable=True)

    # Device Inventory Extensions
    model = Column(String(100), default="S5248F-ON")
    os_version = Column(String(100), default="SmartFabric OS10 10.5.6.1")
    status = Column(String(32), default="Up")
    uptime = Column(String(100), default="2 weeks 0 days 18 hours")
    serial_number = Column(String(128), default="")
    location = Column(String(255), default="Casablanca, Morocco")
    device_type = Column(String(64), default="Switch")
    os_type = Column(String(64), default="OS10")
    client_tenant = Column(String(128), default="AtlasWave Maroc Demo")
    last_collection_timestamp = Column(DateTime, nullable=True)
    credentials_status = Column(String(64), default="Valid")
    ports_up = Column(Integer, default=24)
    ports_all = Column(Integer, default=24)
    chassis_status = Column(String(64), default="Ready")
    running_config = Column(String, default="")
    startup_config = Column(String, default="")

    # Dell OS10 Specific Fields
    service_tag = Column(String(64), default="", index=True)
    part_number = Column(String(64), default="")
    ppid = Column(String(64), default="")
    express_service_code = Column(String(64), default="")
    management_mac = Column(String(17), default="")
    os10_license_status = Column(String(32), default="Licensed")
    temperature = Column(String(16), default="Normal")
    cpu_usage = Column(Float, nullable=True)
    memory_usage = Column(Float, nullable=True)

    # Relationships
    fabric = relationship("Fabric", back_populates="switches")
    discovery_reference = relationship("ZtpDiscoveryPool", back_populates="switch_reference")
    interfaces = relationship("DeviceInterface", back_populates="switch", cascade="all, delete-orphan")
    hardware_components = relationship("HardwareComponent", back_populates="switch", cascade="all, delete-orphan")
    vlans = relationship("SwitchVlan", back_populates="switch", cascade="all, delete-orphan")
    lags = relationship("SwitchLag", back_populates="switch", cascade="all, delete-orphan")
    stp_state = relationship("SwitchSTPState", back_populates="switch", uselist=False, cascade="all, delete-orphan")

class DeviceInterface(Base):
    __tablename__ = "device_interfaces"

    interface_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    name = Column(String(100), nullable=False)
    status = Column(String(32), default="up")  # 'up', 'down', 'admin-down'
    speed_duplex = Column(String(64), default="10G / Full")
    vlan = Column(String(100), default="10")
    description = Column(String(255), default="Uplink to Core")
    ip_address = Column(String(45), nullable=True)
    mac_address = Column(String(17), nullable=True)
    media_type = Column(String(64), default="SFP-10G-SR")
    neighbor = Column(String(255), nullable=True)  # connected device name from LLDP/CDP

    # Dell OS10 Switchport & Transceiver Extensions
    switchport_mode = Column(String(16), default="trunk")  # 'access', 'trunk', 'hybrid', 'routed'
    transceiver_type = Column(String(32), nullable=True)    # e.g. "SFP+", "SFP28", "QSFP28", "Fixed"
    transceiver_serial = Column(String(64), nullable=True)  # Transceiver serial number
    transceiver_qualified = Column(Boolean, default=True)   # Dell qualified
    mtu = Column(Integer, default=9216)
    errors_in = Column(BigInteger, default=0)
    errors_out = Column(BigInteger, default=0)
    discards_in = Column(BigInteger, default=0)
    discards_out = Column(BigInteger, default=0)
    last_flapped = Column(DateTime, nullable=True)

    switch = relationship("Switch", back_populates="interfaces")


class HardwareComponent(Base):
    __tablename__ = "hardware_components"

    component_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    component_type = Column(String(32), nullable=False)  # 'chassis', 'psu', 'fan_tray', 'fan', 'temperature'
    slot_label = Column(String(32), nullable=False)       # e.g. "PSU-1", "Fan-1", "Temp-1"
    part_number = Column(String(64), default="")
    ppid = Column(String(64), default="")
    service_tag = Column(String(64), default="")
    status = Column(String(16), default="ok")             # 'ok', 'warning', 'critical', 'absent'
    detail = Column(String(255), default="")
    numeric_value = Column(Float, nullable=True)          # For sensors (RPM, °C, watts)
    discovered_at = Column(DateTime, default=datetime.utcnow)

    switch = relationship("Switch", back_populates="hardware_components")


class SwitchVlan(Base):
    __tablename__ = "switch_vlans"
    __table_args__ = (
        UniqueConstraint("switch_id", "vlan_id", name="unique_switch_vlan"),
    )

    vlan_id = Column(Integer, primary_key=True, autoincrement=False)  # VLAN number 1-4094
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"), primary_key=True)
    name = Column(String(64), default="")
    status = Column(String(16), default="active")  # 'active', 'suspended'
    member_ports = Column(JSON, default=list)       # list of port names

    switch = relationship("Switch", back_populates="vlans")


class SwitchLag(Base):
    __tablename__ = "switch_lags"

    lag_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    lag_name = Column(String(32), nullable=False)     # e.g. "port-channel1000"
    lag_type = Column(String(16), default="lacp")     # 'static', 'lacp'
    member_ports = Column(JSON, default=list)
    status = Column(String(8), default="up")          # 'up', 'down'
    protocol = Column(String(32), default="LACP active")

    switch = relationship("Switch", back_populates="lags")


class SwitchVltDomain(Base):
    __tablename__ = "switch_vlt_domains"

    vlt_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"), unique=True)
    domain_id = Column(Integer, nullable=False)
    peer_switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="SET NULL"), nullable=True)
    peer_switch_hostname = Column(String(255), default="")
    peer_link_status = Column(String(8), default="up")  # 'up', 'down'
    icl_state = Column(String(8), default="up")         # 'up', 'down'
    role = Column(String(16), default="primary")        # 'primary', 'backup'
    peer_routing_enabled = Column(Boolean, default=True)
    vrrp_groups = Column(JSON, default=list)             # list of {groupId, vip, state}

    switch = relationship("Switch", foreign_keys=[switch_id])
    peer_switch = relationship("Switch", foreign_keys=[peer_switch_id])


class TenantVrf(Base):
    __tablename__ = "tenant_vrfs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "vrf_name", name="unique_tenant_vrf_name"),
    )

    vrf_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="CASCADE"))
    vrf_name = Column(String(100), nullable=False)
    layer3_vni = Column(Integer, nullable=False)
    route_distinguisher = Column(String(64), default="auto")
    route_target = Column(String(64), default="both auto")

    # Relationships
    tenant = relationship("Tenant", back_populates="vrfs")
    subnets = relationship("IpamSubnet", back_populates="vrf", cascade="all, delete-orphan")

class IpamSubnet(Base):
    __tablename__ = "ipam_subnets"
    __table_args__ = (
        UniqueConstraint("fabric_id", "vlan_id", "vrf_id", name="unique_fabric_vlan_per_vrf"),
    )

    subnet_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vrf_id = Column(UUID(as_uuid=True), ForeignKey("tenant_vrfs.vrf_id", ondelete="CASCADE"))
    fabric_id = Column(UUID(as_uuid=True), ForeignKey("fabrics.fabric_id", ondelete="CASCADE"))
    vlan_id = Column(Integer, nullable=False)
    layer2_vni = Column(Integer, nullable=False)
    subnet_cidr = Column(String(45), nullable=False)
    anycast_gateway_ip = Column(String(45), nullable=False)

    # Relationships
    vrf = relationship("TenantVrf", back_populates="subnets")
    fabric = relationship("Fabric", back_populates="subnets")
    allocations = relationship("IpamIpAllocation", back_populates="subnet", cascade="all, delete-orphan")

class IpamIpAllocation(Base):
    __tablename__ = "ipam_ip_allocations"
    __table_args__ = (
        UniqueConstraint("subnet_id", "ip_address", name="unique_ip_per_subnet"),
    )

    allocation_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subnet_id = Column(UUID(as_uuid=True), ForeignKey("ipam_subnets.subnet_id", ondelete="CASCADE"))
    ip_address = Column(String(45), nullable=False)
    assignment_type = Column(String(64), default="static_assigned")  # 'static_assigned', 'leased_dhcp', etc.
    bound_entity_id = Column(String(255), nullable=False)
    allocated_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    subnet = relationship("IpamSubnet", back_populates="allocations")

class TopologyNode(Base):
    __tablename__ = "topology_nodes"

    node_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"), nullable=True)
    hostname = Column(String(255), nullable=False, unique=True)
    role = Column(String(64), nullable=False)  # 'spine', 'leaf'
    fabric_id = Column(UUID(as_uuid=True), ForeignKey("fabrics.fabric_id", ondelete="CASCADE"), nullable=True)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    switch = relationship("Switch")

class TopologyEdge(Base):
    __tablename__ = "topology_edges"
    __table_args__ = (
        UniqueConstraint("local_switch", "local_port", "remote_switch", "remote_port", name="unique_topology_link"),
    )

    edge_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_switch = Column(String(255), nullable=False)   # Local hostname/IP
    local_port = Column(String(100), nullable=False)
    remote_switch = Column(String(255), nullable=False)  # Remote hostname/IP
    remote_port = Column(String(100), nullable=False)
    protocol = Column(String(64), default="LLDP")        # 'LLDP', 'BGP'
    state = Column(String(32), default="up")             # 'up', 'down'
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class DiscoveredEndpoint(Base):
    __tablename__ = "discovered_endpoints"
    __table_args__ = (
        UniqueConstraint("mac_address", "ip_address", "vlan_id", "switch_id", "port", name="unique_discovered_endpoint"),
    )

    endpoint_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mac_address = Column(String(17), nullable=False)
    ip_address = Column(String(45), nullable=True)
    vlan_id = Column(Integer, nullable=True)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"), nullable=True)
    port = Column(String(100), nullable=True)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    switch = relationship("Switch")

class ConfigSnapshot(Base):
    __tablename__ = "config_snapshots"

    snapshot_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    taken_at = Column(DateTime, default=datetime.utcnow)
    raw_config = Column(String, nullable=False)
    config_hash = Column(String(64), nullable=False)
    is_baseline = Column(Boolean, default=False)
    taken_by = Column(String(100), default="system")

    switch = relationship("Switch")

class ComplianceRun(Base):
    __tablename__ = "compliance_runs"

    run_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fabric_id = Column(UUID(as_uuid=True), ForeignKey("fabrics.fabric_id", ondelete="CASCADE"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(64), default="running")       # 'running', 'completed', 'failed'
    summary = Column(String, nullable=True)              # JSON string summarizing compliance metrics

    findings = relationship("ComplianceFinding", back_populates="run", cascade="all, delete-orphan")

class ComplianceFinding(Base):
    __tablename__ = "compliance_findings"

    finding_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    compliance_run_id = Column(UUID(as_uuid=True), ForeignKey("compliance_runs.run_id", ondelete="CASCADE"))
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    rule_name = Column(String(255), nullable=False)
    severity = Column(String(32), nullable=False)        # 'info', 'warning', 'critical'
    detail = Column(String, nullable=True)

    run = relationship("ComplianceRun", back_populates="findings")
    switch = relationship("Switch")

class TelemetryMetadata(Base):
    __tablename__ = "telemetry_metadata"
    __table_args__ = (
        UniqueConstraint("switch_id", "metric_name", name="unique_switch_metric_metadata"),
    )

    metadata_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    metric_name = Column(String(255), nullable=False)
    retention_policy = Column(String(64), default="30d")

    switch = relationship("Switch")

class TelemetryMetric(Base):
    __tablename__ = "telemetry_metrics"

    metric_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"))
    metric_name = Column(String(255), nullable=False)
    metric_value = Column(String(255), nullable=False)   # stored as string to support both numeric and state values
    timestamp = Column(DateTime, default=datetime.utcnow)

    switch = relationship("Switch")

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=False)
    
    # Deprecated fields (to be removed in future refactoring)
    role = Column(String(64), nullable=True) 
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True)
    
    # New fields for Sprint 1
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    must_change_password = Column(Boolean, default=True)

    tenant = relationship("Tenant")
    memberships = relationship("UserTenantMembership", back_populates="user", cascade="all, delete-orphan")


class UserTenantMembership(Base):
    __tablename__ = "user_tenant_memberships"

    membership_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False)
    role = Column(String(64), nullable=False)

    user = relationship("User", back_populates="memberships")
    tenant = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="unique_user_tenant"),
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    token_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    user = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True)
    action = Column(String(255), nullable=False)
    resource = Column(String(255), nullable=False)
    status = Column(String(64), nullable=False)  # e.g., "denied", "success"
    detail = Column(String, nullable=True)

    user = relationship("User")
    tenant = relationship("Tenant")


class PolicyApproval(Base):
    __tablename__ = "policy_approvals"

    approval_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id", ondelete="CASCADE"))
    vrf_name = Column(String(100), nullable=False)
    vlan_id = Column(Integer, nullable=False)
    layer2_vni = Column(Integer, nullable=False)
    layer3_vni = Column(Integer, nullable=False)
    requested_cidr = Column(String(45), nullable=False)
    target_switch_serials = Column(String, nullable=False)  # Comma-separated list of hostnames
    blast_radius = Column(Integer, nullable=False)
    status = Column(String(32), default="pending")  # 'pending', 'approved', 'rejected'
    created_at = Column(DateTime, default=datetime.utcnow)
    diff_payload = Column(String, nullable=True)

    tenant = relationship("Tenant")


class SwitchSTPState(Base):
    __tablename__ = "switch_stp_states"

    stp_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    switch_id = Column(UUID(as_uuid=True), ForeignKey("switches.switch_id", ondelete="CASCADE"), unique=True)
    hostname = Column(String(255))
    stp_enabled = Column(Boolean, default=False)
    stp_mode = Column(String(32), default="RSTP")
    bridge_priority = Column(Integer, default=32768)
    is_root_bridge = Column(Boolean, default=False)
    port_states = Column(JSON, default=list) # [{port, role, state}, ...]
    raw_output = Column(Text, default="")
    collected_at = Column(DateTime, default=datetime.utcnow)

    switch = relationship("Switch", back_populates="stp_state")

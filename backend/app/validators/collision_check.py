import re
import uuid
from typing import List, Set, Tuple
from sqlalchemy.orm import Session
from app import models


def _extract_vlan_ids(config_payload: str) -> Set[int]:
    vlans: Set[int] = set()
    for m in re.finditer(r'switchport (access vlan|trunk allowed vlan) ([\d,\-]+)', config_payload):
        raw = m.group(2)
        for part in raw.split(','):
            part = part.strip()
            if '-' in part:
                try:
                    lo, hi = part.split('-', 1)
                    vlans.update(range(int(lo), int(hi) + 1))
                except ValueError:
                    pass
            else:
                try:
                    vlans.add(int(part))
                except ValueError:
                    pass
    for m in re.finditer(r'^interface vlan (\d+)$', config_payload, re.MULTILINE):
        vlans.add(int(m.group(1)))
    return vlans


def _extract_ips(config_payload: str) -> Set[str]:
    ips: Set[str] = set()
    for m in re.finditer(r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(/\d{1,2})?\b', config_payload):
        if m.group(1):
            ips.add(m.group(1))
    return ips


def _extract_port_channel_ids(config_payload: str) -> Set[str]:
    pcs: Set[str] = set()
    for m in re.finditer(r'interface port-channel (\d+)', config_payload):
        pcs.add(f"port-channel{m.group(1)}")
    return pcs


def _extract_interface_names(config_payload: str) -> Set[str]:
    ifaces: Set[str] = set()
    for m in re.finditer(r'^interface (ethernet[\d/]+|port-channel\d+|loopback\d+|mgmt\d+)$', config_payload, re.MULTILINE):
        ifaces.add(m.group(1))
    return ifaces


def check_collisions(db: Session, switch_ids: List[str], config_payload: str) -> List[Tuple[str, str]]:
    """
    Check for topology collisions before applying config.
    Returns list of (severity, message) tuples.  Severity is 'error' or 'warn'.
    """
    results: List[Tuple[str, str]] = []

    parsed_vlans = _extract_vlan_ids(config_payload)
    parsed_ips = _extract_ips(config_payload)
    parsed_pcs = _extract_port_channel_ids(config_payload)
    parsed_ifaces = _extract_interface_names(config_payload)

    for sid in switch_ids:
        try:
            sw_uuid = uuid.UUID(sid)
        except ValueError:
            continue

        sw = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        hostname = sw.hostname if sw else sid[:8]

        # --- VLAN collisions ---
        if parsed_vlans:
            existing_vlans = db.query(models.SwitchVlan).filter(
                models.SwitchVlan.switch_id == sw_uuid
            ).all()
            existing_vlan_ids = {v.vlan_id for v in existing_vlans}
            collision = existing_vlan_ids & parsed_vlans
            if collision:
                results.append(("warn", f"[{hostname}] VLAN ID(s) {sorted(collision)} already exist"))

        # --- IP collisions ---
        if parsed_ips:
            existing_ifs = db.query(models.DeviceInterface).filter(
                models.DeviceInterface.switch_id == sw_uuid,
                models.DeviceInterface.ip_address.isnot(None)
            ).all()
            existing_ip_set: Set[str] = set()
            for iface in existing_ifs:
                if iface.ip_address:
                    ip_no_cidr = iface.ip_address.split('/')[0]
                    existing_ip_set.add(ip_no_cidr)
            collision_ips = existing_ip_set & parsed_ips
            if collision_ips:
                results.append(("error", f"[{hostname}] IP address(es) {sorted(collision_ips)} already in use"))

        # --- Port-channel collisions ---
        if parsed_pcs:
            existing_lags = db.query(models.SwitchLag).filter(
                models.SwitchLag.switch_id == sw_uuid
            ).all()
            existing_lag_names = {lag.lag_name for lag in existing_lags}
            collision_lags = existing_lag_names & parsed_pcs
            if collision_lags:
                results.append(("warn", f"[{hostname}] Port-channel(s) {sorted(collision_lags)} already exist"))

        # --- Port assignment collisions (port already member of another VLAN or LAG) ---
        if parsed_ifaces:
            existing_vlans_with_ports = db.query(models.SwitchVlan).filter(
                models.SwitchVlan.switch_id == sw_uuid,
                models.SwitchVlan.member_ports.isnot(None)
            ).all()
            for sv in existing_vlans_with_ports:
                ports = sv.member_ports or []
                collision_ports = set(ports) & parsed_ifaces
                if collision_ports:
                    results.append(("warn", f"[{hostname}] Port(s) {sorted(collision_ports)} already member of VLAN {sv.vlan_id}"))

            existing_lags_with_ports = db.query(models.SwitchLag).filter(
                models.SwitchLag.switch_id == sw_uuid,
                models.SwitchLag.member_ports.isnot(None)
            ).all()
            for lag in existing_lags_with_ports:
                ports = lag.member_ports or []
                collision_ports = set(ports) & parsed_ifaces
                if collision_ports:
                    results.append(("warn", f"[{hostname}] Port(s) {sorted(collision_ports)} already member of LAG {lag.lag_name}"))

    return results

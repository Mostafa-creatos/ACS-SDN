import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { DellSwitchDetails } from '../types/switch-types';

interface FormData {
  hostname: string;
  management_ip: string;
  vendor: string;
  role: string;
  local_bgp_asn: number;
  loopback_0_ip: string;
  vtep_ip: string;
  model: string;
  os_version: string;
  serial_number: string;
  service_tag: string;
  part_number: string;
  ppid: string;
  management_mac: string;
  location: string;
  device_type: string;
  os_type: string;
  client_tenant: string;
  ports_up: number;
  ports_all: number;
  chassis_status: string;
  fabric_id?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (switchId: string) => void;
  editSwitch?: DellSwitchDetails | null;
}

const initialForm: FormData = {
  hostname: '',
  management_ip: '',
  vendor: 'dell',
  role: 'leaf',
  local_bgp_asn: 65000,
  loopback_0_ip: '',
  vtep_ip: '',
  model: 'S5248F-ON',
  os_version: 'SmartFabric OS10 10.5.6.1',
  serial_number: '',
  service_tag: '',
  part_number: '',
  ppid: '',
  management_mac: '',
  location: 'Casablanca, Morocco',
  device_type: 'Switch',
  os_type: 'OS10',
  client_tenant: 'AtlasWave Maroc Demo',
  ports_up: 24,
  ports_all: 52,
  chassis_status: 'Ready',
  fabric_id: '',
};

export const AddSwitchModal: React.FC<Props> = ({ open, onClose, onSaved, editSwitch }) => {
  const { token } = useAuth();
  const isEdit = !!editSwitch;

  const [fabrics, setFabrics] = useState<any[]>([]);
  const [form, setForm] = useState<FormData>(() => {
    if (editSwitch) {
      return {
        hostname: editSwitch.hostname,
        management_ip: editSwitch.management_ip,
        vendor: editSwitch.vendor,
        role: editSwitch.role,
        local_bgp_asn: editSwitch.local_bgp_asn as number || 65000,
        loopback_0_ip: editSwitch.loopback_0_ip as string || '',
        vtep_ip: editSwitch.vtep_ip as string || '',
        model: editSwitch.model,
        os_version: editSwitch.os_version,
        serial_number: editSwitch.serial_number,
        service_tag: editSwitch.service_tag,
        part_number: editSwitch.part_number,
        ppid: editSwitch.ppid,
        management_mac: editSwitch.management_mac,
        location: editSwitch.location,
        device_type: editSwitch.device_type,
        os_type: editSwitch.os_type,
        client_tenant: editSwitch.client_tenant,
        ports_up: editSwitch.ports_up,
        ports_all: editSwitch.ports_all,
        chassis_status: editSwitch.chassis_status,
        fabric_id: (editSwitch as any).fabric_id || '',
      };
    }
    return { ...initialForm, loopback_0_ip: `10.200.1.${Math.floor(Math.random() * 200 + 50)}` };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Fabrics on Modal Mount
  useEffect(() => {
    const loadFabrics = async () => {
      try {
        const res = await fetch('/api/v5/admin/fabrics', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setFabrics(await res.json());
        }
      } catch (e) {
        console.error('Failed to load fabrics', e);
      }
    };
    if (open) {
      loadFabrics();
    }
  }, [open, token]);

  if (!open) return null;

  const set = (field: keyof FormData, value: string | number) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.hostname.trim()) { setError('Hostname is required.'); return; }
    if (!form.management_ip.trim()) { setError('Management IP is required.'); return; }
    if (saving) return;

    setSaving(true);
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      if (isEdit && editSwitch) {
        // PUT to update
        const body: Record<string, unknown> = {};
        (Object.keys(form) as (keyof FormData)[]).forEach(k => {
          if (form[k] !== '' && form[k] !== null) {
            body[k] = form[k];
          }
        });
        const resp = await fetch(`/api/v5/admin/switches/${editSwitch.switch_id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Failed to update switch');
        }
        onSaved(editSwitch.switch_id);
      } else {
        // POST to create
        const body: Record<string, any> = { ...form };
        if (!body.fabric_id) delete body.fabric_id;

        const resp = await fetch('/api/v5/admin/switches', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Failed to create switch');
        }
        const data = await resp.json();
        onSaved(data.switch_id);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary transition-colors text-slate-700 font-sans';
  const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase mb-1';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-xl shadow-2xl z-50 border animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-base font-bold font-display text-atlas-ink">
              {isEdit ? 'Edit Switch' : 'Register New Switch'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isEdit ? `Updating ${editSwitch?.hostname}` : 'Add a device to the inventory'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {error && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Identity */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Identity</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Hostname *</label>
                <input className={inputCls} placeholder="AWM-DC01-LEAF1"
                  value={form.hostname} onChange={e => set('hostname', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Management IP *</label>
                <input className={inputCls} placeholder="10.250.10.120"
                  value={form.management_ip} onChange={e => set('management_ip', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Vendor</label>
                <select className={inputCls} value={form.vendor} onChange={e => set('vendor', e.target.value)}>
                  <option value="dell_os10">Dell OS10</option>
                  <option value="nokia">Nokia</option>
                  <option value="arista">Arista</option>
                  <option value="cisco">Cisco</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="leaf">Leaf</option>
                  <option value="spine">Spine</option>
                  <option value="border">Border</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Fabric Context</label>
                <select className={inputCls} value={form.fabric_id} onChange={e => set('fabric_id', e.target.value)}>
                  <option value="">Default Fabric</option>
                  {fabrics.map((f) => (
                    <option key={f.fabric_id} value={f.fabric_id}>{f.fabric_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input className={inputCls} placeholder="S5248F-ON"
                  value={form.model} onChange={e => set('model', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Network */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Network & OS</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Loopback0 IP</label>
                <input className={inputCls} placeholder="10.200.1.50"
                  value={form.loopback_0_ip} onChange={e => set('loopback_0_ip', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>VTEP IP</label>
                <input className={inputCls} placeholder="10.250.1.50"
                  value={form.vtep_ip} onChange={e => set('vtep_ip', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Local BGP ASN</label>
                <input className={inputCls} type="number" placeholder="65000"
                  value={form.local_bgp_asn} onChange={e => set('local_bgp_asn', parseInt(e.target.value) || 65000)} />
              </div>
              <div>
                <label className={labelCls}>OS Type</label>
                <select className={inputCls} value={form.os_type} onChange={e => set('os_type', e.target.value)}>
                  <option value="OS10">OS10</option>
                  <option value="SRLinux">SR Linux</option>
                  <option value="EOS">EOS</option>
                </select>
              </div>
            </div>
          </div>

          {/* Identification */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Asset Info</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Serial Number</label>
                <input className={inputCls} placeholder="SN-..."
                  value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Service Tag</label>
                <input className={inputCls} placeholder="ABC1234"
                  value={form.service_tag} onChange={e => set('service_tag', e.target.value)} />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/30">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" onClick={handleSubmit} disabled={saving} className="bg-atlas-primary hover:bg-atlas-primary/95 text-white px-5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all">
            {saving ? 'Saving...' : isEdit ? 'Update Switch' : 'Register Switch'}
          </button>
        </div>
      </div>
    </>
  );
};

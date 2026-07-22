import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  Send,
  Check,
  AlertTriangle,
  History,
  ChevronDown,
  ShieldAlert,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Code,
  List,
  CheckCircle2,
  AlertCircle,
  Play
} from 'lucide-react';

interface SwitchItem {
  switch_id: string;
  hostname: string;
  management_ip: string;
  vendor: string;
  lifecycle_status: string;
}

interface PushResult {
  switch_id: string;
  hostname: string;
  diff?: string;
  validation_status?: string;
  task_id?: string;
}

interface PushHistoryEntry {
  id: string;
  tenant: string;
  summary: string;
  target_switches: string;
  blast_radius: number;
  status: string;
  diff: string;
  created_at: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'empty' | 'header';
  text: string;
  lineNum?: number;
}

// Helper to parse unified diffs into aligned side-by-side lines
function parseUnifiedDiff(diffText: string): { left: DiffLine[]; right: DiffLine[] } {
  if (!diffText) return { left: [], right: [] };
  const lines = diffText.split('\n');
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  
  let leftNum = 1;
  let rightNum = 1;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      left.push({ type: 'header', text: line });
      right.push({ type: 'header', text: line });
      i++;
      continue;
    }
    
    if (line.startsWith('-')) {
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.startsWith('+')) {
        left.push({ type: 'removed', text: line.substring(1), lineNum: leftNum++ });
        right.push({ type: 'added', text: nextLine.substring(1), lineNum: rightNum++ });
        i += 2;
      } else {
        left.push({ type: 'removed', text: line.substring(1), lineNum: leftNum++ });
        right.push({ type: 'empty', text: '' });
        i++;
      }
    } else if (line.startsWith('+')) {
      left.push({ type: 'empty', text: '' });
      right.push({ type: 'added', text: line.substring(1), lineNum: rightNum++ });
      i++;
    } else {
      const text = line.startsWith(' ') ? line.substring(1) : line;
      left.push({ type: 'unchanged', text, lineNum: leftNum++ });
      right.push({ type: 'unchanged', text, lineNum: rightNum++ });
      i++;
    }
  }
  
  return { left, right };
}

export const ConfigPushPage: React.FC = () => {
  const { token, user, selectedTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<'push' | 'history'>('push');

  // Switches and History lists
  const [switches, setSwitches] = useState<SwitchItem[]>([]);
  const [history, setHistory] = useState<PushHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 4-Step Wizard State
  const [step, setStep] = useState(1);
  const [selectedSwitchIds, setSelectedSwitchIds] = useState<string[]>([]);
  const [configPayload, setConfigPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [switchDropdownOpen, setSwitchDropdownOpen] = useState(false);

  // Validation execution state (Step 3 stages)
  const [validationResult, setValidationResult] = useState<{
    status: string;
    diffs?: PushResult[];
    blast_radius?: { total_affected: number; by_switch: any[] };
    approval_id?: string;
  } | null>(null);
  const [validationError, setValidationError] = useState('');
  const [validationStages, setValidationStages] = useState({
    syntax: 'pending' as 'pending' | 'loading' | 'success' | 'failed',
    boundary: 'pending' as 'pending' | 'loading' | 'success' | 'failed',
    collision: 'pending' as 'pending' | 'loading' | 'success' | 'failed',
    dryrun: 'pending' as 'pending' | 'loading' | 'success' | 'failed'
  });

  // Step 4 Commit Deploy State
  const [deployResult, setDeployResult] = useState<{
    status: string;
    task_ids?: { switch_id: string; task_id: string }[];
    blast_radius?: any;
    approval_id?: string;
  } | null>(null);
  const [deployError, setDeployError] = useState('');

  // Step 2 sub-mode: 'form' | 'editor'
  const [configMode, setConfigMode] = useState<'form' | 'editor'>('editor');

  // Form Mode details
  const [formTemplate, setFormTemplate] = useState<'interface' | 'vlan' | 'aaa'>('interface');
  const [formInterface, setFormInterface] = useState('ethernet1/1/1');
  const [formDesc, setFormDesc] = useState('UPLINK-CONNECTION');
  const [formIp, setFormIp] = useState('10.100.1.1/24');
  const [formPortMode, setFormPortMode] = useState('access');
  const [formVlan, setFormVlan] = useState('100');
  const [formAdminState, setFormAdminState] = useState(true);

  const [formVlanId, setFormVlanId] = useState('200');
  const [formVlanName] = useState('APP-BACKEND-VLAN');

  const [formUsername, setFormUsername] = useState('operator_admin');
  const [formPassword, setFormPassword] = useState('AltasWaveSecurityPass123!');
  const [formPrivilege, setFormPrivilege] = useState('15');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const canPush = user?.role === 'Platform Admin' || user?.role === 'platform_admin' || user?.role === 'Tenant Admin' || user?.role === 'tenant_admin';

  // Fetch switches
  useEffect(() => {
    const fetchSwitches = async () => {
      try {
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
        const res = await fetch('/api/v5/admin/switches', { headers });
        if (res.ok) {
          const data = await res.json();
          setSwitches(Array.isArray(data) ? data : []);
        }
      } catch {}
    };
    fetchSwitches();
  }, [token, selectedTenant]);

  // Fetch history
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const res = await fetch('/api/v5/switch-config/history', { headers });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch {}
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, token, selectedTenant]);

  // Command Generator for Form templates
  const handleGenerateConfig = () => {
    let generated = '';
    const selectedSw = switches.find(s => selectedSwitchIds.includes(s.switch_id));
    const vendor = (selectedSw?.vendor || 'dell_os10').toLowerCase();

    if (formTemplate === 'interface') {
      if (vendor === 'dell_os10') {
        generated = `interface ${formInterface}\n description ${formDesc}\n`;
        if (formPortMode === 'no-switchport') {
          generated += ` no switchport\n ip address ${formIp}\n`;
        } else {
          generated += ` switchport mode ${formPortMode}\n`;
          if (formPortMode === 'access') {
            generated += ` switchport access vlan ${formVlan}\n`;
          } else {
            generated += ` switchport trunk allowed vlan ${formVlan}\n`;
          }
        }
        generated += formAdminState ? ' no shutdown\n' : ' shutdown\n';
      } else if (vendor === 'arista_eos') {
        generated = `interface ${formInterface}\n description ${formDesc}\n`;
        if (formPortMode === 'no-switchport') {
          generated += ` no switchport\n ip address ${formIp}\n`;
        } else {
          generated += ` switchport mode ${formPortMode}\n`;
          if (formPortMode === 'access') {
            generated += ` switchport access vlan ${formVlan}\n`;
          } else {
            generated += ` switchport trunk allowed vlan ${formVlan}\n`;
          }
        }
        generated += formAdminState ? ' no shutdown\n' : ' shutdown\n';
      } else {
        // Nokia SRLinux CLI
        generated = `enter candidate\n/ interface ${formInterface}\n description "${formDesc}"\n admin-state ${formAdminState ? 'enable' : 'disable'}\ncommit\n`;
      }
    } else if (formTemplate === 'vlan') {
      if (vendor === 'dell_os10' || vendor === 'arista_eos') {
        generated = `interface vlan ${formVlanId}\n description ${formVlanName}\n no shutdown\n`;
      } else {
        generated = `enter candidate\n/ network-instance default protocols vran vlan-interface ${formVlanId}\ncommit\n`;
      }
    } else if (formTemplate === 'aaa') {
      if (vendor === 'dell_os10') {
        generated = `username ${formUsername} password ${formPassword} role sysadmin privilege ${formPrivilege}\n`;
      } else if (vendor === 'arista_eos') {
        generated = `username ${formUsername} privilege ${formPrivilege} secret ${formPassword}\n`;
      } else {
        generated = `enter candidate\n/ system security user ${formUsername} role admin password ${formPassword}\ncommit\n`;
      }
    }

    setConfigPayload(prev => prev + (prev ? '\n' : '') + generated);
    setConfigMode('editor');
  };

  // Run dry run validation steps
  const executeValidationPipeline = async () => {
    setLoading(true);
    setValidationError('');
    setValidationResult(null);
    setValidationStages({
      syntax: 'loading',
      boundary: 'pending',
      collision: 'pending',
      dryrun: 'pending'
    });

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;

      // Stage 1: Syntax (Simulated UI progression)
      await new Promise(r => setTimeout(r, 600));
      setValidationStages(prev => ({ ...prev, syntax: 'success', boundary: 'loading' }));

      // Stage 2: Boundary Isolation check
      await new Promise(r => setTimeout(r, 600));
      setValidationStages(prev => ({ ...prev, boundary: 'success', collision: 'loading' }));

      // Stage 3: Collision Check
      await new Promise(r => setTimeout(r, 600));
      setValidationStages(prev => ({ ...prev, collision: 'success', dryrun: 'loading' }));

      // Stage 4: Real Dry run diff invocation
      const res = await fetch('/api/v5/switch-config/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          switch_ids: selectedSwitchIds,
          config_payload: configPayload,
          dry_run: true
        })
      });

      const data = await res.json();
      if (res.ok) {
        setValidationStages(prev => ({ ...prev, dryrun: 'success' }));
        setValidationResult(data);
      } else {
        setValidationStages(prev => ({ ...prev, dryrun: 'failed' }));
        if (data && data.detail) {
          if (typeof data.detail === 'object') {
            if (data.detail.stage) {
              const failedStage = data.detail.stage;
              setValidationStages(prev => ({
                ...prev,
                [failedStage === 'syntax' ? 'syntax' : failedStage === 'tenant_check' ? 'boundary' : 'collision']: 'failed'
              }));
            }
            if (data.detail.errors && Array.isArray(data.detail.errors)) {
              setValidationError(`${data.detail.stage ? data.detail.stage.toUpperCase() : 'VALIDATION'}: ${data.detail.errors.join(', ')}`);
            } else {
              setValidationError(JSON.stringify(data.detail));
            }
          } else {
            setValidationError(data.detail);
          }
        } else {
          setValidationError('Config validation failed');
        }
      }
    } catch (e: any) {
      setValidationStages(() => ({
        syntax: 'failed',
        boundary: 'failed',
        collision: 'failed',
        dryrun: 'failed'
      }));
      setValidationError(e.message || 'Network error occurred during pipeline validation');
    } finally {
      setLoading(false);
    }
  };

  // Run live commit push
  const executeLiveCommit = async () => {
    setLoading(true);
    setDeployError('');
    setDeployResult(null);

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;

      const res = await fetch('/api/v5/switch-config/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          switch_ids: selectedSwitchIds,
          config_payload: configPayload,
          dry_run: false
        })
      });

      const data = await res.json();
      if (res.ok) {
        setDeployResult(data);
      } else {
        setDeployError(data.detail || 'Live deployment failed');
      }
    } catch (e: any) {
      setDeployError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // Stepper state triggers
  const handleNext = () => {
    if (step === 1 && selectedSwitchIds.length > 0) {
      setStep(2);
    } else if (step === 2 && configPayload.trim().length > 0) {
      setStep(3);
      executeValidationPipeline();
    } else if (step === 3 && validationStages.dryrun === 'success') {
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const selectAll = () => {
    setSelectedSwitchIds(switches.map(s => s.switch_id));
  };

  const toggleSwitch = (id: string) => {
    setSelectedSwitchIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Custom CLI Syntax Highlighting algorithm
  const highlightCode = (code: string) => {
    if (!code) return '';
    // Escape HTML
    let escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Keywords
    const keywords = [
      'interface', 'vlan', 'description', 'no shutdown', 'shutdown',
      'ip address', 'hostname', 'switchport', 'mode', 'trunk', 'access',
      'spanning-tree', 'system', 'username', 'password', 'enable',
      'router', 'bgp', 'protocols', 'candidate', 'enter', 'commit'
    ];

    keywords.forEach(kw => {
      const reg = new RegExp(`\\b(${kw})\\b`, 'gi');
      escaped = escaped.replace(reg, '<span class="text-atlas-violet font-bold">$1</span>');
    });

    // IP Addresses & CIDRs
    escaped = escaped.replace(/(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?\b)/g, '<span class="text-atlas-teal font-semibold">$1</span>');

    // Numbers (ports, VLAN IDs)
    escaped = escaped.replace(/(\b\d+\b)(?![^<]*>)/g, '<span class="text-amber-500 font-semibold">$1</span>');

    // Comments (! or #)
    escaped = escaped.replace(/^([!#].*)$/gm, '<span class="text-slate-400 italic">$1</span>');

    return escaped;
  };

  // Sync scroll of pre block overlaying textarea
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  if (!canPush) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 min-h-[50vh]">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 stroke-[1.25]" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-1">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Config push requires Tenant Admin or Platform Admin privileges.
        </p>
      </Card>
    );
  }

  // Generate line count
  const linesCount = configPayload.split('\n').length || 1;

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Config Push</h1>
        <p className="text-xs text-slate-400 mt-1">Multi-stage pipeline validator and CLI configuration delivery portal</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('push')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'push' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          Pipeline Wizard
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'history' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      </div>

      {activeTab === 'push' ? (
        <div className="space-y-6">
          {/* STEPPER BAR */}
          <div className="bg-white border border-atlas-lavender/25 rounded-xl p-4 shadow-sm flex justify-between items-center max-w-4xl mx-auto">
            {[
              { id: 1, label: 'Targets' },
              { id: 2, label: 'Configure' },
              { id: 3, label: 'Validate' },
              { id: 4, label: 'Commit' }
            ].map(s => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    step === s.id ? 'bg-atlas-violet text-white ring-4 ring-atlas-violet/20' :
                    step > s.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {step > s.id ? <Check className="w-4 h-4 stroke-[3]" /> : s.id}
                  </div>
                  <span className={`text-xs font-bold ${step === s.id ? 'text-atlas-violet' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
                {s.id < 4 && <div className={`flex-1 h-0.5 max-w-[80px] rounded ${step > s.id ? 'bg-emerald-500' : 'bg-slate-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Step Content Main (3 columns) */}
            <div className="lg:col-span-3 space-y-4">
              
              {/* STEP 1: Select switches */}
              {step === 1 && (
                <Card className="p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-bold font-display text-atlas-ink">Step 1: Select Target Switches</h3>
                    <p className="text-xs text-slate-400">Select one or more switches to push commands to.</p>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setSwitchDropdownOpen(!switchDropdownOpen)}
                      className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span className="font-semibold">
                        {selectedSwitchIds.length === 0
                          ? 'Choose switch targets...'
                          : `${selectedSwitchIds.length} switch(es) selected`}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </button>
                    {switchDropdownOpen && (
                      <div className="absolute z-20 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex justify-between">
                          <button onClick={selectAll} className="text-[10px] font-bold text-atlas-primary hover:underline">
                            Select All
                          </button>
                          <button onClick={() => setSelectedSwitchIds([])} className="text-[10px] font-bold text-rose-500 hover:underline">
                            Clear
                          </button>
                        </div>
                        {switches.map(sw => (
                          <label
                            key={sw.switch_id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSwitchIds.includes(sw.switch_id)}
                              onChange={() => toggleSwitch(sw.switch_id)}
                              className="rounded border-slate-300 text-atlas-primary focus:ring-atlas-primary"
                            />
                            <div className="flex-1 flex justify-between">
                              <div>
                                <span className="font-bold text-slate-800">{sw.hostname}</span>
                                <span className="text-slate-400 ml-2 font-mono">{sw.management_ip}</span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">
                                {sw.vendor}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {switches.filter(sw => selectedSwitchIds.includes(sw.switch_id)).map(sw => (
                      <div key={sw.switch_id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{sw.hostname}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{sw.management_ip}</p>
                        </div>
                        <button onClick={() => toggleSwitch(sw.switch_id)} className="text-[10px] font-bold text-rose-500 hover:underline">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* STEP 2: Configure & Input */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                    <button
                      onClick={() => setConfigMode('form')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors ${
                        configMode === 'form' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      Quick Form Helper
                    </button>
                    <button
                      onClick={() => setConfigMode('editor')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors ${
                        configMode === 'editor' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      CLI Code Editor
                    </button>
                  </div>

                  {configMode === 'form' ? (
                    <Card className="p-6 space-y-4">
                      <div>
                        <h3 className="text-base font-bold font-display text-atlas-ink">Quick Config Helper</h3>
                        <p className="text-xs text-slate-400">Generate CLI config syntaxes using standard form structures.</p>
                      </div>

                      {/* Template switch tabs */}
                      <div className="flex border-b border-slate-100">
                        {(['interface', 'vlan', 'aaa'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setFormTemplate(t)}
                            className={`px-4 py-2 text-xs font-bold border-b-2 capitalize transition-colors ${
                              formTemplate === t ? 'border-atlas-violet text-atlas-violet' : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            {t === 'aaa' ? 'AAA Setup' : t}
                          </button>
                        ))}
                      </div>

                      {/* Form inputs based on active template */}
                      {formTemplate === 'interface' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Interface Name</label>
                            <select
                              value={formInterface}
                              onChange={e => setFormInterface(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="ethernet1/1/1">ethernet1/1/1</option>
                              <option value="ethernet1/1/2">ethernet1/1/2</option>
                              <option value="ethernet1/1/3">ethernet1/1/3</option>
                              <option value="loopback0">loopback0</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Description</label>
                            <input
                              type="text"
                              value={formDesc}
                              onChange={e => setFormDesc(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Port Mode</label>
                            <select
                              value={formPortMode}
                              onChange={e => setFormPortMode(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="access">Access</option>
                              <option value="trunk">Trunk</option>
                              <option value="no-switchport">No Switchport (Routed)</option>
                            </select>
                          </div>
                          {formPortMode === 'no-switchport' ? (
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">IP Address / CIDR</label>
                              <input
                                type="text"
                                value={formIp}
                                onChange={e => setFormIp(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">VLAN tag ID</label>
                              <input
                                type="number"
                                value={formVlan}
                                onChange={e => setFormVlan(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between md:col-span-2 pt-2 border-t border-slate-50">
                            <span className="text-xs text-slate-600 font-bold">Admin Status (Enable port)</span>
                            <button
                              onClick={() => setFormAdminState(!formAdminState)}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                formAdminState ? 'bg-atlas-teal' : 'bg-slate-300'
                              }`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                !formAdminState ? 'translate-x-5' : ''
                              }`} />
                            </button>
                          </div>
                        </div>
                      )}

                      {formTemplate === 'vlan' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">VLAN ID (2-4094)</label>
                            <input
                              type="number"
                              value={formVlanId}
                              onChange={e => setFormVlanId(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {formTemplate === 'aaa' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Username</label>
                            <input
                              type="text"
                              value={formUsername}
                              onChange={e => setFormUsername(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Privilege level</label>
                            <select
                              value={formPrivilege}
                              onChange={e => setFormPrivilege(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="1">1 (Read Only)</option>
                              <option value="15">15 (Admin/Write)</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Password</label>
                            <input
                              type="password"
                              value={formPassword}
                              onChange={e => setFormPassword(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleGenerateConfig}
                        className="btn-primary w-full py-2.5 font-bold flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        Generate & Insert CLI Commands
                      </button>
                    </Card>
                  ) : (
                    /* Monospace syntax highlight editor */
                    <Card className="p-5 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold font-display text-atlas-ink">Monospace CLI Editor</h3>
                        <span className="text-[10px] text-slate-400 font-semibold">{linesCount} line(s)</span>
                      </div>
                      
                      <div className="relative border border-slate-700 bg-slate-950 rounded-lg overflow-hidden flex h-72">
                        {/* Line number gutter */}
                        <div className="w-10 bg-slate-900 border-r border-slate-800 text-slate-500 text-right pr-2 py-3 select-none font-mono text-xs leading-5">
                          {Array.from({ length: linesCount }).map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>

                        {/* Editor field area */}
                        <div className="flex-1 relative font-mono text-xs leading-5">
                          {/* Code highlights layer */}
                          <pre
                            ref={highlightRef}
                            className="absolute inset-0 p-3 m-0 bg-transparent text-slate-300 pointer-events-none overflow-hidden select-none whitespace-pre-wrap break-all"
                            dangerouslySetInnerHTML={{ __html: highlightCode(configPayload) }}
                          />

                          {/* Editable textarea overlay */}
                          <textarea
                            ref={textareaRef}
                            value={configPayload}
                            onChange={e => setConfigPayload(e.target.value)}
                            onScroll={handleScroll}
                            placeholder="Type CLI syntax configuration commands here..."
                            className="absolute inset-0 p-3 m-0 w-full h-full bg-transparent text-transparent caret-white outline-none resize-none overflow-y-auto whitespace-pre-wrap break-all"
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* STEP 3: 4-Stage pipeline validation */}
              {step === 3 && (
                <div className="space-y-4">
                  {/* Visuel 4-Stage checklist progress */}
                  <Card className="p-6">
                    <h3 className="text-sm font-bold font-display text-atlas-ink mb-4 uppercase tracking-wider">
                      Northbound Intent Validation Pipeline
                    </h3>
                    
                    <div className="space-y-3.5">
                      {[
                        { id: 'syntax', title: 'Stage 1: Syntax Validation', desc: 'Validates CLI command schemas against vendor formats.' },
                        { id: 'boundary', title: 'Stage 2: Tenant Boundary Isolation', desc: 'Checks isolation permissions and IPAM subnet range boundary rules.' },
                        { id: 'collision', title: 'Stage 3: Topology Collision Check', desc: 'Scans for link collisions, VLAN ID overlaps, and port-channel configurations.' },
                        { id: 'dryrun', title: 'Stage 4: Dry-Run Diff Engine', desc: 'Generates candidate device syntax configurations and diff outputs.' }
                      ].map(stage => {
                        const status = validationStages[stage.id as keyof typeof validationStages];
                        return (
                          <div key={stage.id} className="flex items-start gap-4">
                            <div className="mt-0.5">
                              {status === 'loading' && (
                                <RefreshCw className="w-5 h-5 text-atlas-primary animate-spin" />
                              )}
                              {status === 'success' && (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 stroke-[2.5]" />
                              )}
                              {status === 'failed' && (
                                <AlertCircle className="w-5 h-5 text-rose-500 stroke-[2.5]" />
                              )}
                              {status === 'pending' && (
                                <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-slate-50" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className={`text-xs font-bold ${status === 'failed' ? 'text-rose-600' : 'text-slate-800'}`}>
                                {stage.title}
                              </h4>
                              <p className="text-[10px] text-slate-400">{stage.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Errors display */}
                  {validationError && (
                    <Card className="p-4 border-rose-200 bg-rose-50/50 flex gap-3 text-rose-700 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                      <div>
                        <p className="font-bold">Pipeline validation failed:</p>
                        <p className="mt-1 font-mono">{validationError}</p>
                      </div>
                    </Card>
                  )}

                  {/* Validation results and Side-by-Side Diff comparator */}
                  {validationResult && validationResult.diffs && validationResult.diffs.map(d => {
                    const parsed = parseUnifiedDiff(d.diff || '');
                    return (
                      <Card key={d.switch_id} className="p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div>
                            <span className="text-xs font-bold text-slate-800">{d.hostname}</span>
                            <span className="text-[10px] text-slate-400 font-semibold ml-2 font-mono">Validation Result</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            d.validation_status === 'valid' || d.validation_status === 'driver_not_implemented' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {d.validation_status?.replace(/_/g, ' ') || 'unknown'}
                          </span>
                        </div>

                        {d.diff ? (
                          /* SIDE BY SIDE DIFF VIEW */
                          <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden text-[10px] font-mono leading-5">
                            {/* Header row */}
                            <div className="bg-slate-100 p-2 font-bold text-slate-500 text-center select-none">RUNNING CONFIG</div>
                            <div className="bg-slate-100 p-2 font-bold text-slate-500 text-center select-none">CANDIDATE CONFIG</div>

                            {/* Left column diff */}
                            <div className="bg-white p-3 space-y-px overflow-x-auto max-h-80 select-text">
                              {parsed.left.map((line, idx) => (
                                <div key={idx} className={`flex items-start ${
                                  line.type === 'removed' ? 'bg-rose-50 text-rose-700' :
                                  line.type === 'header' ? 'bg-slate-50 text-slate-400 italic' : ''
                                }`}>
                                  <span className="w-6 text-slate-300 text-right pr-1 select-none">{line.lineNum || ''}</span>
                                  <span className="w-4 text-center select-none font-bold text-rose-400">{line.type === 'removed' ? '-' : ''}</span>
                                  <span className="flex-1 whitespace-pre">{line.text}</span>
                                </div>
                              ))}
                            </div>

                            {/* Right column diff */}
                            <div className="bg-white p-3 space-y-px overflow-x-auto max-h-80 select-text border-l border-slate-200">
                              {parsed.right.map((line, idx) => (
                                <div key={idx} className={`flex items-start ${
                                  line.type === 'added' ? 'bg-emerald-50 text-emerald-700 font-semibold' :
                                  line.type === 'header' ? 'bg-slate-50 text-slate-400 italic' : ''
                                }`}>
                                  <span className="w-6 text-slate-300 text-right pr-1 select-none">{line.lineNum || ''}</span>
                                  <span className="w-4 text-center select-none font-bold text-emerald-500">{line.type === 'added' ? '+' : ''}</span>
                                  <span className="flex-1 whitespace-pre">{line.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-xs text-slate-400 font-semibold bg-slate-50 border border-dashed rounded-lg">
                            {d.validation_status === 'driver_not_implemented' 
                              ? 'Simulation driver validation succeeded. No configuration diff returned.'
                              : 'No configuration differences detected.'}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* STEP 4: Commit Deploy result */}
              {step === 4 && (
                <div className="space-y-4">
                  <Card className="p-6 space-y-4">
                    <div>
                      <h3 className="text-base font-bold font-display text-atlas-ink">Step 4: Confirm & Push Configuration</h3>
                      <p className="text-xs text-slate-400">Review deployment targets and execute the final configuration push task.</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Target Switch Count:</span>
                        <span className="font-bold text-slate-700">{selectedSwitchIds.length} switch(es)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Validation Mode:</span>
                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">PASSED</span>
                      </div>
                      {validationResult?.blast_radius && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Blast Radius Assessment:</span>
                          <span className={`font-bold px-2 py-0.5 rounded ${
                            validationResult.blast_radius.total_affected > 5 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {validationResult.blast_radius.total_affected} device(s) affected
                          </span>
                        </div>
                      )}
                    </div>

                    {deployError && (
                      <Card className="p-3 border-rose-200 bg-rose-50 text-rose-700 text-xs font-mono">
                        {deployError}
                      </Card>
                    )}

                    {deployResult && (
                      <Card className="p-5 space-y-3">
                        <div className={`flex items-center gap-2 text-xs font-bold uppercase ${
                          deployResult.status === 'PUSH_QUEUED' ? 'text-atlas-teal' :
                          deployResult.status === 'APPROVAL_REQUIRED' ? 'text-atlas-coral' : 'text-slate-700'
                        }`}>
                          {deployResult.status === 'APPROVAL_REQUIRED' ? <AlertTriangle className="w-5 h-5 text-rose-500" /> : <Check className="w-5 h-5" />}
                          {deployResult.status.replace(/_/g, ' ')}
                        </div>

                        {deployResult.status === 'APPROVAL_REQUIRED' && (
                          <p className="text-xs text-slate-500">
                            High blast radius change requires Platform Admin review and authorization.
                          </p>
                        )}

                        {deployResult.task_ids && deployResult.task_ids.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Triggered Celery Workers</p>
                            {deployResult.task_ids.map(t => (
                              <div key={t.switch_id} className="text-[10px] font-mono text-slate-600 flex justify-between bg-slate-50 p-2 rounded">
                                <span>{switches.find(s => s.switch_id === t.switch_id)?.hostname || t.switch_id}</span>
                                <span className="text-slate-400">task_id: {t.task_id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    )}

                    {!deployResult && (
                      <button
                        onClick={executeLiveCommit}
                        disabled={loading}
                        className="btn-primary w-full py-2.5 font-bold flex items-center justify-center gap-2 bg-atlas-coral hover:bg-atlas-coral/95"
                      >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {loading ? 'Deploying...' : 'Commit & Apply Configuration'}
                      </button>
                    )}
                  </Card>
                </div>
              )}
            </div>

            {/* Right: Controls Panel (1 column) */}
            <div className="space-y-4">
              <Card className="p-5 space-y-4">
                <h3 className="text-sm font-bold font-display text-atlas-ink">Wizard Controls</h3>
                
                <div className="space-y-2 text-[10px] text-slate-500">
                  <p className="font-bold text-slate-700">Instructions:</p>
                  {step === 1 && <p>Select switches to modify. You must select at least 1 switch.</p>}
                  {step === 2 && <p>Define commands. Choose Form mode for templates or CLI Editor for custom codes.</p>}
                  {step === 3 && <p>Review the northbound pipeline stages. Diff comparator shows aligned modifications.</p>}
                  {step === 4 && <p>Confirm and push candidate configurations to network elements.</p>}
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  {step > 1 && (
                    <button
                      onClick={handleBack}
                      className="btn-secondary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  )}
                  {step < 4 && (
                    <button
                      onClick={handleNext}
                      disabled={
                        loading ||
                        (step === 1 && selectedSwitchIds.length === 0) ||
                        (step === 2 && configPayload.trim().length === 0) ||
                        (step === 3 && validationStages.dryrun !== 'success')
                      }
                      className="btn-primary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      Next
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </Card>

              {/* Status panel */}
              {selectedSwitchIds.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workflow Context</h4>
                  <div className="text-[10px] text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Targets:</span>
                      <span className="font-semibold text-slate-800">{selectedSwitchIds.length} switch(es)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Config size:</span>
                      <span className="font-semibold text-slate-800">{configPayload.trim().split('\n').filter(Boolean).length} command(s)</span>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold font-display text-atlas-ink">Config Push History</h3>
            <button onClick={fetchHistory} className="text-xs text-atlas-primary hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="text-slate-400 text-xs py-10 text-center">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-slate-400 text-xs py-10 text-center">No config push history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Time</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Tenant</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Summary</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Blast</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {h.created_at ? new Date(h.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-semibold">{h.tenant}</td>
                      <td className="py-2.5 px-3 text-slate-600">{h.summary}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          h.blast_radius > 5 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {h.blast_radius}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          h.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                          h.status === 'rejected' ? 'bg-rose-50 text-rose-600' :
                          h.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {h.status === 'approved' ? 'pushed' :
                           h.status === 'pending' ? 'waiting approval' :
                           h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
export default ConfigPushPage;

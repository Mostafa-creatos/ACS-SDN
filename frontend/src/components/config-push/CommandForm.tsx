import React from 'react';
import type { CommandTemplate, CommandArg } from '../../types/config-push-types';

interface AvailableInterfaces {
  interfaces: string[];
  ethernet: string[];
  loopbacks: string[];
  port_channels: string[];
  mgmt: string[];
}

interface CommandFormProps {
  template: CommandTemplate | null;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  includedLines: Record<string, boolean>;
  onToggleLine: (lineIndex: number, included: boolean) => void;
  availableInterfaces?: AvailableInterfaces | null;
}

function renderArgInput(
  arg: CommandArg,
  value: string,
  onChange: (name: string, value: string) => void,
  availableInterfaces?: AvailableInterfaces | null,
) {
  const baseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono focus:border-atlas-violet focus:ring-1 focus:ring-atlas-violet/20 outline-none transition-colors';

  // Port/interface args get a dropdown of discovered interfaces
  if (arg.name === 'port' && availableInterfaces) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(arg.name, e.target.value)}
        className={baseClass}
      >
        <option value="">-- Select interface --</option>
        {availableInterfaces.ethernet.map((iface) => (
          <option key={iface} value={iface}>{iface}</option>
        ))}
        {availableInterfaces.port_channels.map((iface) => (
          <option key={iface} value={iface}>{iface}</option>
        ))}
        {availableInterfaces.loopbacks.map((iface) => (
          <option key={iface} value={iface}>{iface}</option>
        ))}
      </select>
    );
  }

  if (arg.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(arg.name, e.target.checked ? 'true' : 'false')}
          className="rounded border-slate-300 text-atlas-violet focus:ring-atlas-violet"
        />
        <span className="text-xs text-slate-600">{arg.label}</span>
      </label>
    );
  }

  if (arg.type === 'select' && arg.options) {
    return (
      <select
        value={value || String(arg.default ?? '')}
        onChange={(e) => onChange(arg.name, e.target.value)}
        className={baseClass}
      >
        {arg.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (arg.type === 'integer' || arg.type === 'vlan_range') {
    return (
      <input
        type={arg.type === 'integer' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(arg.name, e.target.value)}
        placeholder={arg.placeholder ?? String(arg.default ?? '')}
        min={arg.min}
        max={arg.max}
        className={baseClass}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(arg.name, e.target.value)}
      placeholder={arg.placeholder ?? String(arg.default ?? '')}
      className={baseClass}
    />
  );
}

function buildLinePreview(
  lineTemplate: string,
  values: Record<string, string>,
  includedLines: Record<string, boolean>,
  lineIndex: number,
): string | null {
  if (!includedLines[String(lineIndex)] && lineIndex > 0) return null;
  let result = lineTemplate;
  const argNames = lineTemplate.match(/\{(\w+)\}/g);
  if (argNames) {
    for (const placeholder of argNames) {
      const name = placeholder.slice(1, -1);
      const val = values[name];
      if (val === undefined || val === '') {
        if (lineTemplate.includes('{vlan_id}') && name === 'vlan_id' && values['mode'] === 'trunk') return null;
        if (lineTemplate.includes('{vlan_list}') && name === 'vlan_list' && values['mode'] === 'access') return null;
        return null;
      }
      result = result.replace(placeholder, val);
    }
  }
  return result;
}

export const CommandForm: React.FC<CommandFormProps> = ({
  template,
  values,
  onChange,
  includedLines,
  onToggleLine,
  availableInterfaces,
}) => {
  if (!template) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-slate-400 font-semibold bg-slate-50 rounded-xl border border-dashed border-slate-200">
        Select a command template from the catalog
      </div>
    );
  }

  const allArgs = new Map<string, CommandArg>();
  for (const gen of template.generates) {
    for (const arg of gen.args) {
      if (!allArgs.has(arg.name)) {
        allArgs.set(arg.name, arg);
      }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-bold font-display text-atlas-ink">{template.label}</h4>
        <p className="text-[10px] text-slate-400 font-mono">{template.id}</p>
      </div>

      {template.dependencies && template.dependencies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-700 flex items-center gap-2">
          <span className="font-bold">Requires:</span>
          <span className="font-mono">{template.dependencies.join(', ')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from(allArgs.entries()).map(([name, arg]) => (
          <div key={name} className={arg.optional ? 'opacity-70' : ''}>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              {arg.label}
              {arg.optional && <span className="text-slate-300 font-normal ml-1">(optional)</span>}
            </label>
            {renderArgInput(arg, values[name] ?? '', onChange, availableInterfaces)}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Generated Lines</p>
        <div className="space-y-1">
          {template.generates.map((gen, idx) => {
            const preview = buildLinePreview(gen.line, values, includedLines, idx);
            const isChecked = includedLines[String(idx)] ?? (!gen.optional || idx === 0);
            return (
              <div
                key={idx}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono ${
                  preview ? 'bg-slate-50 text-slate-700' : 'bg-slate-50/50 text-slate-300'
                }`}
              >
                {gen.optional && idx > 0 && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onToggleLine(idx, e.target.checked)}
                    className="rounded border-slate-300 text-atlas-violet focus:ring-atlas-violet shrink-0"
                  />
                )}
                <span className={!isChecked || !preview ? 'line-through' : ''}>
                  {preview ?? gen.line.replace(/\{(\w+)\}/g, (_, n) => values[n] || `{${n}}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

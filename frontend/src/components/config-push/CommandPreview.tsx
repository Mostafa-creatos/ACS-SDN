import React from 'react';
import { DELL_OS10_CATALOG } from '../../catalogs/dell_os10_commands';
import type { BuiltCommand } from '../../types/config-push-types';
import { COMMAND_ORDER } from '../../types/config-push-types';

interface CommandPreviewProps {
  builtCommands: BuiltCommand[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

function resolveDependencyOrder(commands: BuiltCommand[]): BuiltCommand[] {
  const sorted = [...commands].sort((a, b) => {
    const orderA = COMMAND_ORDER[a.categoryId] ?? 99;
    const orderB = COMMAND_ORDER[b.categoryId] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return 0;
  });

  const placed = new Set<string>();
  const result: BuiltCommand[] = [];

  for (const cmd of sorted) {
    const template = DELL_OS10_CATALOG.templates[cmd.templateId];
    if (template?.dependencies) {
      for (const depId of template.dependencies) {
        const depCmd = sorted.find(
          (c) => c.templateId === depId && !placed.has(c.templateId + c.generatedLines.join('')),
        );
        if (depCmd && !result.includes(depCmd)) {
          result.push(depCmd);
          placed.add(depCmd.templateId + depCmd.generatedLines.join(''));
        }
      }
    }
    if (!result.includes(cmd)) {
      result.push(cmd);
      placed.add(cmd.templateId + cmd.generatedLines.join(''));
    }
  }

  return result;
}

export const CommandPreview: React.FC<CommandPreviewProps> = ({
  builtCommands,
  onRemove,
  onClear,
}) => {
  const ordered = resolveDependencyOrder(builtCommands);

  if (builtCommands.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-slate-400 font-semibold bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No commands added yet. Use the catalog to build your config.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase text-slate-400">
          {ordered.length} command(s) &middot; auto-ordered by dependency
        </p>
        <button
          onClick={onClear}
          className="text-[10px] font-bold text-rose-500 hover:underline"
        >
          Clear All
        </button>
      </div>

      <div className="bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-slate-400">
            Dell OS10 CLI Output
          </span>
          <span className="text-[10px] text-slate-500">
            {ordered.reduce((sum, c) => sum + c.generatedLines.length, 0)} lines
          </span>
        </div>

        <div className="font-mono text-xs leading-6 p-4 space-y-3 max-h-80 overflow-y-auto">
          {ordered.map((cmd, idx) => {
            const cat = DELL_OS10_CATALOG.categories.find(
              (c) => c.id === cmd.categoryId,
            );
            return (
              <div key={idx}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                    {cmd.templateId}
                    {cat && (
                      <span className="text-slate-600 font-normal ml-2">
                        ({cat.label})
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => onRemove(idx)}
                    className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline"
                  >
                    remove
                  </button>
                </div>
                {cmd.generatedLines.map((line, li) => (
                  <div key={li} className="text-emerald-300">
                    <span className="text-slate-600 mr-2 select-none">{li + 1}</span>
                    {line}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

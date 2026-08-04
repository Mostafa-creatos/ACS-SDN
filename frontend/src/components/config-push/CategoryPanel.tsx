import React from 'react';
import {
  EthernetPort,
  Layout,
  Settings,
  Shield,
  GitBranch,
  Globe,
  ArrowRight,
  Columns,
  ShieldOff,
  Filter,
  ChevronRight,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { DELL_OS10_CATALOG, getTemplatesByCategory } from '../../catalogs/dell_os10_commands';
import type { CommandTemplate } from '../../types/config-push-types';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  ethernet: EthernetPort,
  layout: Layout,
  settings: Settings,
  shield: Shield,
  'git-branch': GitBranch,
  globe: Globe,
  'arrow-right': ArrowRight,
  columns: Columns,
  'shield-off': ShieldOff,
  filter: Filter,
};

interface CategoryPanelProps {
  expandedCategories: Record<string, boolean>;
  toggleCategory: (id: string) => void;
  onSelectTemplate: (template: CommandTemplate) => void;
}

export const CategoryPanel: React.FC<CategoryPanelProps> = ({
  expandedCategories,
  toggleCategory,
  onSelectTemplate,
}) => {
  return (
    <div className="space-y-1.5">
      {DELL_OS10_CATALOG.categories.map((cat) => {
        const Icon = ICON_MAP[cat.icon] || Settings;
        const isExpanded = expandedCategories[cat.id];
        const templates = getTemplatesByCategory(cat.id);
        return (
          <div key={cat.id}>
            <button
              onClick={() => toggleCategory(cat.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <Icon className="w-4 h-4 text-slate-500 shrink-0" />
              <span>{cat.label}</span>
            </button>
            {isExpanded && (
              <div className="ml-6 space-y-0.5 mt-0.5">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => onSelectTemplate(tmpl)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-atlas-violet/5 hover:text-atlas-violet rounded-lg transition-colors text-left"
                  >
                    <Plus className="w-3 h-3 text-slate-300 shrink-0" />
                    <span>{tmpl.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

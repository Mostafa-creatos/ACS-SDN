import React from 'react';
import { Card } from '../components/Card';
import { StatusPill } from '../components/StatusPill';
import { ProgressBar } from '../components/ProgressBar';

export const Styleguide: React.FC = () => {
  const colors = [
    { name: 'Atlas Ink', token: 'bg-atlas-ink', hex: '#3B3081', text: 'text-white' },
    { name: 'Atlas Primary', token: 'bg-atlas-primary', hex: '#51509D', text: 'text-white' },
    { name: 'Atlas Violet', token: 'bg-atlas-violet', hex: '#564EBD', text: 'text-white' },
    { name: 'Atlas Teal', token: 'bg-atlas-teal', hex: '#42CCB2', text: 'text-slate-900' },
    { name: 'Atlas Coral', token: 'bg-atlas-coral', hex: '#E26C48', text: 'text-white' },
    { name: 'Atlas Lavender', token: 'bg-atlas-lavender', hex: '#BAC0D8', text: 'text-slate-900' },
    { name: 'Sidebar Dark', token: 'bg-sidebar-bg', hex: '#251F4A', text: 'text-white' },
    { name: 'Surface Light', token: 'bg-surface-light', hex: '#F8F9FC', text: 'text-slate-900', border: 'border border-slate-200' },
    { name: 'Surface Card', token: 'bg-surface-card', hex: '#FFFFFF', text: 'text-slate-900', border: 'border border-slate-200' },
    { name: 'Ink Muted', token: 'bg-ink-muted', hex: '#6B6B85', text: 'text-white' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-4xl font-extrabold font-display tracking-tight">Style Guide & Design Tokens</h1>
        <p className="text-slate-500 mt-2">Atlas Cloud Services brand identity design elements</p>
      </div>

      {/* Typography */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Typography</h2>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-slate-400 font-mono">Display Heading (Sora/Manrope, Bold)</span>
            <p className="text-3xl font-bold font-display">The quick brown fox jumps over the lazy dog</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono">Section Heading (Sora/Manrope, Semibold)</span>
            <p className="text-xl font-semibold font-display">The quick brown fox jumps over the lazy dog</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono">Body/Data (Inter, Regular)</span>
            <p className="text-sm font-sans text-slate-700">
              The quick brown fox jumps over the lazy dog. Used for tables, forms, labels and secondary content where high legibility is key.
            </p>
          </div>
        </div>
      </section>

      {/* Colors Grid */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Color Palette</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {colors.map((c) => (
            <div key={c.name} className={`rounded-xl p-4 flex flex-col justify-between h-28 shadow-sm ${c.token} ${c.text} ${c.border || ''}`}>
              <span className="font-display font-semibold text-sm">{c.name}</span>
              <div className="flex flex-col text-xs font-mono opacity-90">
                <span>{c.token}</span>
                <span>{c.hex}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Status Pills */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Status Badges</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Active/Compliant</span>
            <StatusPill status="compliant_active" />
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Drifted/Critical</span>
            <StatusPill status="drifted" />
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Discovered</span>
            <StatusPill status="discovered" />
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Auditing</span>
            <StatusPill status="auditing" />
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Buttons</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Primary Button</span>
            <button className="btn-primary">Approve Change</button>
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Secondary Button</span>
            <button className="btn-secondary">Run Compliance Audit</button>
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Danger Button</span>
            <button className="btn-danger">Trigger Rollback</button>
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Disabled Primary</span>
            <button className="btn-primary" disabled>Approve Change</button>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Cards</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-display font-semibold text-lg mb-2">Standard Brand Card</h3>
            <p className="text-sm text-slate-600">
              White background, 8px rounded corners, lavender border with low opacity, and soft shadow. Used for grouping page controls and tables.
            </p>
          </Card>
          <Card hoverable={true}>
            <h3 className="font-display font-semibold text-lg mb-2">Hoverable Card</h3>
            <p className="text-sm text-slate-600">
              Expands shadow slightly and deepens border color on hover. Ideal for interactive dashboard statistics cards.
            </p>
          </Card>
        </div>
      </section>

      {/* Progress Bars */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold font-display border-b pb-2">Progress Bars (IP Utilization)</h2>
        <div className="space-y-6 max-w-md">
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Under Threshold (Teal)</span>
            <ProgressBar value={74.5} />
          </div>
          <div>
            <span className="block text-xs text-slate-400 font-mono mb-1">Over Threshold &gt;= 90% (Coral)</span>
            <ProgressBar value={93.2} />
          </div>
        </div>
      </section>
    </div>
  );
};
export default Styleguide;

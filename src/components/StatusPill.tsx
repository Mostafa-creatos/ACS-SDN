import React from 'react';

export type StatusVariant = 'compliant_active' | 'drifted' | 'discovered' | 'auditing';

interface StatusPillProps {
  status: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const norm = status.toLowerCase().replace(/[\s-]/g, '_');
  
  let variant: StatusVariant = 'discovered';
  let label = status;

  if (norm.includes('active') || norm.includes('compliant')) {
    variant = 'compliant_active';
    label = 'Compliant / Active';
  } else if (norm.includes('drifted') || norm.includes('critical') || norm.includes('warn')) {
    variant = 'drifted';
    label = 'Drifted';
  } else if (norm.includes('audit')) {
    variant = 'auditing';
    label = 'Auditing';
  } else if (norm.includes('discover') || norm.includes('raw') || norm.includes('build')) {
    variant = 'discovered';
    label = 'Discovered';
  }

  const classes = {
    compliant_active: 'status-pill-compliant',
    drifted: 'status-pill-drifted',
    discovered: 'status-pill-discovered',
    auditing: 'status-pill-auditing',
  };

  const dots = {
    compliant_active: 'bg-atlas-teal',
    drifted: 'bg-atlas-coral',
    discovered: 'bg-slate-400',
    auditing: 'bg-atlas-violet',
  };

  return (
    <span className={`status-pill ${classes[variant]}`}>
      <span className={`w-2 h-2 rounded-full ${dots[variant]}`} />
      <span>{label}</span>
    </span>
  );
};

import React from 'react';

interface ProgressBarProps {
  value: number; // percentage from 0 to 100
  showLabel?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, showLabel = true }) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const isHigh = clampedValue >= 90;
  
  // Enforce a minimum width of 4% if there is any active allocation (value > 0)
  // so that tiny percentages show up visually as a small colored sliver.
  const displayWidth = clampedValue > 0 ? Math.max(clampedValue, 4) : 0;
  
  return (
    <div className="w-full font-sans">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-slate-600">
            IP Utilization
          </span>
          <span className={`text-xs font-bold ${isHigh ? 'text-atlas-coral' : 'text-slate-700'}`}>
            {clampedValue.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isHigh ? 'bg-atlas-coral' : 'bg-atlas-teal'
          }`}
          style={{ width: `${displayWidth}%` }}
        />
      </div>
    </div>
  );
};

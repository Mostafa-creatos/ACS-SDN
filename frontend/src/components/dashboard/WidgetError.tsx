import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Card } from '../Card';

interface Props {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const WidgetError: React.FC<Props> = ({
  message = 'Failed to load data',
  onRetry,
  className = '',
}) => {
  return (
    <Card className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${className}`}>
      <AlertCircle className="w-8 h-8 text-rose-500" />
      <p className="text-xs text-slate-600 font-medium">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-atlas-primary hover:underline"
        >
          <RotateCw className="w-3 h-3" /> Retry
        </button>
      )}
    </Card>
  );
};

import React from 'react';
import { Card } from '../Card';

interface Props {
  className?: string;
}

export const WidgetSkeleton: React.FC<Props> = ({ className = '' }) => {
  return (
    <Card className={`animate-pulse bg-slate-100 border-none ${className}`}>
      <div className="h-full w-full" />
    </Card>
  );
};

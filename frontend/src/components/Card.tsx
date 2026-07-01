import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hoverable = false, ...props }) => {
  return (
    <div 
      className={`atlas-card ${hoverable ? 'atlas-card-hover' : ''} ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
};

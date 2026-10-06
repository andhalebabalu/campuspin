import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

/** The one card surface: 1px border + a soft shadow, matching every list/detail panel. */
export function Card({ hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface shadow-xs ${
        hover
          ? 'transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lg'
          : ''
      } ${className}`}
      {...props}
    />
  );
}

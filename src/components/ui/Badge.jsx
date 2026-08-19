import React from 'react';

/**
 * 🏷️ Status Badge Component
 * @param {'success'|'warning'|'danger'|'info'|'neutral'|'indigo'} variant
 */
export default function Badge({ 
  children, 
  variant = 'neutral', 
  size = 'md', 
  icon = null,
  style = {} 
}) {
  const variantStyles = {
    success: {
      background: '#dcfce7',
      color: '#15803d',
      border: '1px solid #bbf7d0'
    },
    warning: {
      background: '#fef3c7',
      color: '#b45309',
      border: '1px solid #fde68a'
    },
    danger: {
      background: '#fee2e2',
      color: '#b91c1c',
      border: '1px solid #fecaca'
    },
    info: {
      background: '#e0f2fe',
      color: '#0369a1',
      border: '1px solid #bae6fd'
    },
    indigo: {
      background: '#f5f3ff',
      color: '#4338ca',
      border: '1px solid #ddd6fe'
    },
    neutral: {
      background: '#f1f5f9',
      color: '#475569',
      border: '1px solid #e2e8f0'
    }
  };

  const sizeStyles = {
    sm: { padding: '2px 6px', fontSize: '11px', borderRadius: '4px' },
    md: { padding: '3px 8px', fontSize: '12px', borderRadius: '5px' },
    lg: { padding: '4px 10px', fontSize: '13px', borderRadius: '6px' }
  };

  const currentVariant = variantStyles[variant] || variantStyles.neutral;
  const currentSize = sizeStyles[size] || sizeStyles.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '0.1px',
        ...currentVariant,
        ...currentSize,
        ...style
      }}
    >
      {icon && <span style={{ fontSize: '1.1em', lineHeight: 1 }}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

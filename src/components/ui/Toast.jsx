import React from 'react';

/**
 * 🍞 Toast Component
 * แสดงกล่องแจ้งเตือนมุมจอสไตล์ Slate Theme
 */
export default function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  const typeConfig = {
    success: {
      icon: '✅',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      text: '#166534',
      accent: '#22c55e'
    },
    error: {
      icon: '❌',
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
      accent: '#ef4444'
    },
    warning: {
      icon: '⚠️',
      bg: '#fffbeb',
      border: '#fde68a',
      text: '#92400e',
      accent: '#f59e0b'
    },
    info: {
      icon: 'ℹ️',
      bg: '#eff6ff',
      border: '#bfdbfe',
      text: '#1e40af',
      accent: '#3b82f6'
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none'
      }}
    >
      {toasts.map(toast => {
        const config = typeConfig[toast.type] || typeConfig.info;
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: config.bg,
              border: `1px solid ${config.border}`,
              borderLeft: `5px solid ${config.accent}`,
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              animation: 'slideInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1.2 }}>{config.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {toast.title && (
                <div style={{ fontWeight: 700, fontSize: '13px', color: config.text, marginBottom: '2px' }}>
                  {toast.title}
                </div>
              )}
              <div style={{ fontSize: '13px', color: config.text, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: config.text,
                opacity: 0.6,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px',
                lineHeight: 1,
                borderRadius: '4px'
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

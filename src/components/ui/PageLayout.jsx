import React from 'react';

/**
 * 🏛️ PageLayout Component
 * โครงสร้าง Layout มาตรฐานสำหรับ View ต่างๆ ในระบบ
 */
export default function PageLayout({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  maxWidth = '100%',
  style = {}
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        maxWidth: maxWidth,
        margin: '0 auto',
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style
      }}
    >
      {/* Page Header */}
      {(title || actions) && (
        <header
          style={{
            padding: '16px 24px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {icon && (
              <div
                style={{
                  fontSize: '22px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0'
                }}
              >
                {icon}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.2px'
                  }}
                >
                  {title}
                </h1>
                {badge}
              </div>
              {subtitle && (
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '12.5px',
                    color: '#64748b',
                    fontWeight: 500
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons Zone */}
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {actions}
            </div>
          )}
        </header>
      )}

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px 24px',
          boxSizing: 'border-box'
        }}
      >
        {children}
      </div>
    </div>
  );
}

import React from 'react';

/**
 * 🧭 HubTabBar: Segmented Tab Bar for Sub-View Navigation
 * ใช้สำหรับสลับแท็บภายใน Hub Views (เช่น Trucks & Maintenance, Drivers & Leaves, Operations & History)
 */
export default function HubTabBar({
  tabs = [],
  activeTab,
  onTabChange,
  rightContent = null,
  style = {}
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      marginBottom: '14px',
      flexShrink: 0,
      flexWrap: 'wrap',
      ...style
    }}>
      {/* Segmented Tab Group */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#f1f5f9',
        padding: '3px',
        borderRadius: '9px',
        gap: '2px',
        border: '1px solid #e2e8f0',
        userSelect: 'none'
      }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                height: '30px',
                borderRadius: '7px',
                border: isActive ? '1px solid #bfdbfe' : '1px solid transparent',
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#1d4ed8' : '#64748b',
                fontSize: '12.5px',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.06)' : 'none',
                transition: 'all 0.15s ease',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#0f172a';
                  e.currentTarget.style.background = '#e2e8f0';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab.icon && <span style={{ fontSize: '13px' }}>{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isActive ? '#eff6ff' : '#e2e8f0',
                  color: isActive ? '#2563eb' : '#64748b',
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right Custom Content / Controls */}
      {rightContent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {rightContent}
        </div>
      )}
    </div>
  );
}

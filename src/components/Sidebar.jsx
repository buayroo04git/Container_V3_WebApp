import React from 'react';
import { NAVIGATION_SECTIONS } from '../config/navigationConfig';

/**
 * 🧭 Dynamic Sidebar Component
 * เรนเดอร์เมนูอัตโนมัติตาม config ใน src/config/navigationConfig.js
 */
export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside style={{ 
      width: '240px', 
      minWidth: '240px',
      background: '#ffffff', 
      borderRight: '1px solid #f1f5f9', 
      display: 'flex', 
      flexDirection: 'column', 
      padding: '16px 12px',
      userSelect: 'none'
    }}>
      {/* Brand Header */}
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '2px 6px 14px 6px',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '14px'
      }}>
        {/* Modern App Icon Badge */}
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '9px',
          background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 900,
          fontSize: '15px',
          boxShadow: '0 4px 10px rgba(37, 99, 235, 0.28)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          flexShrink: 0
        }}>
          📦
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '14px', 
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.3px',
              lineHeight: 1.2
            }}>
              Container V3
            </h2>
            <span style={{
              padding: '1.5px 6px',
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              color: '#1d4ed8',
              fontSize: '9px',
              fontWeight: 900,
              border: '1px solid #93c5fd',
              letterSpacing: '0.3px',
              textTransform: 'uppercase'
            }}>
              PRO MAX
            </span>
          </div>
          <p style={{ 
            margin: '2px 0 0 0', 
            fontSize: '10.5px', 
            color: '#64748b', 
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            WebApp Fleet Hub
          </p>
        </div>
      </div>

      {/* Navigation Groups (Rendered dynamically from NAVIGATION_SECTIONS) */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        {NAVIGATION_SECTIONS.map((section) => (
          <div key={section.id || section.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            
            {/* Main Section Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 4px 2px 4px',
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#334155',
              letterSpacing: '0.2px'
            }}>
              <span style={{ fontSize: '13px' }}>{section.icon}</span>
              <span>{section.title}</span>
            </div>

            {/* Sub-menu Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5px', paddingLeft: '4px', marginLeft: '4px' }}>
              {section.items.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    title={item.description || item.label}
                    onClick={() => setActiveTab(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      outline: 'none',
                      background: isActive ? '#eff6ff' : 'transparent',
                      color: isActive ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: isActive ? 700 : 500,
                      textAlign: 'left',
                      transition: 'all 0.12s ease',
                      width: '100%',
                      lineHeight: 1.25,
                      boxSizing: 'border-box',
                      minHeight: '28px'
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#0f172a';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#64748b';
                      }
                    }}
                  >
                    <span style={{ fontSize: '13px', lineHeight: 1.25, flexShrink: 0, marginTop: '1px' }}>{item.icon}</span>
                    <span style={{
                      flex: 1,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: 1.25
                    }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span style={{
                        fontSize: '9.5px',
                        padding: '1px 5px',
                        borderRadius: '999px',
                        background: isActive ? '#2563eb' : '#e2e8f0',
                        color: isActive ? '#ffffff' : '#475569',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px'
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Status */}
      <div style={{ 
        marginTop: 'auto', 
        padding: '12px 6px 0 6px', 
        fontSize: '11px', 
        color: '#94a3b8', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid #f1f5f9' 
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981', fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
          Online
        </span>
        <span style={{ color: '#94a3b8', fontWeight: 500 }}>V3.0.0</span>
      </div>
    </aside>
  );
}

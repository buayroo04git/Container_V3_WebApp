import React from 'react';

/**
 * 📊 KpiCard: Reusable Central KPI Metric Card Component
 * จัดระเบียบการแสดงผลการ์ดสรุป KPI กลางของทั้งระบบ (Trucks, Drivers, Containers, History)
 * 
 * คุณสมบัติ:
 * - ความสูงคงที่ สัดส่วนสม่ำเสมอ Baseline แนวนอนเท่ากัน 100%
 * - ตัวอักษรหน่วยนับ (คัน, งาน, คน) เข้มชัดเจน คมชัด ไม่จาง
 * - รองรับธีมสีและ Badge สถานะครบถ้วน
 */
export default function KpiCard({
  title,
  value,
  unit,
  theme = 'slate',
  badge,
  subtext,
  isActive = false,
  onClick,
  style = {}
}) {
  const themes = {
    slate: {
      activeBg: '#eff6ff',
      activeBorder: '#2563eb',
      titleColor: '#64748b',
      activeTitleColor: '#1d4ed8',
      valueColor: '#0f172a',
      unitColor: '#475569',
      badgeBg: '#e2e8f0',
      badgeColor: '#334155'
    },
    green: {
      activeBg: '#f0fdf4',
      activeBorder: '#16a34a',
      titleColor: '#16a34a',
      activeTitleColor: '#15803d',
      valueColor: '#16a34a',
      unitColor: '#15803d',
      badgeBg: '#dcfce7',
      badgeColor: '#16a34a'
    },
    emerald: {
      activeBg: '#ecfdf5',
      activeBorder: '#059669',
      titleColor: '#059669',
      activeTitleColor: '#047857',
      valueColor: '#059669',
      unitColor: '#047857',
      badgeBg: '#d1fae5',
      badgeColor: '#059669'
    },
    blue: {
      activeBg: '#eff6ff',
      activeBorder: '#2563eb',
      titleColor: '#2563eb',
      activeTitleColor: '#1d4ed8',
      valueColor: '#2563eb',
      unitColor: '#1d4ed8',
      badgeBg: '#dbeafe',
      badgeColor: '#2563eb'
    },
    amber: {
      activeBg: '#fffbeb',
      activeBorder: '#d97706',
      titleColor: '#d97706',
      activeTitleColor: '#b45309',
      valueColor: '#d97706',
      unitColor: '#b45309',
      badgeBg: '#fef3c7',
      badgeColor: '#d97706'
    },
    rose: {
      activeBg: '#fff1f2',
      activeBorder: '#e11d48',
      titleColor: '#e11d48',
      activeTitleColor: '#be123c',
      valueColor: '#e11d48',
      unitColor: '#be123c',
      badgeBg: '#ffe4e6',
      badgeColor: '#e11d48'
    },
    purple: {
      activeBg: '#faf5ff',
      activeBorder: '#9333ea',
      titleColor: '#9333ea',
      activeTitleColor: '#7e22ce',
      valueColor: '#9333ea',
      unitColor: '#7e22ce',
      badgeBg: '#f3e8ff',
      badgeColor: '#9333ea'
    }
  };

  const t = themes[theme] || themes.slate;

  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? t.activeBg : '#ffffff',
        border: isActive ? `1.5px solid ${t.activeBorder}` : '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: isActive ? `0 2px 8px ${t.activeBorder}20` : '0 1px 3px rgba(0,0,0,0.02)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '88px',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {/* Title & Badge Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '6px',
        minHeight: '30px'
      }}>
        <span style={{
          fontSize: '11.5px',
          fontWeight: 700,
          color: isActive ? t.activeTitleColor : t.titleColor,
          lineHeight: 1.35,
          letterSpacing: '0.2px'
        }}>
          {title}
        </span>
        {badge && (
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: t.badgeColor,
            background: t.badgeBg,
            padding: '1px 6px',
            borderRadius: '4px',
            flexShrink: 0,
            marginTop: '1px'
          }}>
            {badge}
          </span>
        )}
      </div>

      {/* Value, Unit & Subtext */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
          lineHeight: 1.1
        }}>
          <span style={{
            fontSize: '24px',
            fontWeight: 800,
            color: t.valueColor,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
          }}>
            {typeof value === 'number' ? value.toLocaleString() : (value ?? 0)}
          </span>
          {unit && (
            <span style={{
              fontSize: '13px',
              fontWeight: 700,
              color: t.unitColor,
              opacity: 0.95
            }}>
              {unit}
            </span>
          )}
        </div>
        {subtext && (
          <div style={{
            fontSize: '10.5px',
            color: '#64748b',
            marginTop: '3px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

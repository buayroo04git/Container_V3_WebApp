import React from 'react';
import { normalizeExcelDate } from '../../utils/matchingLogic';

/**
 * 🎨 Helper คำนวณชุดสีและเงาของปุ่ม Candidate ให้สอดคล้องกับสีของแถว
 */
export const getCandidateTheme = (rowColor, isSelected) => {
  if (isSelected) {
    if (rowColor === 'dupGreen') {
      return {
        bg: '#eef2ff',
        border: '1.5px solid #6366f1',
        color: '#312e81',
        pctColor: '#4338ca',
        badgeBg: '#6366f1',
        badgeColor: '#ffffff',
        checkColor: '#4f46e5',
        shadow: '0 2px 4px rgba(99, 102, 241, 0.2)'
      };
    }
    if (rowColor === 'green') {
      return {
        bg: '#ecfdf5',
        border: '1.5px solid #10b981',
        color: '#065f46',
        pctColor: '#047857',
        badgeBg: '#10b981',
        badgeColor: '#ffffff',
        checkColor: '#10b981',
        shadow: '0 2px 4px rgba(16, 185, 129, 0.15)'
      };
    }
    if (rowColor === 'blue') {
      return {
        bg: '#f0f9ff',
        border: '1.5px solid #0ea5e9',
        color: '#0369a1',
        pctColor: '#0284c7',
        badgeBg: '#0ea5e9',
        badgeColor: '#ffffff',
        checkColor: '#0ea5e9',
        shadow: '0 2px 4px rgba(14, 165, 233, 0.15)'
      };
    }
    if (rowColor === 'yellow') {
      return {
        bg: '#fffbeb',
        border: '1.5px solid #f59e0b',
        color: '#92400e',
        pctColor: '#b45309',
        badgeBg: '#f59e0b',
        badgeColor: '#ffffff',
        checkColor: '#f59e0b',
        shadow: '0 2px 4px rgba(245, 158, 11, 0.15)'
      };
    }
    return {
      bg: '#fff1f2',
      border: '1.5px solid #f43f5e',
      color: '#9f1239',
      pctColor: '#be123c',
      badgeBg: '#f43f5e',
      badgeColor: '#ffffff',
      checkColor: '#f43f5e',
      shadow: '0 2px 4px rgba(244, 63, 94, 0.15)'
    };
  }

  // Not Selected (Default States)
  if (rowColor === 'dupGreen') {
    return {
      bg: '#ffffff',
      border: '1px dashed #a5b4fc',
      color: '#4338ca',
      pctColor: '#6366f1',
      badgeBg: '#ede9fe',
      badgeColor: '#4338ca',
      checkColor: '#4338ca',
      shadow: 'none'
    };
  }
  if (rowColor === 'green') {
    return {
      bg: '#f8fdf9',
      border: '1px solid #bbf7d0',
      color: '#166534',
      pctColor: '#15803d',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d',
      checkColor: '#166534',
      shadow: 'none'
    };
  }
  if (rowColor === 'blue') {
    return {
      bg: '#f0f9ff',
      border: '1px solid #bae6fd',
      color: '#0369a1',
      pctColor: '#0284c7',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      checkColor: '#0369a1',
      shadow: 'none'
    };
  }
  if (rowColor === 'yellow') {
    return {
      bg: '#fffdf7',
      border: '1px solid #fde68a',
      color: '#92400e',
      pctColor: '#b45309',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309',
      checkColor: '#92400e',
      shadow: 'none'
    };
  }
  return {
    bg: '#ffffff',
    border: '1px solid #fecaca',
    color: '#991b1b',
    pctColor: '#b91c1c',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    checkColor: '#991b1b',
    shadow: 'none'
  };
};

/**
 * 🏷️ Component ปุ่ม Candidate เดี่ยว (Uniform 360px Width, ข้อมูลครบในตัว, ปลอดภัย 100%)
 */
export default function CandidateButton({
  cand = {},
  sib = {},
  cIdx = 0,
  isSelected = false,
  rowMatchColor = 'green',
  onClick
}) {
  const currentSib = sib || cand.record || {};
  const cNo = currentSib.container_no || cand.container_no || '-';

  const sim = (cand.score >= 0.99 || cand.matchRate >= 99)
    ? '100%' 
    : `${Math.round(cand.matchRate ?? (cand.score ? cand.score * 100 : 0))}%`;

  const jobBadge = currentSib.dis_load 
    ? (String(currentSib.dis_load).toLowerCase().includes('dis') ? 'Dis' : String(currentSib.dis_load).toLowerCase().includes('load') ? 'Load' : null) 
    : null;

  const theme = getCandidateTheme(rowMatchColor, isSelected);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        width: '435px',
        minWidth: '435px',
        height: '32px',
        boxSizing: 'border-box',
        padding: '0 10px',
        borderRadius: '6px',
        border: theme.border,
        background: theme.bg,
        color: theme.color,
        fontWeight: isSelected ? 800 : 600,
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: theme.shadow,
        transition: 'all 0.15s ease',
        textAlign: 'left',
        flexShrink: 0
      }}
      title={`คลิกเลือก: ${cNo} • ท่า ${currentSib.port || '-'} • Size ${currentSib.size || '-'} • ${currentSib.dis_load || '-'} • Job ${currentSib.date_job || '-'}`}
    >
      {/* 1. ลำดับ */}
      <span style={{
        fontSize: '10px',
        padding: '1.5px 5px',
        borderRadius: '4px',
        background: theme.badgeBg,
        color: theme.badgeColor,
        fontWeight: 800,
        flexShrink: 0
      }}>
        #{cIdx + 1}
      </span>

      {/* 2. เลขตู้ */}
      <span style={{
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        letterSpacing: '0.4px',
        fontWeight: 800,
        fontSize: '12.5px',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}>
        {cNo}
      </span>

      {/* 3. ท่า • Size • วันทำงาน (ไม่มีไอคอนปฏิทิน) */}
      {(currentSib.port || currentSib.size || currentSib.date_job) && (
        <span style={{
          fontSize: '11px',
          color: theme.color,
          opacity: 0.9,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: isSelected ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)',
          padding: '1.5px 6px',
          borderRadius: '4px',
          flexShrink: 0
        }}>
          {[
            currentSib.port ? `ท่า ${currentSib.port}` : null,
            currentSib.size ? `Size ${String(currentSib.size).replace(/[^0-9]/g, '') || currentSib.size}` : null,
            currentSib.date_job ? (() => {
              const dj = currentSib.date_job;
              const iso = normalizeExcelDate(dj);
              if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                const [y, m, d] = iso.split('-');
                return `${d}/${m}/${y.slice(2)}`;
              }
              return dj;
            })() : null
          ].filter(Boolean).join(' • ')}
        </span>
      )}

      {/* 4. Job Badge (Dis / Load - ไม่มีไอคอน) */}
      {jobBadge && (
        <span style={{
          fontSize: '10.5px',
          padding: '1.5px 6px',
          borderRadius: '4px',
          background: jobBadge === 'Dis' ? '#dbeafe' : '#ffedd5',
          color: jobBadge === 'Dis' ? '#1d4ed8' : '#c2410c',
          border: jobBadge === 'Dis' ? '1px solid #93c5fd' : '1px solid #fed7aa',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0
        }}>
          {jobBadge}
        </span>
      )}

      {/* 5. % ความตรง */}
      <span style={{
        fontSize: '11px',
        fontWeight: 800,
        color: theme.pctColor,
        flexShrink: 0
      }}>
        ({sim})
      </span>

      {/* 6. เครื่องหมายถูก */}
      {isSelected && (
        <span style={{ color: theme.checkColor, fontSize: '13px', fontWeight: 900, flexShrink: 0 }}>✓</span>
      )}
    </button>
  );
}

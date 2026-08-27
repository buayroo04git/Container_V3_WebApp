import React, { useState, useRef, useEffect } from 'react';

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * 📅 Reusable, Bulletproof Month Picker for Firefox, Chrome, Safari, Edge
 * @param {string} value - YYYY-MM e.g. '2026-08'
 * @param {function} onChange - callback(newValue)
 */
export default function MonthPicker({ value, onChange, label = 'เดือน:' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const isValidMonth = Boolean(value && value !== 'ALL' && /^\d{4}-\d{2}$/.test(String(value).trim()));
  const validStr = isValidMonth ? String(value).trim() : new Date().toISOString().slice(0, 7);
  const [currentYear, currentMonth] = validStr.split('-').map(Number);

  const [displayYear, setDisplayYear] = useState(currentYear || new Date().getFullYear());

  useEffect(() => {
    if (currentYear && !isNaN(currentYear)) {
      setDisplayYear(currentYear);
    }
  }, [currentYear]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    const baseYear = (!isNaN(currentYear) && currentYear) ? currentYear : new Date().getFullYear();
    const baseMonth = (!isNaN(currentMonth) && currentMonth) ? currentMonth : (new Date().getMonth() + 1);
    const date = new Date(baseYear, baseMonth - 2, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    onChange(`${y}-${m}`);
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    const baseYear = (!isNaN(currentYear) && currentYear) ? currentYear : new Date().getFullYear();
    const baseMonth = (!isNaN(currentMonth) && currentMonth) ? currentMonth : (new Date().getMonth() + 1);
    const date = new Date(baseYear, baseMonth, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    onChange(`${y}-${m}`);
  };

  const handleSelectMonth = (monthIdx) => {
    const m = String(monthIdx + 1).padStart(2, '0');
    onChange(`${displayYear}-${m}`);
    setIsOpen(false);
  };

  const currentMonthName = THAI_MONTHS_FULL[(currentMonth || 1) - 1] || 'ส.ค.';

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      
      {/* Controls Container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        padding: '3px 6px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        gap: '4px'
      }}>
        {label && (
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', paddingLeft: '4px' }}>
            📅 {label}
          </span>
        )}

        {/* Stepper Prev */}
        <button
          type="button"
          onClick={handlePrevMonth}
          title="เดือนก่อนหน้า"
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            color: '#334155',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.1s'
          }}
          onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
          onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}
        >
          ◀
        </button>

        {/* Center Display Button (Opens Popover) */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: isOpen ? '1px solid #3b82f6' : (isValidMonth ? '1px solid #bfdbfe' : '1px solid #e2e8f0'),
            background: isOpen ? '#eff6ff' : (isValidMonth ? '#eff6ff' : '#ffffff'),
            color: isValidMonth ? '#1d4ed8' : '#0f172a',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '125px',
            justifyContent: 'center'
          }}
        >
          <span>{isValidMonth ? `${currentMonthName} ${currentYear}` : '🌐 ทุกเดือน (All)'}</span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>▼</span>
        </button>

        {/* Stepper Next */}
        <button
          type="button"
          onClick={handleNextMonth}
          title="เดือนถัดไป"
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            color: '#334155',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.1s'
          }}
          onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
          onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}
        >
          ▶
        </button>
      </div>

      {/* Popover 12-Month Calendar Grid */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          padding: '14px',
          zIndex: 99999,
          width: '260px'
        }}>
          {/* Year Header Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={() => setDisplayYear(displayYear - 1)}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '12px',
                color: '#334155'
              }}
            >
              ◀
            </button>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              พ.ศ. {displayYear + 543} ({displayYear})
            </span>
            <button
              type="button"
              onClick={() => setDisplayYear(displayYear + 1)}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '12px',
                color: '#334155'
              }}
            >
              ▶
            </button>
          </div>

          {/* 12 Months Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px'
          }}>
            {THAI_MONTHS.map((mName, idx) => {
              const isSelected = displayYear === currentYear && (idx + 1) === currentMonth;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #f1f5f9',
                    background: isSelected ? '#2563eb' : '#f8fafc',
                    color: isSelected ? '#ffffff' : '#334155',
                    fontWeight: isSelected ? 800 : 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.1s'
                  }}
                  onMouseOver={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#e2e8f0';
                      e.currentTarget.style.color = '#0f172a';
                    }
                  }}
                  onMouseOut={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#334155';
                    }
                  }}
                >
                  {mName}
                </button>
              );
            })}
          </div>

          {/* Quick Buttons */}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              style={{
                background: !isValidMonth ? '#eff6ff' : 'transparent',
                border: !isValidMonth ? '1px solid #bfdbfe' : 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                color: '#2563eb',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🌐 ทุกเดือน (All)
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                onChange(`${y}-${m}`);
                setIsOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#2563eb',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📅 เดือนปัจจุบัน
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

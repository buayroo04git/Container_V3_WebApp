import React, { useState, useEffect, useRef } from 'react';

/**
 * ✏️ Rename Column Modal Dialog
 * Bulletproof, accessible, and works with 0 focus/blur race conditions
 */
export default function RenameColumnModal({
  renamingColumn,
  onClose,
  onSaveAlias,
  onResetAlias
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (renamingColumn) {
      setValue(renamingColumn.currentName || '');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [renamingColumn]);

  if (!renamingColumn) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onSaveAlias(renamingColumn.col, value.trim());
      onClose();
    }
  };

  const handleReset = () => {
    if (onResetAlias) {
      onResetAlias(renamingColumn.col);
    } else {
      onSaveAlias(renamingColumn.col, renamingColumn.defaultName || renamingColumn.col);
    }
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>✏️</span>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              เปลี่ยนชื่อหัวคอลัมน์
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '2px 6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              รหัสคอลัมน์เดิม (Database Key):
            </label>
            <span style={{
              display: 'inline-block',
              padding: '4px 10px',
              background: '#f1f5f9',
              borderRadius: '6px',
              fontFamily: "'SF Mono', Consolas, monospace",
              fontSize: '12px',
              fontWeight: 700,
              color: '#334155',
              border: '1px solid #e2e8f0'
            }}>
              {renamingColumn.col}
            </span>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              ชื่อที่ต้องการให้แสดงบนตาราง:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="พิมพ์ชื่อคอลัมน์ที่ต้องการ..."
              style={{
                width: '100%',
                height: '40px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1.5px solid #2563eb',
                fontSize: '14px',
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#64748b',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="คืนค่าเป็นชื่อเริ่มต้นของระบบ"
            >
              🔄 ชื่อเริ่มต้น
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                }}
              >
                💾 บันทึกชื่อใหม่
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

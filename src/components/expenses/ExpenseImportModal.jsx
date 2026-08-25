import React, { useState } from 'react';
import { truckExpenseService, EXPENSE_CATEGORIES } from '../../services/truckExpenseService';

/**
 * 📥 Modal สำหรับนำเข้าไฟล์ Excel ค่าใช้จ่ายรถ (Import Excel with Preview)
 */
export default function ExpenseImportModal({
  isOpen,
  onClose,
  onImportSuccess
}) {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrorMsg('');
    setParsing(true);

    try {
      const records = await truckExpenseService.parseExpenseExcelFile(selectedFile);
      setParsedData(records);
      if (records.length === 0) {
        setErrorMsg('ไม่พบข้อมูลรายการค่าใช้จ่ายในไฟล์ Excel หรือโครงสร้างชีทไม่ตรงกัน');
      }
    } catch (err) {
      console.error('Error parsing Excel file:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + (err.message || 'รูปแบบไฟล์ไม่ถูกต้อง'));
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.length === 0) return;

    try {
      setImporting(true);
      const res = await truckExpenseService.bulkInsertExpenses(parsedData);
      if (res.error) {
        throw new Error(res.error.message || 'บันทึกข้อมูลล้มเหลว');
      }
      onImportSuccess(res.count);
      onClose();
    } catch (err) {
      console.error('Import error:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการนำเข้า: ' + (err.message || 'โปรดลองใหม่อีกครั้ง'));
    } finally {
      setImporting(false);
    }
  };

  const totalAmount = parsedData.reduce((sum, r) => sum + (r.amount_total || 0), 0);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '920px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#1e293b' }}>
                นำเข้าข้อมูลค่าใช้จ่ายรถจาก Excel
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                รองรับไฟล์สมุดบัญชีรถรายเดือน (เช่น May-69_รถหัวลากรับ-จ่าย) ทุกชีทเบอร์รถอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '0.9rem'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Upload Area */}
          <div style={{
            border: '2px dashed #cbd5e1',
            borderRadius: '10px',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            background: file ? '#f0fdf4' : '#f8fafc',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="expense-excel-input"
            />
            <label htmlFor="expense-excel-input" style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                {file ? '📄' : '📊'}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>
                {file ? file.name : 'คลิกเพื่อเลือกไฟล์ Excel (.xlsx, .xls) หรือลากไฟล์มาวางที่นี่'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                ระบบจะตรวจหาชีทเบอร์รถ เช่น 39 506, 501 เต่า, รายจ่ายอื่นๆ และจัดหมวดหมู่อัตโนมัติ
              </div>
            </label>
          </div>

          {/* Preview Table */}
          {parsing && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              ⏳ กำลังอ่านและจัดจำแนกหมวดหมู่ข้อมูลจากทุกชีทในไฟล์...
            </div>
          )}

          {!parsing && parsedData.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                  📋 ตัวอย่างรายการที่พบ ({parsedData.length} รายการ | ยอดรวม {totalAmount.toLocaleString()} บาท)
                </span>
              </div>
              <div style={{
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>ชีท</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>วันที่</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>เบอร์รถ</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>หมวดหมู่</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>รายการ</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>ยอดเงิน (บาท)</th>
                      <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #cbd5e1' }}>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.map((row, idx) => {
                      const catStyle = EXPENSE_CATEGORIES[row.category] || EXPENSE_CATEGORIES.misc;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                          <td style={{ padding: '0.45rem 0.75rem', color: '#64748b' }}>{row.sheet_origin}</td>
                          <td style={{ padding: '0.45rem 0.75rem' }}>{row.expense_date}</td>
                          <td style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>
                            {row.truck_no === 'FLEET_SHARED' ? '🏢 กองกลาง' : `เบอร์ ${row.truck_no}`}
                          </td>
                          <td style={{ padding: '0.45rem 0.75rem' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: catStyle.bg,
                              color: catStyle.color,
                              border: `1px solid ${catStyle.border}`
                            }}>
                              <span>{catStyle.icon}</span>
                              <span>{catStyle.label}</span>
                            </span>
                          </td>
                          <td style={{ padding: '0.45rem 0.75rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.description}
                          </td>
                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                            {row.amount_total?.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.45rem 0.75rem', color: '#64748b' }}>
                            {row.remark || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          backgroundColor: '#f8fafc'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || parsedData.length === 0}
            style={{
              padding: '0.6rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: (importing || parsedData.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (importing || parsedData.length === 0) ? 0.6 : 1
            }}
          >
            {importing ? 'กำลังนำเข้าข้อมูล...' : `📥 ยืนยันนำเข้า (${parsedData.length} รายการ)`}
          </button>
        </div>
      </div>
    </div>
  );
}

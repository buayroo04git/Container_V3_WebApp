import React, { useState, useEffect } from 'react';

/**
 * 🏖️ LeaveModal: ฟอร์มเพิ่ม / แก้ไขประวัติการลางานของคนขับ
 */
export default function LeaveModal({
  isOpen,
  onClose,
  onSave,
  record = null,
  driverList = []
}) {
  const [formData, setFormData] = useState({
    driver_name: '',
    leave_type: 'personal',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    is_indefinite: true,
    expected_end_date: '',
    leave_reason: '',
    with_pay: 'unpaid',
    status: 'active_leave',
    approved_by: 'Admin',
    remark: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setFormData({
        driver_name: record.driver_name || '',
        leave_type: record.leave_type || 'personal',
        start_date: record.start_date || new Date().toISOString().slice(0, 10),
        end_date: record.end_date || '',
        is_indefinite: record.is_indefinite !== false,
        expected_end_date: record.expected_end_date || '',
        leave_reason: record.leave_reason && record.leave_reason !== '-' ? record.leave_reason : '',
        with_pay: record.with_pay || 'unpaid',
        status: record.status || 'active_leave',
        approved_by: record.approved_by && record.approved_by !== '-' ? record.approved_by : 'Admin',
        remark: record.remark && record.remark !== '-' ? record.remark : ''
      });
    } else {
      setFormData({
        driver_name: '',
        leave_type: 'personal',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: '',
        is_indefinite: true,
        expected_end_date: '',
        leave_reason: '',
        with_pay: 'unpaid',
        status: 'active_leave',
        approved_by: 'Admin',
        remark: ''
      });
    }
  }, [record, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.driver_name.trim()) {
      alert('กรุณาเลือกหรือระบุชื่อคนขับ');
      return;
    }
    if (!formData.start_date) {
      alert('กรุณาระบุวันที่เริ่มลา');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        end_date: formData.end_date || null,
        expected_end_date: formData.is_indefinite ? null : (formData.expected_end_date || null),
        status: formData.end_date ? 'completed' : 'active_leave'
      };
      await onSave(payload, record?.id);
      onClose();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🏖️</span>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
              {record ? 'แก้ไขใบลางานคนขับ' : 'เพิ่มบันทึกการลางานคนขับ'}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* แถวที่ 1: ชื่อคนขับ & ประเภทการลา */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ชื่อ-นามสกุล คนขับ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">-- เลือกคนขับ --</option>
                {(Array.isArray(driverList) ? driverList : []).map(d => (
                  <option key={d.id || d.driver_name} value={d.driver_name}>
                    {d.driver_name} {d.assigned_truck_no && d.assigned_truck_no !== '-' ? `(ประจำรถ ${d.assigned_truck_no})` : '(รถว่าง)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ประเภทการลา
              </label>
              <select
                value={formData.leave_type}
                onChange={e => setFormData({ ...formData, leave_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="personal">🟡 ลากิจส่วนตัว</option>
                <option value="sick">🩺 ลาป่วย</option>
                <option value="vacation">🏖️ ลาพักร้อนประจำปี</option>
                <option value="ordination">🙏 ลาบวช / ลาคลอด</option>
                <option value="unauthorized">⚠️ ขาดงาน / ไม่แจ้ง</option>
                <option value="suspended">⚪ พักงาน / รอสอบสวน</option>
                <option value="other">📝 อื่นๆ</option>
              </select>
            </div>
          </div>

          {/* แถวที่ 2: วันที่เริ่มลา & กำหนดกลับ / วันที่กลับจริง */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  📅 วันที่เริ่มลา <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    📅 วันที่คาดว่าจะกลับมา
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#64748b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_indefinite}
                      onChange={e => setFormData({ ...formData, is_indefinite: e.target.checked })}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span>ลาไม่มีกำหนด</span>
                  </label>
                </div>

                {!formData.is_indefinite && (
                  <input
                    type="date"
                    value={formData.expected_end_date}
                    onChange={e => setFormData({ ...formData, expected_end_date: e.target.value })}
                    min={formData.start_date}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>
            </div>

            {/* วันที่กลับมาทำงานจริง (กรณีสิ้นสุดการลาแล้ว) */}
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                📅 วันที่กลับมาทำงานจริง (ระบุเมื่อสิ้นสุดการลา)
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* แถวที่ 3: การจ่ายค่าจ้าง & ผู้อนุมัติ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                💵 การจ่ายค่าจ้าง
              </label>
              <select
                value={formData.with_pay}
                onChange={e => setFormData({ ...formData, with_pay: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="unpaid">❌ ไม่จ่ายค่าจ้าง (Unpaid)</option>
                <option value="paid">✅ จ่ายค่าจ้าง (Paid)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ✍️ ผู้อนุมัติ / ผู้บันทึก
              </label>
              <input
                type="text"
                value={formData.approved_by}
                onChange={e => setFormData({ ...formData, approved_by: e.target.value })}
                placeholder="เช่น ผู้จัดการฝ่ายจัดส่ง, Admin"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* เหตุผลการลา */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              📝 เหตุผลการลา / รายละเอียด
            </label>
            <textarea
              rows={2}
              value={formData.leave_reason}
              onChange={e => setFormData({ ...formData, leave_reason: e.target.value })}
              placeholder="เช่น กลับบ้านต่างจังหวัดเกี่ยวข้าว, มีไข้สูงไปพบแพทย์ที่ รพ."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          {/* หมายเหตุ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              📌 หมายเหตุเพิ่มเติม
            </label>
            <input
              type="text"
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              placeholder="เช่น มีใบรับรองแพทย์แนบ, แจ้งล่วงหน้า 3 วัน"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '14px',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
              }}
            >
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกใบลางาน'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

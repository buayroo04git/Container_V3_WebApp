import React, { useState, useEffect } from 'react';

/**
 * 🛠️ MaintenanceModal: ฟอร์มบันทึกประวัติการซ่อมบำรุงรถ (Maintenance Records Only)
 * ค่าใช้จ่ายจะถูกแยกไปบันทึกที่เมนูค่าใช้จ่ายรถโดยตรง
 */
export default function MaintenanceModal({
  isOpen,
  onClose,
  onSave,
  record = null,
  truckList = [],
  initialTruckNo = ''
}) {
  const [formData, setFormData] = useState({
    truck_no: '',
    maintenance_type: 'general',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    garage_name: '',
    mileage: '',
    invoice_no: '',
    status: 'completed',
    parts_list: '',
    performed_by: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setFormData({
        truck_no: record.truck_no || '',
        maintenance_type: record.maintenance_type || 'general',
        start_date: record.start_date || new Date().toISOString().slice(0, 10),
        end_date: record.end_date || record.start_date || new Date().toISOString().slice(0, 10),
        garage_name: record.garage_name && record.garage_name !== '-' ? record.garage_name : '',
        mileage: record.mileage && record.mileage > 0 ? String(record.mileage) : '',
        invoice_no: record.invoice_no && record.invoice_no !== '-' ? record.invoice_no : '',
        status: 'completed',
        parts_list: record.parts_list && record.parts_list !== '-' ? record.parts_list : '',
        performed_by: record.performed_by && record.performed_by !== '-' ? record.performed_by : '',
        remark: record.remark && record.remark !== '-' ? record.remark : ''
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFormData({
        truck_no: initialTruckNo || '',
        maintenance_type: 'general',
        start_date: today,
        end_date: today,
        garage_name: '',
        mileage: '',
        invoice_no: '',
        status: 'completed',
        parts_list: '',
        performed_by: '',
        remark: ''
      });
    }
  }, [record, isOpen, initialTruckNo]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.truck_no.trim()) {
      alert('กรุณาเลือกหรือระบุเบอร์รถ');
      return;
    }
    if (!formData.start_date) {
      alert('กรุณาระบุวันที่เข้าซ่อม');
      return;
    }

    setSaving(true);
    try {
      // คำนวณจำนวนวันซ่อม
      let duration = 1;
      if (formData.start_date && formData.end_date) {
        const d1 = new Date(formData.start_date);
        const d2 = new Date(formData.end_date);
        const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        duration = diff > 0 ? diff : 1;
      }

      const payload = {
        ...formData,
        start_date: formData.start_date,
        end_date: formData.end_date || formData.start_date,
        duration_days: duration,
        status: 'completed',
        mileage: Number(formData.mileage) || 0
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
            <span style={{ fontSize: '22px' }}>🔧</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                {record ? 'แก้ไขประวัติการซ่อมบำรุง' : 'บันทึกประวัติการซ่อมบำรุง'}
              </h3>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                สมุดบันทึกรายการซ่อม อะไหล่ และข้อมูลอู่
              </div>
            </div>
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
          
          {/* แถวที่ 1: เบอร์รถ & ประเภทการซ่อม */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เบอร์รถ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.truck_no}
                onChange={e => setFormData({ ...formData, truck_no: e.target.value })}
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
                <option value="">-- เลือกเบอร์รถ --</option>
                {(Array.isArray(truckList) ? truckList : []).map(t => (
                  <option key={t.id || t.truck_no} value={t.truck_no}>
                    รถ {t.truck_no} ({t.truck_license || 'ไม่มีป้าย'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ประเภทการซ่อมบำรุง
              </label>
              <select
                value={formData.maintenance_type}
                onChange={e => setFormData({ ...formData, maintenance_type: e.target.value })}
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
                <option value="general">🔧 ซ่อมทั่วไป / ปรับแต่ง</option>
                <option value="periodic">🛢️ เช็กระยะ / เปลี่ยนถ่ายของเหลว</option>
                <option value="tire">🛞 เปลี่ยนยาง / ปะยาง / สลับยาง</option>
                <option value="brake">🛑 ระบบเบรก / ลมเบรก</option>
                <option value="engine">⚙️ เครื่องยนต์ / ระบบเกียร์</option>
                <option value="suspension">🔩 ช่วงล่าง / เพลา / แหนบ</option>
                <option value="electrical">⚡ ระบบไฟ / ไดชาร์จ / แอร์</option>
                <option value="body">🚛 ตัวถัง / สี / อุปกรณ์พ่วง</option>
                <option value="inspection">📋 ตรวจสภาพ / พ.ร.บ. / ภาษี</option>
              </select>
            </div>
          </div>

          {/* แถวที่ 2: วันที่เข้าซ่อม & วันที่ซ่อมเสร็จ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                📅 วันที่เข้าซ่อม <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => {
                  const newStart = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    start_date: newStart,
                    // If end_date was before new start_date, auto advance end_date
                    end_date: prev.end_date < newStart ? newStart : prev.end_date
                  }));
                }}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                🏁 วันที่ซ่อมเสร็จ
              </label>
              <input
                type="date"
                value={formData.end_date}
                min={formData.start_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* แถวที่ 3: เลขไมล์ & อู่ / ศูนย์บริการ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                🔢 เลขไมล์ตอนเข้าซ่อม (กม.)
              </label>
              <input
                type="number"
                value={formData.mileage}
                onChange={e => setFormData({ ...formData, mileage: e.target.value })}
                placeholder="เช่น 125000"
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

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                🏢 ชื่ออู่ / ศูนย์บริการ / ช่างผู้ซ่อม
              </label>
              <input
                type="text"
                value={formData.garage_name}
                onChange={e => setFormData({ ...formData, garage_name: e.target.value })}
                placeholder="เช่น อู่สมบูรณ์การช่าง, ศูนย์ Isuzu"
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

          {/* แถวที่ 4: เลขที่บิล / ใบสั่งซ่อม */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              📄 เลขที่บิล / ใบสั่งซ่อม / เอกสารอ้างอิง (ถ้ามี)
            </label>
            <input
              type="text"
              value={formData.invoice_no}
              onChange={e => setFormData({ ...formData, invoice_no: e.target.value })}
              placeholder="เช่น INV-00123 หรือ WO-2026/08"
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

          {/* รายการอะไหล่ / งานที่ทำ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              ⚙️ รายการอะไหล่ / งานที่ทำ
            </label>
            <textarea
              rows={3}
              value={formData.parts_list}
              onChange={e => setFormData({ ...formData, parts_list: e.target.value })}
              placeholder="เช่น เปลี่ยนถ่ายน้ำมันเครื่อง 15W-40, เปลี่ยนไส้กรองน้ำมันเครื่อง, เปลี่ยนผ้าเบรกหน้า ซ้าย-ขวา"
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
              📝 หมายเหตุเพิ่มเติม
            </label>
            <input
              type="text"
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              placeholder="เช่น รับประกันงานซ่อม 3 เดือน, นัดตรวจเช็กระยะรอบถัดไป 150,000 กม."
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
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{saving ? 'กำลังบันทึก...' : '💾 บันทึกประวัติการซ่อม'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

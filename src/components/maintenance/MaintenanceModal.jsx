import React, { useState, useEffect } from 'react';

/**
 * 🛠️ MaintenanceModal: ฟอร์มบันทึกประวัติการซ่อมบำรุงและค่าใช้จ่ายรถ (Completed Records)
 * แยกเป็นอิสระจากสถานะการดำเนินงานของรถ
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
    garage_name: '',
    mileage: '',
    cost_parts: '',
    cost_labor: '',
    cost_total: '',
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
        garage_name: record.garage_name && record.garage_name !== '-' ? record.garage_name : '',
        mileage: record.mileage && record.mileage > 0 ? String(record.mileage) : '',
        cost_parts: record.cost_parts && record.cost_parts > 0 ? String(record.cost_parts) : '',
        cost_labor: record.cost_labor && record.cost_labor > 0 ? String(record.cost_labor) : '',
        cost_total: record.cost_total && record.cost_total > 0 ? String(record.cost_total) : '',
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
        garage_name: '',
        mileage: '',
        cost_parts: '',
        cost_labor: '',
        cost_total: '',
        invoice_no: '',
        status: 'completed',
        parts_list: '',
        performed_by: '',
        remark: ''
      });
    }
  }, [record, isOpen, initialTruckNo]);

  // Auto-calculate Total Cost (ค่าอะไหล่ + ค่าแรง = รวมเงิน)
  useEffect(() => {
    const p = parseFloat(formData.cost_parts) || 0;
    const l = parseFloat(formData.cost_labor) || 0;
    if (p > 0 || l > 0) {
      setFormData(prev => ({ ...prev, cost_total: String(p + l) }));
    }
  }, [formData.cost_parts, formData.cost_labor]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.truck_no.trim()) {
      alert('กรุณาเลือกหรือระบุเบอร์รถ');
      return;
    }
    if (!formData.start_date) {
      alert('กรุณาระบุวันที่ซ่อม / ทำรายการ');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        start_date: formData.start_date,
        end_date: formData.start_date,
        duration_days: 1,
        status: 'completed',
        cost_parts: Number(formData.cost_parts) || 0,
        cost_labor: Number(formData.cost_labor) || 0,
        cost_total: Number(formData.cost_total) || 0,
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
        maxWidth: '580px',
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
                {record ? 'แก้ไขประวัติการซ่อมบำรุง' : 'บันทึกประวัติการซ่อมบำรุง & ค่าใช้จ่าย'}
              </h3>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                สมุดบันทึกรายการซ่อม อะไหล่ ค่าใช้จ่าย และข้อมูลอู่
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

          {/* แถวที่ 2: วันที่ซ่อม & เลขไมล์ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                📅 วันที่ซ่อม / ทำรายการ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
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
          </div>

          {/* แถวที่ 3: อู่ / ศูนย์บริการ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              🏢 ชื่ออู่ / ศูนย์บริการ / ช่างผู้ซ่อม
            </label>
            <input
              type="text"
              value={formData.garage_name}
              onChange={e => setFormData({ ...formData, garage_name: e.target.value })}
              placeholder="เช่น อู่สมบูรณ์การช่าง, ศูนย์ Isuzu ชลบุรี, ปะยางข้างทาง"
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

          {/* แถวที่ 4: ค่าใช้จ่าย & ใบเสร็จ */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>
              💰 ค่าใช้จ่าย & ข้อมูลใบเสร็จ
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '3px' }}>
                  ค่าอะไหล่ (บาท)
                </label>
                <input
                  type="number"
                  value={formData.cost_parts}
                  onChange={e => setFormData({ ...formData, cost_parts: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    fontSize: '12.5px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '3px' }}>
                  ค่าแรงช่าง (บาท)
                </label>
                <input
                  type="number"
                  value={formData.cost_labor}
                  onChange={e => setFormData({ ...formData, cost_labor: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    fontSize: '12.5px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#15803d', marginBottom: '3px' }}>
                  ยอดรวมทั้งหมด (บาท)
                </label>
                <input
                  type="number"
                  value={formData.cost_total}
                  onChange={e => setFormData({ ...formData, cost_total: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#15803d',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '3px' }}>
                  เลขที่บิล / Invoice
                </label>
                <input
                  type="text"
                  value={formData.invoice_no}
                  onChange={e => setFormData({ ...formData, invoice_no: e.target.value })}
                  placeholder="INV-..."
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    fontSize: '12.5px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          {/* รายการอะไหล่ / งานที่ทำ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              ⚙️ รายการอะไหล่ / งานที่ทำ
            </label>
            <textarea
              rows={2}
              value={formData.parts_list}
              onChange={e => setFormData({ ...formData, parts_list: e.target.value })}
              placeholder="เช่น เปลี่ยนถ่ายน้ำมันเครื่อง 15W-40, กรองน้ำมันเครื่อง, เปลี่ยนผ้าเบรกหน้า"
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
              placeholder="เช่น รับประกันงานซ่อม 3 เดือน, นัดเช็กระยะครั้งต่อไป 150,000 กม."
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

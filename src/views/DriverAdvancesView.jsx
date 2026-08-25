import React, { useState, useEffect, useMemo, useCallback } from 'react';
import driverAdvanceService from '../services/driverAdvanceService.js';
import { fetchDrivers } from '../services/truckDriverService.js';
import DriverAdvanceModal from '../components/payroll/DriverAdvanceModal.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import * as XLSX from 'xlsx';

export default function DriverAdvancesView() {
  const [advances, setAdvances] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [categoryFilter, setCategoryFilter] = useState('all'); // all, single_advance, installment_loan
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, settled
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [lightboxSlipUrl, setLightboxSlipUrl] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [advancesData, driversData] = await Promise.all([
        driverAdvanceService.fetchAdvances(),
        fetchDrivers()
      ]);
      setAdvances(advancesData || []);
      setDrivers(driversData || []);
    } catch (err) {
      console.error('load advances error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // กรองข้อมูล
  const filteredAdvances = useMemo(() => {
    return advances.filter(item => {
      // 1. หมวดหมู่
      if (categoryFilter !== 'all') {
        const cat = item.category || 'single_advance';
        if (cat !== categoryFilter) return false;
      }

      // 2. สถานะ
      if (statusFilter !== 'all') {
        if (item.status !== statusFilter) return false;
      }

      // 3. ค้นหา
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const dName = (item.driver_name || '').toLowerCase();
        const tNo = (item.assigned_truck_no || '').toLowerCase();
        const remark = (item.remark || '').toLowerCase();
        if (!dName.includes(q) && !tNo.includes(q) && !remark.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [advances, categoryFilter, statusFilter, searchQuery]);

  // คำนวณยอดรวม KPIs
  const kpis = useMemo(() => {
    let totalAdvanceAmount = 0;
    let totalPendingAmount = 0;
    let totalRemainingLoans = 0;
    let totalSingleAdvances = 0;
    let totalInstallmentLoans = 0;

    advances.forEach(adv => {
      const amt = Number(adv.amount) || 0;
      const cat = adv.category || 'single_advance';
      const remaining = Number(adv.remaining_amount) || 0;

      totalAdvanceAmount += amt;
      if (adv.status === 'pending') {
        totalPendingAmount += amt;
      }

      if (cat === 'installment_loan') {
        totalInstallmentLoans += amt;
        totalRemainingLoans += remaining;
      } else {
        totalSingleAdvances += amt;
      }
    });

    return {
      totalAdvanceAmount,
      totalPendingAmount,
      totalRemainingLoans,
      totalSingleAdvances,
      totalInstallmentLoans,
      count: filteredAdvances.length
    };
  }, [advances, filteredAdvances]);

  const handleSaveAdvance = async (formData) => {
    const res = await driverAdvanceService.saveAdvance(formData);
    if (res.data) {
      await loadData();
      setIsModalOpen(false);
      setEditingAdvance(null);
    } else {
      alert('บันทึกไม่สำเร็จ: ' + (res.error?.message || 'เกิดข้อผิดพลาด'));
    }
  };

  const handleDeleteAdvance = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการเบิกนี้?')) return;
    const res = await driverAdvanceService.deleteAdvance(id);
    if (res.success) {
      await loadData();
    } else {
      alert('ลบไม่สำเร็จ: ' + (res.error?.message || 'เกิดข้อผิดพลาด'));
    }
  };

  const handleExportExcel = () => {
    const rows = filteredAdvances.map((a, idx) => ({
      'ลำดับ': idx + 1,
      'วันที่เบิก': a.advance_date,
      'ชื่อคนขับ': a.driver_name,
      'เบอร์รถ': a.assigned_truck_no || '-',
      'รูปแบบ': a.category === 'installment_loan' ? 'เงินยืมผ่อนชำระ' : 'เบิกล่วงหน้างวดเดียว',
      'จำนวนเงิน (บาท)': Number(a.amount) || 0,
      'ยอดคงเหลือ (บาท)': a.category === 'installment_loan' ? (Number(a.remaining_amount) || 0) : '-',
      'งวดผ่อน': a.category === 'installment_loan' ? `${a.installments_paid || 0}/${a.installments_total || 1}` : '-',
      'งวดเริ่มหัก': a.start_period || '-',
      'สถานะ': a.status === 'settled' ? 'หักชำระแล้ว' : 'รอหักชำระ',
      'หมายเหตุ': a.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Driver_Advances');
    XLSX.writeFile(wb, `Driver_Advances_Report_${selectedMonth}.xlsx`);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 🏷️ Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#ffffff',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>💸</span>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              บัญชีเบิกล่วงหน้า & เงินกู้ยืมคนขับ (Driver Advances & Loans Ledger)
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            บันทึกการเบิกค่าเที่ยว เบิกเงินล่วงหน้า และสัญญาเงินยืมก้อนผ่อนชำระพร้อมแนบสลิปโอนเงิน
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer'
            }}
          >
            📥 ส่งออก Excel
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingAdvance(null);
              setIsModalOpen(true);
            }}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
            }}
          >
            ➕ บันทึกเบิกเงิน / เงินกู้ใหม่
          </button>
        </div>
      </div>

      {/* 🌟 KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <KpiCard
          icon="💸"
          title="ยอดเบิกล่วงหน้ารวมทั้งหมด"
          value={`฿${kpis.totalAdvanceAmount.toLocaleString()}`}
          subtext={`เบิกงวดเดียว: ฿${kpis.totalSingleAdvances.toLocaleString()}`}
          color="blue"
        />
        <KpiCard
          icon="⏳"
          title="ยอดรอหักชำระ (Pending)"
          value={`฿${kpis.totalPendingAmount.toLocaleString()}`}
          subtext="รอหักในรอบตัดจ่ายเงินเดือน"
          color="orange"
        />
        <KpiCard
          icon="🏦"
          title="ยอดหนี้เงินกู้คงค้าง (Remaining Loans)"
          value={`฿${kpis.totalRemainingLoans.toLocaleString()}`}
          subtext={`จากยอดกู้รวม: ฿${kpis.totalInstallmentLoans.toLocaleString()}`}
          color="red"
        />
      </div>

      {/* 📋 Filter and Data Table */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        
        {/* Filter Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Search */}
          <div style={{ minWidth: '260px' }}>
            <input
              type="text"
              placeholder="🔍 ค้นหาคนขับ, เบอร์รถ, หมายเหตุ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'single_advance', label: '💸 เบิกล่วงหน้า (งวดเดียว)' },
              { id: 'installment_loan', label: '🏦 เงินยืมผ่อนชำระ' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: categoryFilter === tab.id ? '#ffffff' : 'transparent',
                  color: categoryFilter === tab.id ? '#0f172a' : '#64748b',
                  fontWeight: categoryFilter === tab.id ? 700 : 500,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  boxShadow: categoryFilter === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>สถานะ:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#334155'
              }}
            >
              <option value="all">ทั้งหมด</option>
              <option value="pending">⏳ รอหักชำระ (Pending)</option>
              <option value="settled">🟢 หักชำระแล้ว (Settled)</option>
            </select>
          </div>

        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังโหลดข้อมูลบัญชีเบิก...</div>
        ) : filteredAdvances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
            ไม่พบรายการเบิกเงินตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>วันที่เบิก</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>ชื่อคนขับ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>เบอร์รถ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>รูปแบบ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงิน</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ยอดคงเหลือ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>งวดผ่อน</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>งวดเริ่มหัก</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>สลิป</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map((adv, idx) => {
                  const isLoan = adv.category === 'installment_loan';
                  const isPending = adv.status === 'pending';
                  const hasSlip = adv.slip_url && adv.slip_url !== '-';

                  return (
                    <tr key={adv.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', color: '#475569', fontWeight: 600 }}>{adv.advance_date}</td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e40af' }}>{adv.driver_name}</td>
                      <td style={{ padding: '12px', color: '#334155' }}>🚛 {adv.assigned_truck_no || '-'}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isLoan ? '#eff6ff' : '#f8fafc',
                          color: isLoan ? '#1e40af' : '#475569',
                          fontWeight: 700,
                          fontSize: '11.5px'
                        }}>
                          {isLoan ? '🏦 เงินยืมผ่อนชำระ' : '💸 เบิกล่วงหน้า'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: '14px' }}>
                        ฿{Number(adv.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                        {isLoan ? `฿${Number(adv.remaining_amount || 0).toLocaleString()}` : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
                        {isLoan ? `${adv.installments_paid || 0} / ${adv.installments_total || 1} งวด` : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                        {adv.start_period || '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {hasSlip ? (
                          <button
                            type="button"
                            onClick={() => setLightboxSlipUrl(adv.slip_url)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid #93c5fd',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🖼️ ดูสลิป
                          </button>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isPending ? '#fef3c7' : '#dcfce7',
                          color: isPending ? '#b45309' : '#15803d',
                          fontWeight: 700,
                          fontSize: '11px'
                        }}>
                          {isPending ? '⏳ รอหักชำระ' : '🟢 หักแล้ว'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAdvance(adv);
                              setIsModalOpen(true);
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              color: '#2563eb',
                              fontWeight: 600,
                              fontSize: '11.5px',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdvance(adv.id)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#dc2626',
                              fontWeight: 600,
                              fontSize: '11.5px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal บันทึก / แก้ไขยอดเบิก */}
      <DriverAdvanceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAdvance(null);
        }}
        onSave={handleSaveAdvance}
        advance={editingAdvance}
        driverList={drivers}
      />

      {/* Lightbox สำหรับดูรูปสลิป */}
      {lightboxSlipUrl && (
        <div
          onClick={() => setLightboxSlipUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            cursor: 'pointer'
          }}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#fff', padding: '10px', borderRadius: '12px' }}>
            <img
              src={lightboxSlipUrl}
              alt="Slip Receipt"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>คลิกที่ใดก็ได้เพื่อปิด</div>
          </div>
        </div>
      )}

    </div>
  );
}

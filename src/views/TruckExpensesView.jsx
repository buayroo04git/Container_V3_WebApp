import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { truckExpenseService, EXPENSE_CATEGORIES } from '../services/truckExpenseService';
import { fetchTrucks, fetchDrivers } from '../services/truckDriverService';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import KpiCard from '../components/ui/KpiCard';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import MonthPicker from '../components/ui/MonthPicker';
import ExpenseModal from '../components/expenses/ExpenseModal';
import ExpenseImportModal from '../components/expenses/ExpenseImportModal';

// =========================================================================
// 🎛️ Column Schema Specifications for Truck Expenses
// =========================================================================
const DEFAULT_EXPENSE_COLUMNS = [
  'index',
  'expense_date',
  'truck_no',
  'driver_name',
  'category',
  'description',
  'amount_total',
  'vat_amount',
  'invoice_no',
  'remark',
  'actions'
];

const DEFAULT_EXPENSE_NAMES = {
  index: '#',
  expense_date: '📅 วันที่',
  truck_no: '🚛 เบอร์รถ',
  driver_name: '👤 คนขับ',
  category: '🏷️ หมวดหมู่ค่าใช้จ่าย',
  description: '📝 รายการค่าใช้จ่าย',
  amount_total: '💰 จำนวนเงิน',
  vat_amount: '📑 VAT (บาท)',
  invoice_no: '📄 เลขที่บิล',
  remark: '💬 หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_EXPENSE_WIDTHS = {
  index: 45,
  expense_date: 105,
  truck_no: 95,
  driver_name: 130,
  category: 140,
  description: 210,
  amount_total: 115,
  vat_amount: 95,
  invoice_no: 100,
  remark: 140,
  actions: 110
};

const EXPENSE_ALIGN_MAP = {
  index: 'center',
  expense_date: 'center',
  truck_no: 'center',
  driver_name: 'left',
  category: 'center',
  description: 'left',
  amount_goods: 'right',
  amount_labor: 'right',
  amount_total: 'right',
  vat_amount: 'right',
  trip_count: 'right',
  cost_per_trip: 'right',
  vendor_name: 'left',
  invoice_no: 'left',
  remark: 'left',
  actions: 'center'
};

export default function TruckExpensesView() {
  const [expenses, setExpenses] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [truckFilter, setTruckFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 🎛️ Column Preferences Hook
  const expensePrefs = useColumnPreferences({
    storageKeyPrefix: 'truck_expenses_v1',
    rawColumns: DEFAULT_EXPENSE_COLUMNS,
    defaultNames: DEFAULT_EXPENSE_NAMES,
    defaultWidths: DEFAULT_EXPENSE_WIDTHS,
    sampleRecords: expenses
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Load initial data
  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const [year, month] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      const [expRes, trucksRes, driversRes] = await Promise.all([
        truckExpenseService.fetchExpenses({
          dateFrom: startOfMonth,
          dateTo: endOfMonth,
          truckNo: truckFilter,
          category: categoryFilter,
          searchQuery
        }),
        fetchTrucks(),
        fetchDrivers()
      ]);

      if (expRes?.data) setExpenses(expRes.data);
      if (trucksRes) {
        setTrucks(Array.isArray(trucksRes) ? trucksRes : (trucksRes.data || []));
      }
      if (driversRes) {
        setDrivers(Array.isArray(driversRes) ? driversRes : (driversRes.data || []));
      }
    } catch (err) {
      console.error('Failed to load truck expenses:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, truckFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save
  const handleSaveExpense = async (recordData) => {
    const res = await truckExpenseService.saveExpense(recordData);
    if (res.error) {
      throw new Error(res.error.message || 'บันทึกข้อมูลล้มเหลว');
    }
    showToast(recordData.id ? '✅ แก้ไขรายการเรียบร้อยแล้ว' : '✅ บันทึกรายการใหม่เรียบร้อยแล้ว');
    loadData(true);
  };

  // Handle Delete
  const handleDeleteExpense = async (record) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ "${record.description}" (${record.amount_total?.toLocaleString()} บาท)?`)) {
      return;
    }
    const res = await truckExpenseService.deleteExpense(record.id);
    if (res.error) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + res.error.message);
      return;
    }
    showToast('🗑️ ลบรายการเรียบร้อยแล้ว');
    loadData(true);
  };

  // Handle Clear All
  const handleClearAllExpenses = async () => {
    if (!window.confirm('⚠️ คำเตือน: คุณต้องการลบรายการค่าใช้จ่ายทั้งหมดในระบบใช่หรือไม่?\n\nข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้ เหมาะสำหรับใช้ล้างข้อมูลเพื่อทดสอบนำเข้าใหม่อีกครั้ง')) {
      return;
    }
    const doubleConfirm = window.prompt('พิมพ์คำว่า "DELETE" เพื่อยืนยันการล้างข้อมูลทั้งหมด:');
    if (doubleConfirm !== 'DELETE' && doubleConfirm !== 'delete') {
      alert('ยกเลิกการล้างข้อมูล');
      return;
    }

    try {
      setLoading(true);
      await truckExpenseService.clearAllExpenses();
      setExpenses([]);
      showToast('🗑️ ล้างข้อมูลค่าใช้จ่ายทั้งหมดเรียบร้อยแล้ว');
      loadData(true);
    } catch (err) {
      console.error('Clear all error:', err);
      alert('เกิดข้อผิดพลาดในการล้างข้อมูล: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Export
  const handleExportExcel = () => {
    try {
      truckExpenseService.exportToExcel(expenses, `ค่าใช้จ่ายรถ_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('📥 ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
    } catch (err) {
      console.error('Export error:', err);
      alert('เกิดข้อผิดพลาดในการส่งออก Excel: ' + err.message);
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    let totalExpense = 0;
    let fuelTotal = 0;
    let maintenanceTotal = 0;
    let tollPortTotal = 0;
    let installmentTotal = 0;

    expenses.forEach(r => {
      const tot = Number(r.amount_total || 0);
      totalExpense += tot;

      if (r.category === 'fuel') {
        fuelTotal += tot;
      } else if (r.category === 'maintenance') {
        maintenanceTotal += tot;
      } else if (r.category === 'toll_port') {
        tollPortTotal += tot;
      } else if (r.category === 'installment') {
        installmentTotal += tot;
      }
    });

    return {
      totalExpense,
      fuelTotal,
      maintenanceTotal,
      tollPortTotal,
      installmentTotal,
      count: expenses.length
    };
  }, [expenses]);

  // Sort and filter records using preferences hook
  const sortedExpenses = useMemo(() => {
    if (expensePrefs.sortRecords) {
      return expensePrefs.sortRecords(expenses);
    }
    return expenses;
  }, [expenses, expensePrefs]);

  // Render Cell Content
  const renderExpenseCell = (col, row, idx) => {
    const catStyle = EXPENSE_CATEGORIES[row.category] || EXPENSE_CATEGORIES.misc;

    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{idx + 1}</span>;

      case 'expense_date':
        return <span style={{ fontSize: '12px', color: '#334155' }}>{row.expense_date || '-'}</span>;

      case 'truck_no':
        if (row.truck_no === 'FLEET_SHARED') {
          return (
            <span style={{
              padding: '2px 8px',
              borderRadius: '6px',
              background: '#f1f5f9',
              color: '#475569',
              fontSize: '11.5px',
              fontWeight: 700
            }}>
              🏢 กองกลาง
            </span>
          );
        }
        return (
          <span style={{
            fontWeight: 800,
            fontSize: '13px',
            color: '#1e40af',
            background: '#eff6ff',
            padding: '2px 8px',
            borderRadius: '6px'
          }}>
            {row.truck_no}
          </span>
        );

      case 'driver_name':
        return <span style={{ fontWeight: 600, color: '#1e293b' }}>{row.driver_name || '-'}</span>;

      case 'category':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11.5px',
            fontWeight: 700,
            backgroundColor: catStyle.bg,
            color: catStyle.color,
            border: `1px solid ${catStyle.border}`
          }}>
            <span>{catStyle.icon}</span>
            <span>{catStyle.label}</span>
          </span>
        );

      case 'description':
        return <span style={{ fontWeight: 600, color: '#0f172a' }}>{row.description || '-'}</span>;

      case 'amount_total':
        return (
          <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e40af' }}>
            ฿{Number(row.amount_total || (Number(row.amount_goods || 0) + Number(row.amount_labor || 0))).toLocaleString()}
          </span>
        );

      case 'vat_amount':
        if (Number(row.vat_amount || 0) > 0) {
          return <span style={{ color: '#0369a1', fontWeight: 600 }}>฿{Number(row.vat_amount).toLocaleString()}</span>;
        }
        if (row.has_vat) {
          const calcVat = Number(((Number(row.amount_total || 0) * 7) / 107).toFixed(2));
          return <span style={{ color: '#0369a1', fontSize: '11.5px' }}>7% (฿{calcVat.toLocaleString()})</span>;
        }
        return <span style={{ color: '#cbd5e1' }}>-</span>;

      case 'invoice_no':
        return <span style={{ color: '#64748b', fontSize: '11.5px', fontFamily: 'monospace' }}>{row.invoice_no && row.invoice_no !== '-' ? row.invoice_no : '-'}</span>;

      case 'remark':
        return <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>{row.remark && row.remark !== '-' ? row.remark : '-'}</span>;

      case 'actions':
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => {
                setEditingRecord(row);
                setModalOpen(true);
              }}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              ✏️ แก้ไข
            </button>
            <button
              type="button"
              onClick={() => handleDeleteExpense(row)}
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '11px',
                color: '#dc2626',
                cursor: 'pointer'
              }}
            >
              🗑️
            </button>
          </div>
        );

      default:
        return String(row[col] || '-');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#f8fafc',
      padding: '1.25rem 1.5rem',
      gap: '1rem',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#0f172a',
          color: '#ffffff',
          padding: '0.65rem 1.25rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '0.9rem',
          fontWeight: 500
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>💰</span> บันทึกค่าใช้จ่ายรถ & ค่าน้ำมัน
          </h2>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            ตารางรวมค่าใช้จ่ายรถ ค่าน้ำมัน ซ่อมบำรุง ค่าผ่านท่า ค่างวดรถ และค่าใช้จ่ายกองกลาง
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            📥 นำเข้า Excel
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            📊 ส่งออก Excel
          </button>

          <button
            type="button"
            onClick={handleClearAllExpenses}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #fecaca',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(220, 38, 38, 0.05)'
            }}
            title="ล้างข้อมูลค่าใช้จ่ายทั้งหมดในระบบเพื่อทดสอบนำเข้าใหม่"
          >
            🗑️ ล้างข้อมูลทั้งหมด
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingRecord(null);
              setModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
          >
            ➕ บันทึกค่าใช้จ่าย
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.75rem',
        flexShrink: 0
      }}>
        <KpiCard
          title="💰 รวมค่าใช้จ่ายทั้งหมด"
          value={`฿${kpis.totalExpense.toLocaleString()}`}
          subtext={`ทั้งหมด ${kpis.count.toLocaleString()} รายการ`}
          theme="blue"
        />
        <KpiCard
          title="⛽ ค่าน้ำมันรวม"
          value={`฿${kpis.fuelTotal.toLocaleString()}`}
          subtext="รวมค่าน้ำมันทั้งหมด"
          theme="blue"
        />
        <KpiCard
          title="🔧 ซ่อมบำรุง & อะไหล่"
          value={`฿${kpis.maintenanceTotal.toLocaleString()}`}
          subtext="ค่าของ + ค่าแรงช่าง"
          theme="amber"
        />
        <KpiCard
          title="🛣️ ค่าผ่านทาง / ผ่านท่า"
          value={`฿${kpis.tollPortTotal.toLocaleString()}`}
          subtext="ผ่านท่า & ทางด่วน"
          theme="emerald"
        />
        <KpiCard
          title="💳 ค่างวดรถ & ผ่อนหาง"
          value={`฿${kpis.installmentTotal.toLocaleString()}`}
          subtext="ผ่อนชำระประจำงวด"
          theme="purple"
        />
      </div>

      {/* Filters & Column Tools Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        padding: '0.65rem 1rem',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        flexWrap: 'wrap',
        gap: '0.65rem',
        flexShrink: 0
      }}>
        {/* Left side filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Month Picker filter */}
          <MonthPicker
            value={selectedMonth}
            onChange={(newMonth) => setSelectedMonth(newMonth)}
            label="งวดเดือน:"
          />

          {/* Truck filter */}
          <select
            value={truckFilter}
            onChange={e => setTruckFilter(e.target.value)}
            style={{
              padding: '0.35rem 0.6rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.85rem',
              background: '#ffffff'
            }}
          >
            <option value="ALL">🚛 รถทุกคัน / กองกลาง</option>
            <option value="FLEET_SHARED">🏢 กองกลาง (Shared)</option>
            {(Array.isArray(trucks) ? trucks : []).map(t => (
              <option key={t.truck_no} value={t.truck_no}>
                เบอร์ {t.truck_no} ({t.truck_license || '-'})
              </option>
            ))}
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              padding: '0.35rem 0.6rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.85rem',
              background: '#ffffff'
            }}
          >
            <option value="ALL">🏷️ ทุกหมวดหมู่</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([key, info]) => (
              <option key={key} value={key}>
                {info.icon} {info.label}
              </option>
            ))}
          </select>

          {/* Search box */}
          <input
            type="text"
            placeholder="🔍 ค้นหา (เบอร์รถ, คนขับ, รายการ, อู่, บิล)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.85rem',
              minWidth: '220px'
            }}
          />
        </div>

        {/* Right side tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ColumnVisibilityDropdown preferences={expensePrefs} />
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {refreshing ? '⏳...' : '🔄 รีเฟรช'}
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <UniversalTableContainer preferences={expensePrefs}>
        <UniversalTableHeader
          preferences={expensePrefs}
          data={sortedExpenses}
          alignMap={EXPENSE_ALIGN_MAP}
          defaultWidths={DEFAULT_EXPENSE_WIDTHS}
        />
        <tbody>
          {sortedExpenses.map((row, idx) => (
            <tr
              key={row.id || idx}
              style={{
                borderBottom: '1px solid #f1f5f9',
                background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
              }}
            >
              {expensePrefs.activeColumns.map(col => (
                <td
                  key={col}
                  style={{
                    padding: '8px 10px',
                    textAlign: EXPENSE_ALIGN_MAP[col] || 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {renderExpenseCell(col, row, idx)}
                </td>
              ))}
            </tr>
          ))}

          {sortedExpenses.length === 0 && (
            <tr>
              <td
                colSpan={expensePrefs.activeColumns.length || 15}
                style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}
              >
                {loading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบรายการค่าใช้จ่าย (คลิก "บันทึกค่าใช้จ่าย" หรือ "นำเข้า Excel" เพื่อเริ่มต้น)'}
              </td>
            </tr>
          )}
        </tbody>
      </UniversalTableContainer>

      {/* Expense Modal (Add / Edit) */}
      <ExpenseModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRecord(null);
        }}
        onSave={handleSaveExpense}
        record={editingRecord}
        truckList={trucks}
        driverList={drivers}
      />

      {/* Excel Import Modal */}
      <ExpenseImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={(count) => {
          showToast(`🎉 นำเข้าข้อมูลสำเร็จ ${count} รายการ!`);
          loadData(true);
        }}
      />
    </div>
  );
}

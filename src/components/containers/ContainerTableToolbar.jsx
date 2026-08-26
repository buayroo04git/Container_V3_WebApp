import React from 'react';
import ColumnVisibilityDropdown from '../ui/ColumnVisibilityDropdown';
import MonthPicker from '../ui/MonthPicker';

/**
 * 🛠️ Top Header Action Bar for Containers Master DB
 */
export function ContainerHeaderActions({
  loading,
  filteredCount,
  onAutoReMatch,
  onRefresh,
  onExportExcel,
  onImportClick,
  onClearDB
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📦 Containers (ใบวางบิล)
        </h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          จัดการฐานข้อมูลใบวางบิลและตรวจสอบผลกระทบยอดกับใบงานจริง (Reconciliation)
        </p>
      </div>

      {/* Action Button Bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* ⚡ Auto Re-Match */}
        <button 
          onClick={onAutoReMatch}
          disabled={loading}
          style={{ 
            height: '38px',
            padding: '0 14px',
            borderRadius: '8px',
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            color: '#15803d',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease'
          }}
          title="ตรวจเทียบตู้ที่ยังไม่พบกับใบวางบิล และปรับเป็นสีเขียวอัตโนมัติ"
        >
          <span>⚡</span>
          <span>Auto Re-Match</span>
        </button>

        {/* 🔄 Refresh */}
        <button 
          onClick={onRefresh} 
          disabled={loading}
          style={{ 
            height: '38px',
            padding: '0 14px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease'
          }}
        >
          <span>🔄</span>
          <span>รีเฟรช</span>
        </button>

        {/* 📥 Export */}
        <button
          onClick={onExportExcel}
          disabled={loading || filteredCount === 0}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#1e293b',
            fontSize: '13px',
            fontWeight: 600,
            cursor: (loading || filteredCount === 0) ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease'
          }}
          title="ส่งออกรายการตามที่ฟิลเตอร์และจัดเรียงอยู่จริงเป็นไฟล์ Excel"
        >
          <span>📥</span>
          <span>Export Excel</span>
        </button>

        {/* 📂 Import Master Folder */}
        <button 
          onClick={onImportClick}
          disabled={loading}
          style={{ 
            height: '38px',
            padding: '0 16px',
            borderRadius: '8px',
            border: '1px solid #1d4ed8',
            background: '#2563eb',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.15s ease'
          }} 
        >
          <span>📂</span>
          <span>Import ใบวางบิล (เลือกโฟลเดอร์)</span>
        </button>

        {/* 🗑️ Clear Master DB */}
        <button 
          onClick={onClearDB}
          disabled={loading}
          style={{ 
            height: '38px',
            padding: '0 12px',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#dc2626',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }} 
          title="ลบข้อมูลใบวางบิลทั้งหมด"
        >
          <span>🗑️ ล้างใบวางบิล</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 🔍 Filter Toolbar placed directly inside the Data Table Card
 */
export function ContainerTableFilterBar({
  currentTab,
  filteredCount,
  selectedMonth = 'ALL',
  setSelectedMonth,
  availableBatches = [],
  selectedBatchFilter = 'ALL',
  setSelectedBatchFilter,
  availableSources = [],
  selectedSourceFilter = 'ALL',
  setSelectedSourceFilter,
  availableTrucks = [],
  selectedTruckFilter = 'ALL',
  setSelectedTruckFilter,
  selectedJobTypeFilter = 'ALL',
  setSelectedJobTypeFilter,
  availablePorts = [],
  selectedPortFilter = 'ALL',
  setSelectedPortFilter,
  availableSizes = [],
  selectedSizeFilter = 'ALL',
  setSelectedSizeFilter,
  searchTerm,
  setSearchTerm,
  showColumnMenu,
  setShowColumnMenu,
  menuRef,
  allColumns,
  activeColumns,
  visibleColumns,
  onToggleColumnVisibility,
  getColDisplayName,
  onStartEditAlias,
  onResetAllAliases,
  onShowAllColumns
}) {
  const hasActiveFilters = 
    selectedMonth !== 'ALL' ||
    selectedBatchFilter !== 'ALL' || 
    selectedSourceFilter !== 'ALL' || 
    selectedTruckFilter !== 'ALL' || 
    selectedJobTypeFilter !== 'ALL' || 
    selectedPortFilter !== 'ALL' || 
    selectedSizeFilter !== 'ALL' || 
    searchTerm.trim() !== '';

  const handleResetFilters = () => {
    if (setSelectedMonth) setSelectedMonth('ALL');
    setSelectedBatchFilter('ALL');
    setSelectedSourceFilter('ALL');
    if (setSelectedTruckFilter) setSelectedTruckFilter('ALL');
    if (setSelectedJobTypeFilter) setSelectedJobTypeFilter('ALL');
    if (setSelectedPortFilter) setSelectedPortFilter('ALL');
    if (setSelectedSizeFilter) setSelectedSizeFilter('ALL');
    setSearchTerm('');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
      
      {/* Category Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
          {currentTab === 'all' && '📋 รายการตู้ทั้งหมด (ใบวางบิล)'}
          {currentTab === 'matched' && '🟢 ตู้ที่ตรงกับใบงาน (Matched)'}
          {currentTab === 'unmatched' && '🔴 ตู้ที่ไม่พบในใบวางบิล (Unmatched)'}
          {currentTab === 'missing' && '⚠️ ตู้ที่ยังไม่ถูกสแกน (Missing)'}
        </span>
        <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
          {filteredCount.toLocaleString()} รายการ
        </span>
      </div>

      {/* Filter Controls Bar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
        
        {/* 📅 Month Filter */}
        {setSelectedMonth && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <MonthPicker
              value={selectedMonth === 'ALL' ? '' : selectedMonth}
              onChange={(newMonth) => setSelectedMonth(newMonth)}
              label="งวด:"
            />
            {selectedMonth !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                style={{
                  height: '35px',
                  padding: '0 8px',
                  borderRadius: '7px',
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#2563eb',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="ดูทุกงวดเดือน"
              >
                ทุกงวด
              </button>
            )}
          </div>
        )}
        
        {/* 1. Batch Filter Dropdown */}
        {availableBatches.length > 0 && (
          <select
            value={selectedBatchFilter}
            onChange={(e) => setSelectedBatchFilter(e.target.value)}
            style={{
              height: '35px',
              padding: '0 8px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: selectedBatchFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              color: selectedBatchFilter !== 'ALL' ? '#2563eb' : '#334155',
              fontSize: '12px',
              fontWeight: selectedBatchFilter !== 'ALL' ? 700 : 500,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">📁 รอบงาน (Batch)</option>
            {availableBatches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        {/* 2. Truck Filter Dropdown */}
        {availableTrucks.length > 0 && (
          <select
            value={selectedTruckFilter}
            onChange={(e) => setSelectedTruckFilter && setSelectedTruckFilter(e.target.value)}
            style={{
              height: '35px',
              padding: '0 8px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: selectedTruckFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              color: selectedTruckFilter !== 'ALL' ? '#2563eb' : '#334155',
              fontSize: '12px',
              fontWeight: selectedTruckFilter !== 'ALL' ? 700 : 500,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">🚚 เบอร์รถ</option>
            {availableTrucks.map(t => (
              <option key={t} value={t}>รถ {t}</option>
            ))}
          </select>
        )}

        {/* 3. Job Type Filter (DIS / LOAD) */}
        <select
          value={selectedJobTypeFilter}
          onChange={(e) => setSelectedJobTypeFilter && setSelectedJobTypeFilter(e.target.value)}
          style={{
            height: '35px',
            padding: '0 8px',
            borderRadius: '7px',
            border: '1px solid #cbd5e1',
            background: selectedJobTypeFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
            color: selectedJobTypeFilter !== 'ALL' ? '#2563eb' : '#334155',
            fontSize: '12px',
            fontWeight: selectedJobTypeFilter !== 'ALL' ? 700 : 500,
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="ALL">🏷️ ประเภท (DIS/LOAD)</option>
          <option value="DIS">📥 DIS (Discharge)</option>
          <option value="LOAD">📤 LOAD</option>
        </select>

        {/* 4. Port Filter Dropdown */}
        {availablePorts.length > 0 && (
          <select
            value={selectedPortFilter}
            onChange={(e) => setSelectedPortFilter && setSelectedPortFilter(e.target.value)}
            style={{
              height: '35px',
              padding: '0 8px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: selectedPortFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              color: selectedPortFilter !== 'ALL' ? '#2563eb' : '#334155',
              fontSize: '12px',
              fontWeight: selectedPortFilter !== 'ALL' ? 700 : 500,
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '140px'
            }}
          >
            <option value="ALL">⚓ ท่าเรือ</option>
            {availablePorts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        {/* 5. Size Filter Dropdown */}
        {availableSizes.length > 0 && (
          <select
            value={selectedSizeFilter}
            onChange={(e) => setSelectedSizeFilter && setSelectedSizeFilter(e.target.value)}
            style={{
              height: '35px',
              padding: '0 8px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: selectedSizeFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              color: selectedSizeFilter !== 'ALL' ? '#2563eb' : '#334155',
              fontSize: '12px',
              fontWeight: selectedSizeFilter !== 'ALL' ? 700 : 500,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">📐 ขนาด</option>
            {availableSizes.map(sz => (
              <option key={sz} value={sz}>{sz}'</option>
            ))}
          </select>
        )}

        {/* 6. Source File Filter Dropdown */}
        {availableSources.length > 1 && (
          <select
            value={selectedSourceFilter}
            onChange={(e) => setSelectedSourceFilter(e.target.value)}
            style={{
              height: '35px',
              padding: '0 8px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: selectedSourceFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              color: selectedSourceFilter !== 'ALL' ? '#2563eb' : '#334155',
              fontSize: '12px',
              fontWeight: selectedSourceFilter !== 'ALL' ? 700 : 500,
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '160px'
            }}
          >
            <option value="ALL">📄 ไฟล์ตั้งต้น</option>
            {availableSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Clear Filter Button */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            style={{
              height: '35px',
              padding: '0 9px',
              borderRadius: '7px',
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
            title="ล้างตัวกรองทั้งหมด"
          >
            <span>✕</span>
            <span>ล้างตัวกรอง</span>
          </button>
        )}

        {/* Search Box */}
        <div style={{ position: 'relative', width: '220px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
          <input 
            type="text" 
            placeholder="ค้นหาเลขตู้, เบอร์รถ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              height: '35px',
              paddingLeft: '32px',
              paddingRight: searchTerm ? '28px' : '10px',
              width: '100%', 
              borderRadius: '7px', 
              background: '#ffffff', 
              border: '1px solid #cbd5e1', 
              color: '#0f172a',
              fontSize: '12.5px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 0,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="ล้างคำค้นหา"
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Column Visibility Menu */}
        <ColumnVisibilityDropdown
          showColumnMenu={showColumnMenu}
          setShowColumnMenu={setShowColumnMenu}
          menuRef={menuRef}
          allColumns={allColumns}
          activeColumns={activeColumns}
          visibleColumns={visibleColumns}
          onToggleColumnVisibility={onToggleColumnVisibility}
          getColDisplayName={getColDisplayName}
          onStartEditAlias={onStartEditAlias}
          onShowAllColumns={onShowAllColumns}
          onResetAllAliases={onResetAllAliases}
        />
      </div>
    </div>
  );
}

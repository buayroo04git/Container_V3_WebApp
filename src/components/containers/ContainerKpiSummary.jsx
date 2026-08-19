import React from 'react';
import KpiCard from '../ui/KpiCard';

/**
 * 📊 Container KPI Summary Cards
 * Unified with the Central KpiCard Architecture
 */
export default function ContainerKpiSummary({ kpi, currentTab, onTabSelect }) {
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', 
      gap: '10px', 
      marginBottom: '14px',
      flexShrink: 0
    }}>
      <KpiCard
        title="📋 ทั้งหมดในใบวางบิล"
        value={kpi.totalMaster}
        unit="งาน"
        badge="ใบวางบิล"
        subtext="รายการงานทั้งหมดจากไฟล์ใบวางบิล"
        theme="blue"
        isActive={currentTab === 'all'}
        onClick={() => onTabSelect('all')}
      />

      <KpiCard
        title="🟢 พบในใบงาน (Matched)"
        value={kpi.matchedCount}
        unit="งาน"
        badge={`${kpi.matchRate}%`}
        subtext="มีใบงานสแกนในระบบและข้อมูลตรงกัน"
        theme="green"
        isActive={currentTab === 'matched'}
        onClick={() => onTabSelect('matched')}
      />

      <KpiCard
        title="🔴 สแกนนอกใบวางบิล"
        value={kpi.unmatchedCount}
        unit="งาน"
        badge="รอตรวจ"
        subtext="สแกนใบงานแล้ว แต่ไม่พบในไฟล์วางบิล"
        theme="rose"
        isActive={currentTab === 'unmatched'}
        onClick={() => onTabSelect('unmatched')}
      />

      <KpiCard
        title="⚠️ ยังไม่มีใบงาน (Missing)"
        value={kpi.missingCount}
        unit="งาน"
        badge="รอดำเนินการ"
        subtext="อยู่ในใบวางบิล แต่ยังไม่พบใบงานที่สแกน"
        theme="amber"
        isActive={currentTab === 'missing'}
        onClick={() => onTabSelect('missing')}
      />
    </div>
  );
}

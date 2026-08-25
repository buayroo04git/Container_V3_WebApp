import React, { useState } from 'react';
import TrucksView from './TrucksView';
import TruckMaintenanceView from './TruckMaintenanceView';
import HubTabBar from '../components/ui/HubTabBar';

const TABS = [
  { id: 'trucks', label: 'ข้อมูลรถประจำการ', icon: '🚛' },
  { id: 'maintenance', label: 'ประวัติการซ่อมบำรุง', icon: '🔧' }
];

/**
 * 🚛 FleetTrucksHubView: Combined Hub for Trucks and Maintenance
 */
export default function FleetTrucksHubView(props) {
  const [activeTab, setActiveTab] = useState(props.defaultSubTab || 'trucks');

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      overflow: 'hidden'
    }}>
      {/* Top Segmented Tab Switcher */}
      <div style={{
        padding: '14px 28px 0 28px',
        flexShrink: 0,
        background: '#f8fafc'
      }}>
        <HubTabBar
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'trucks' ? (
          <TrucksView {...props} />
        ) : (
          <TruckMaintenanceView {...props} />
        )}
      </div>
    </div>
  );
}

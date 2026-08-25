import React, { useState } from 'react';
import TruckOperationsView from './TruckOperationsView';
import DriverTruckHistoryView from './DriverTruckHistoryView';
import HubTabBar from '../components/ui/HubTabBar';

const TABS = [
  { id: 'operations', label: 'การดำเนินงานรถ', icon: '📜' },
  { id: 'history', label: 'ประวัติ Timeline การปฏิบัติงาน', icon: '⏱️' }
];

/**
 * 📜 FleetOperationsHubView: Combined Hub for Operations and Timeline History
 */
export default function FleetOperationsHubView(props) {
  const [activeTab, setActiveTab] = useState(props.defaultSubTab || 'operations');

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
        {activeTab === 'operations' ? (
          <TruckOperationsView {...props} />
        ) : (
          <DriverTruckHistoryView {...props} />
        )}
      </div>
    </div>
  );
}

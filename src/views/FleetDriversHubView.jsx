import React, { useState } from 'react';
import DriversView from './DriversView';
import DriverLeavesView from './DriverLeavesView';
import HubTabBar from '../components/ui/HubTabBar';

const TABS = [
  { id: 'drivers', label: 'ข้อมูลคนขับ', icon: '👤' },
  { id: 'leaves', label: 'ประวัติการลางาน', icon: '🏖️' }
];

/**
 * 👤 FleetDriversHubView: Combined Hub for Drivers and Leaves
 */
export default function FleetDriversHubView(props) {
  const [activeTab, setActiveTab] = useState(props.defaultSubTab || 'drivers');

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
        {activeTab === 'drivers' ? (
          <DriversView {...props} />
        ) : (
          <DriverLeavesView {...props} />
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import './index.css';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { getNavigationItem } from './config/navigationConfig';

const STORAGE_TAB_KEY = 'app_active_tab';

function getInitialTab() {
  try {
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (hash && getNavigationItem(hash)) {
      return hash;
    }
    const saved = localStorage.getItem(STORAGE_TAB_KEY);
    if (saved && getNavigationItem(saved)) {
      return saved;
    }
  } catch (e) {}
  return 'jobsheet-pending';
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [editingSheet, setEditingSheet] = useState(null);
  const [tabCustomProps, setTabCustomProps] = useState({});

  // Sync with URL Hash & localStorage on tab change
  const handleTabChange = (tab, customProps = {}) => {
    if (!tab) return;
    setEditingSheet(null);
    setTabCustomProps(customProps || {});
    setActiveTab(tab);
    try {
      localStorage.setItem(STORAGE_TAB_KEY, tab);
      if (window.location.hash !== `#${tab}`) {
        window.history.replaceState(null, '', `#${tab}`);
      }
    } catch (e) {}
  };

  // Listen for browser back / forward or manual hash change
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '').trim();
      if (hash && getNavigationItem(hash)) {
        setActiveTab(hash);
        setTabCustomProps({});
        try {
          localStorage.setItem(STORAGE_TAB_KEY, hash);
        } catch (e) {}
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Initial sync of hash if empty
    if (!window.location.hash) {
      try {
        window.history.replaceState(null, '', `#${activeTab}`);
      } catch (e) {}
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // 📅 Global Date & Month Picker Trigger for Firefox & Cross-browser compatibility
  useEffect(() => {
    const handleGlobalDateClick = (e) => {
      const target = e.target;
      if (
        target &&
        target.tagName === 'INPUT' &&
        (target.type === 'date' || target.type === 'month' || target.type === 'time' || target.type === 'datetime-local')
      ) {
        try {
          if (typeof target.showPicker === 'function') {
            target.showPicker();
          }
        } catch (err) {}
      }
    };

    document.addEventListener('click', handleGlobalDateClick, true);
    return () => {
      document.removeEventListener('click', handleGlobalDateClick, true);
    };
  }, []);

  const handleEditSheet = (sheet) => {
    setEditingSheet(sheet);
    handleTabChange('jobsheet-pending');
  };

  // ดึง Component และ Props จาก Navigation Registry อัตโนมัติ
  const currentNavItem = getNavigationItem(activeTab);
  const ActiveComponent = currentNavItem?.component;

  // เตรียม Props รวมที่ส่งให้ View ต่างๆ
  const viewProps = {
    activeTab,
    setActiveTab: handleTabChange,
    editingSheet,
    setEditingSheet,
    onEditSheet: handleEditSheet,
    ...(currentNavItem?.defaultProps || {}),
    ...tabCustomProps
  };

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        
        {/* ซ้าย: แถบเมนู Side Menu แบบ Dynamic */}
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} />
        
        {/* ขวา: พื้นที่แสดงผลการทำงาน ครอบด้วย ErrorBoundary แยกรายเมนู */}
        <main style={{ flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--bg-color)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary key={activeTab}>
            {ActiveComponent ? (
              <ActiveComponent {...viewProps} />
            ) : (
              <div style={{ padding: '40px', color: '#64748b', textAlign: 'center' }}>
                <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px' }}>
                  ⚠️ ไม่พบหน้าเมนูที่ระบุ
                </h3>
                <p style={{ fontSize: '13px' }}>
                  รหัสเมนู: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{activeTab}</code>
                </p>
                <button
                  onClick={() => setActiveTab('jobsheet-pending')}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  กลับไปหน้าแรก (Pending)
                </button>
              </div>
            )}
          </ErrorBoundary>
        </main>

      </div>
    </ToastProvider>
  );
}

export default App;

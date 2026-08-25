import ScannerView from '../views/ScannerView';
import BatchManagerView from '../views/BatchManagerView';
import OcrContainerHistoryView from '../views/OcrContainerHistoryView';
import DatabaseView from '../views/DatabaseView';
import FleetTrucksHubView from '../views/FleetTrucksHubView';
import FleetDriversHubView from '../views/FleetDriversHubView';
import FleetOperationsHubView from '../views/FleetOperationsHubView';
import DriverPayrollView from '../views/DriverPayrollView';
import TruckExpensesView from '../views/TruckExpensesView';
import SettingsView from '../views/SettingsView';

/**
 * 🗺️ Navigation Registry (Master Menu Configuration)
 * 
 * ทุกเมนูในระบบจะถูกลงทะเบียนไว้ที่นี่ที่เดียว
 * หากต้องการเพิ่มเมนูใหม่ในอนาคต:
 * 1. สร้าง Component View ใน src/views/...
 * 2. นำมาเพิ่ม 1 Object ในหมวดหมู่ที่ต้องการด้านล่างนี้
 * 3. ระบบ Sidebar และ Route ใน App.jsx จะทำงานทันทีอัตโนมัติ 100%
 */
export const NAVIGATION_SECTIONS = [
  {
    id: 'jobsheets',
    title: 'ใบงาน',
    icon: '📄',
    items: [
      {
        id: 'jobsheet-pending',
        label: 'Pending',
        icon: '⏳',
        description: 'รอสแกน / ตรวจสอบ / Draft',
        component: ScannerView,
      },
      {
        id: 'jobsheet-completed',
        label: 'Completed',
        icon: '✅',
        description: 'ประวัติใบงานที่บันทึกแล้ว',
        component: BatchManagerView,
      },
      {
        id: 'jobsheet-history',
        label: 'OCR Container History',
        icon: '📊',
        description: 'ประวัติตู้ทั้งหมดจากใบงาน (Completed & Pending)',
        component: OcrContainerHistoryView,
      }
    ]
  },
  {
    id: 'containers',
    title: 'Containers',
    icon: '📦',
    items: [
      {
        id: 'containers-all',
        label: 'All Containers',
        icon: '📋',
        description: 'เลขตู้ทั้งหมดจากไฟล์',
        component: DatabaseView,
        defaultProps: { activeFilter: 'all' }
      },
      {
        id: 'containers-matched',
        label: 'Matched',
        icon: '🟢',
        description: 'สแกนแล้ว & พบในไฟล์',
        component: DatabaseView,
        defaultProps: { activeFilter: 'matched' }
      },
      {
        id: 'containers-unmatched',
        label: 'Unmatched',
        icon: '🔴',
        description: 'สแกนแล้ว แต่ไม่พบในไฟล์',
        component: DatabaseView,
        defaultProps: { activeFilter: 'unmatched' }
      },
      {
        id: 'containers-missing',
        label: 'Missing',
        icon: '⚠️',
        description: 'อยู่ในไฟล์ แต่ยังไม่สแกน',
        component: DatabaseView,
        defaultProps: { activeFilter: 'missing' }
      }
    ]
  },
  {
    id: 'fleet',
    title: 'รถและคนขับ',
    icon: '🚚',
    items: [
      {
        id: 'fleet-trucks',
        label: 'ข้อมูลรถและการซ่อม',
        icon: '🚛',
        description: 'จัดการทะเบียนรถ คนขับประจำ และประวัติการซ่อมบำรุง',
        component: FleetTrucksHubView,
      },
      {
        id: 'fleet-drivers',
        label: 'ข้อมูลคนขับและการลา',
        icon: '👤',
        description: 'ทะเบียนคนขับ ใบอนุญาต และประวัติการลางาน',
        component: FleetDriversHubView,
      },
      {
        id: 'fleet-operations',
        label: 'การดำเนินงานและประวัติ',
        icon: '📜',
        description: 'บันทึกการใช้รถ มอบหมายคนขับ และ Timeline ประวัติการปฏิบัติงาน',
        component: FleetOperationsHubView,
      }
    ]
  },
  {
    id: 'payroll',
    title: 'ค่ารอบ & การเงิน',
    icon: '💰',
    items: [
      {
        id: 'driver-payroll',
        label: 'สรุปรายได้คนขับ',
        icon: '💵',
        description: 'ศูนย์รวมสรุปรายได้ ค่ารอบตู้ เงินพิเศษ ฐานเงินเดือน ประกันสังคม และเบิกล่วงหน้า',
        component: DriverPayrollView,
      },
      {
        id: 'truck-expenses',
        label: 'ค่าใช้จ่ายรถ & น้ำมัน',
        icon: '⛽',
        description: 'บันทึกค่าใช้จ่ายรถ ค่าน้ำมัน ค่าซ่อมบำรุง และค่างวดรถแบบเบ็ดเสร็จ',
        component: TruckExpensesView,
      }
    ]
  },
  {
    id: 'system',
    title: 'System',
    icon: '⚙️',
    items: [
      {
        id: 'settings',
        label: 'Owner Settings',
        icon: '⚙️',
        description: 'ตั้งค่า API & Cloud Keys',
        component: SettingsView
      }
    ]
  }
];

// Legacy / Shortcut navigation aliases
const NAVIGATION_ALIASES = {
  'fleet-maintenance': { targetId: 'fleet-trucks', defaultProps: { defaultSubTab: 'maintenance' } },
  'fleet-leaves': { targetId: 'fleet-drivers', defaultProps: { defaultSubTab: 'leaves' } },
  'fleet-history': { targetId: 'fleet-operations', defaultProps: { defaultSubTab: 'history' } },
  'driver-rates': { targetId: 'driver-payroll', defaultProps: { defaultSubTab: 'rates' } }
};

/**
 * ค้นหา Item จาก Navigation ID
 * @param {string} id - รหัสเมนู เช่น 'jobsheet-pending', 'containers-all'
 * @returns {object|null}
 */
export function getNavigationItem(id) {
  if (!id) return null;

  // Check aliases first for smooth backward compatibility
  if (NAVIGATION_ALIASES[id]) {
    const alias = NAVIGATION_ALIASES[id];
    const targetItem = getNavigationItem(alias.targetId);
    if (targetItem) {
      return {
        ...targetItem,
        defaultProps: {
          ...(targetItem.defaultProps || {}),
          ...alias.defaultProps
        }
      };
    }
  }

  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (item.id === id) {
        return item;
      }
    }
  }
  return null;
}

/**
 * ดึงรายการเมนูทั้งหมดเป็น Flat Array สำหรับค้นหาหรือตรวจสอบ
 */
export function getAllNavigationItems() {
  return NAVIGATION_SECTIONS.flatMap(section => section.items);
}

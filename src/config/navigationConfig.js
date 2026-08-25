import ExecutiveDashboardView from '../views/ExecutiveDashboardView';
import ScannerView from '../views/ScannerView';
import BatchManagerView from '../views/BatchManagerView';
import OcrContainerHistoryView from '../views/OcrContainerHistoryView';
import DatabaseView from '../views/DatabaseView';
import FleetTrucksHubView from '../views/FleetTrucksHubView';
import FleetDriversHubView from '../views/FleetDriversHubView';
import FleetOperationsHubView from '../views/FleetOperationsHubView';
import DriverPayrollView from '../views/DriverPayrollView';
import DriverAdvancesView from '../views/DriverAdvancesView';
import TruckExpensesView from '../views/TruckExpensesView';
import TruckPnlView from '../views/TruckPnlView';
import PortRatesView from '../views/PortRatesView';
import SettingsView from '../views/SettingsView';

/**
 * 🗺️ Navigation Registry (Master Menu Configuration)
 * 
 * ทุกเมนูในระบบจะถูกลงทะเบียนไว้ที่นี่ที่เดียว
 * จัดหมวดหมู่ 3 เสาหลัก + แดชบอร์ดภาพรวมผู้บริหาร
 */
export const NAVIGATION_SECTIONS = [
  {
    id: 'executive',
    title: 'ภาพรวมบริหาร',
    icon: '📊',
    items: [
      {
        id: 'executive-dashboard',
        label: 'แดชบอร์ดภาพรวม',
        icon: '📊',
        description: 'ศูนย์รวมรายรับท่าเรือ ต้นทุนฟลีท และสรุปกำไรสุทธิแบบ Real-time',
        component: ExecutiveDashboardView,
      }
    ]
  },
  {
    id: 'operations',
    title: '1. ปฏิบัติการ & สแกน',
    icon: '📦',
    items: [
      {
        id: 'jobsheet-pending',
        label: 'Pending',
        icon: '⏳',
        description: 'รอสแกน / ตรวจสอบ / บันทึก',
        component: ScannerView,
      },
      {
        id: 'jobsheet-completed',
        label: 'Completed Job Sheets',
        icon: '✅',
        description: 'ประวัติใบงานที่บันทึกแล้ว',
        component: BatchManagerView,
      },
      {
        id: 'containers-all',
        label: 'Containers DB',
        icon: '🗄️',
        description: 'เลขตู้ทั้งหมดจากไฟล์วางบิล Master DB',
        component: DatabaseView,
        defaultProps: { activeFilter: 'all' }
      },
      {
        id: 'jobsheet-history',
        label: 'OCR Container History',
        icon: '📋',
        description: 'ประวัติตู้ทั้งหมดจากใบงาน (Completed & Pending)',
        component: OcrContainerHistoryView,
      }
    ]
  },
  {
    id: 'payroll',
    title: '2. คนขับ & ผลงานวิ่งตู้',
    icon: '👨‍✈️',
    items: [
      {
        id: 'driver-payroll',
        label: 'ผลงานคนขับ & ค่าเที่ยว',
        icon: '📦',
        description: 'สรุปผลงานตู้ที่ตรวจผ่าน ค่าเที่ยว และเงินพิเศษขั้นบันได',
        component: DriverPayrollView,
      },
      {
        id: 'driver-advances',
        label: 'บัญชีเบิกล่วงหน้า & กู้ยืม',
        icon: '💸',
        description: 'บันทึกการเบิกค่าเที่ยว เบิกเงินล่วงหน้า และสัญญาเงินยืมก้อนผ่อนชำระ',
        component: DriverAdvancesView,
      },
      {
        id: 'fleet-drivers',
        label: 'ทะเบียนคนขับ & ฐานเงินเดือน',
        icon: '👤',
        description: 'ทะเบียนคนขับ ฐานเงินเดือน ประกันสังคม และประวัติการลางาน',
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
    id: 'fleet',
    title: '3. รถ & ผลประกอบการ',
    icon: '🚛',
    items: [
      {
        id: 'truck-pnl',
        label: 'รายได้รถ',
        icon: '📈',
        description: 'สรุปรายได้ที่รถสร้างจากตู้ท่าเรือ ต้นทุนฟลีท และจัดการเรทท่าเรือ',
        component: TruckPnlView,
      },
      {
        id: 'truck-expenses',
        label: 'ค่าใช้จ่ายรถ & น้ำมัน',
        icon: '⛽',
        description: 'บันทึกค่าใช้จ่ายรถ ค่าน้ำมัน ค่าซ่อมบำรุง และค่างวดรถแบบเบ็ดเสร็จ',
        component: TruckExpensesView,
      },
      {
        id: 'fleet-trucks',
        label: 'ทะเบียนรถ & ซ่อมบำรุง',
        icon: '🚚',
        description: 'จัดการทะเบียนรถ คนขับประจำ และประวัติการซ่อมบำรุง',
        component: FleetTrucksHubView,
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
  'port-rates': { targetId: 'truck-pnl', defaultProps: { defaultSubTab: 'rates' } },
  'fleet-maintenance': { targetId: 'fleet-trucks', defaultProps: { defaultSubTab: 'maintenance' } },
  'fleet-leaves': { targetId: 'fleet-drivers', defaultProps: { defaultSubTab: 'leaves' } },
  'fleet-history': { targetId: 'fleet-operations', defaultProps: { defaultSubTab: 'history' } },
  'driver-rates': { targetId: 'driver-payroll', defaultProps: { defaultSubTab: 'rates' } },
  'containers-matched': { targetId: 'containers-all', defaultProps: { activeFilter: 'matched' } },
  'containers-unmatched': { targetId: 'containers-all', defaultProps: { activeFilter: 'unmatched' } },
  'containers-missing': { targetId: 'containers-all', defaultProps: { activeFilter: 'missing' } }
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

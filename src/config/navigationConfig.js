import ScannerView from '../views/ScannerView';
import BatchManagerView from '../views/BatchManagerView';
import OcrContainerHistoryView from '../views/OcrContainerHistoryView';
import DatabaseView from '../views/DatabaseView';
import TrucksView from '../views/TrucksView';
import DriversView from '../views/DriversView';
import TruckOperationsView from '../views/TruckOperationsView';
import TruckMaintenanceView from '../views/TruckMaintenanceView';
import DriverLeavesView from '../views/DriverLeavesView';
import DriverTruckHistoryView from '../views/DriverTruckHistoryView';
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
        id: 'fleet-operations',
        label: 'การดำเนินงานรถ (Operations)',
        icon: '📜',
        description: 'บันทึกประวัติการใช้รถ ช่วงเวลาการขับขี่ และการมอบหมายคนขับ',
        component: TruckOperationsView,
      },
      {
        id: 'fleet-trucks',
        label: 'ข้อมูลรถ (Trucks)',
        icon: '🚛',
        description: 'จัดการทะเบียนรถ สถานะพร้อมใช้งาน และคนขับประจำ',
        component: TrucksView,
      },
      {
        id: 'fleet-drivers',
        label: 'ข้อมูลคนขับ (Drivers)',
        icon: '👤',
        description: 'ทะเบียนคนขับ ใบอนุญาตขับขี่ และข้อมูลติดต่อ',
        component: DriversView,
      },
      {
        id: 'fleet-maintenance',
        label: 'ประวัติการซ่อมบำรุง (Maintenance)',
        icon: '🔧',
        description: 'บันทึกประวัติการซ่อมบำรุงรถ เข้าอู่ และค่าใช้จ่าย',
        component: TruckMaintenanceView,
      },
      {
        id: 'fleet-leaves',
        label: 'ประวัติการลางาน (Driver Leaves)',
        icon: '🏖️',
        description: 'บันทึกประวัติการลางาน วันหยุดพักผ่อน และสถิติวันลา',
        component: DriverLeavesView,
      },
      {
        id: 'fleet-history',
        label: 'ประวัติการปฏิบัติงาน (Operation History)',
        icon: '📜',
        description: 'Audit Trail บันทึกประวัติการเริ่มปฏิบัติงาน สลับรถ สิ้นสุดการปฏิบัติงาน ซ่อมบำรุง และลางานของทั้งระบบ',
        component: DriverTruckHistoryView,
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

/**
 * ค้นหา Item จาก Navigation ID
 * @param {string} id - รหัสเมนู เช่น 'jobsheet-pending', 'containers-all'
 * @returns {object|null}
 */
export function getNavigationItem(id) {
  if (!id) return null;
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

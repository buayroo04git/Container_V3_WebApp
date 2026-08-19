# 📘 Container V3 WebApp - มาตรฐานระบบและบันทึกการปรับปรุง (System Conventions & Changelog)

เอกสารนี้รวบรวมมาตรฐานการออกแบบ UI/UX, กฎทางธุรกิจ (Business Rules), สถาปัตยกรรมของระบบ และบันทึกการเปลี่ยนแปลง เพื่อใช้เป็นแนวทางมาตรฐานร่วมกันทั้งโปรเจกต์

---

## 🎨 1. มาตรฐาน UI & Wording (UI Conventions)

### 1.1 ปุ่มตัวกรอง (Filter Dropdowns)
* ❌ **ไม่ใส่คำว่า `"ทุก..."` ใน Option แรก:** ห้ามใช้คำว่า `ทุกรอบงาน`, `ทุกเบอร์รถ`, `ทุกประเภท`
* ✅ **ใช้ชื่อหัวข้อโดยตรงพร้อมไอคอน:**
  * 📁 `รอบงาน (Batch)`
  * 🚚 `เบอร์รถ`
  * 🏷️ `ประเภท (DIS/LOAD)`
  * ⚓ `ท่าเรือ`
  * 📐 `ขนาด`
  * 📄 `ไฟล์ตั้งต้น`
* 💡 **ปุ่มล้างตัวกรอง (Auto-detect Clear Filter):** แสดงปุ่ม `✕ ล้างตัวกรอง` อัตโนมัติเฉพาะเมื่อมีฟิลเตอร์หรือคำค้นหาทำงานอยู่ (`hasActiveFilters`) เพื่อความสะอาดตา

### 1.2 การ์ดสถิติ (KPI Summary Cards Layout)
* **Single-Row Layout:** กำหนดขนาดการ์ดกะทัดรัด (Min-width ~`160px - 170px`, Padding `10px 14px`, ความสูง ~`80px`) เพื่อให้การ์ดสรุป 4-5 ใบ **เรียงตัวพอดีใน 1 แถวเดียวเสมอ** บนทุกความละเอียดหน้าจอ
* **คำอธิบายใต้การ์ด Master DB:**
  * 🟢 **Matched:** `ตรวจสอบแล้วและพบในใบวางบิล`
  * 🔴 **Unmatched:** `ตรวจสอบแล้วและไม่พบในใบวางบิล`
  * ⚠️ **Missing:** หัวข้อการ์ดใช้ `⚠️ Missing`

---

## 🎯 2. กฎการคำนวณข้อมูลและการจับคู่ (Matching & Business Rules)

### 2.1 กฎ Strict Completed Matching (นับเฉพาะงานที่ตรวจเสร็จแล้ว)
* **Reconciliation & KPI Calculation:** ระบบจะนับสถานะ **Matched (ตรงใบวางบิล)**, **Unmatched (ไม่พบในใบวางบิล)** และ **Missing (ยังไม่ถูกสแกน)** จากใบงานที่อยู่ในสถานะ **`workflow_status === 'completed'` (บันทึกเสร็จสมบูรณ์แล้ว) เท่านั้น**
* **งานในคิว Pending:** ใบงานที่ยังเป็น Draft หรือรอตรวจ (`workflow_status === 'pending'`) จะ **ไม่ถูกนำมานับปะปน** ในยอด Matched หรือ Missing ของ Master DB เด็ดขาด

### 2.2 การปกป้องฐานข้อมูลหลัก (Read-Only Master DB)
* ตาราง **`container_records`** ถือเป็น Master Source of Truth (Read-Only) จะไม่มีการแก้ไขทับโดยตรง
* การบันทึกผลการตรวจทาน, หมายเหตุ, หรือการจับคู่ จะบันทึกลงในตารางฝั่ง OCR (`ocr_records`, `job_sheet_items`, `ocr_cache`) และซิงค์เชื่อมโยงกันเสมอ

---

## 📊 3. ระบบจัดการตารางอัจฉริยะ (Reusable Data Table System)

1. **ระบบตั้งชื่อเล่นคอลัมน์ (Column Alias Engine):**
   * รองรับการคลิกขวา / ดับเบิ้ลคลิกที่หัวตารางเพื่อตั้งชื่อเล่น (Alias)
   * บันทึกค่าทั้งใน `localStorage` ของเบราว์เซอร์ และซิงค์ลงฐานข้อมูล `column_aliases` (Supabase)
2. **ระบบจัดระเบียบตารางส่วนบุคคล (Personalized Table Views):**
   * **Column Reorder:** ลากสลับตำแหน่งหัวคอลัมน์ได้อิสระ
   * **Column Resize:** ลากขยาย/ย่อความกว้างคอลัมน์ พร้อมระบบ **Auto-Fit** ตามความยาวข้อความจริง
   * **Column Visibility:** เมนูเปิด/ปิดการแสดงผลคอลัมน์ที่ไม่จำเป็น
3. **ระบบ Export Excel อิงตามมุมมองจริง:**
   * สั่ง Export เฉพาะแถวและคอลัมน์ที่ถูกกรองและเปิดแสดงผลอยู่จริง 100%

---

## 🖼️ 4. ระบบพรีวิวรูปภาพขั้นสูง (Image Viewer Modal)

1. **ระบบเคลื่อนย้ายและซูมภาพ (Pan & Zoom Engine):**
   * รองรับการคลิกลากเลื่อนภาพ (**Mouse Drag Pan**) ได้อย่างอิสระ
   * ซูมเข้า-ออกด้วยลูกกลิ้งเมาส์ (**Mouse Wheel Zoom**), ปุ่มซูม 2x, และปุ่มรีเซ็ตตำแหน่ง
2. **ระบบ Multi-Level Google Drive Fallback:**
   * ดึง File ID จาก Google Drive URL อัตโนมัติ
   * ลำดับการโหลด: `Direct Image Stream (lh3.googleusercontent.com)` ➡️ `Thumbnail API (w1600)` ➡️ `Google Drive Iframe Viewer` หมดปัญหาภาพจอดำ 100%

---

## 🗺️ 5. สถาปัตยกรรม Navigation Registry (`navigationConfig.js`)

* ทุกเมนูในระบบถูกควบคุมจาก Registry กลางที่เดียว (`src/config/navigationConfig.js`)
* เมื่อต้องการเพิ่มเมนูใหม่ในอนาคต (เช่น *Truck Expense*, *Driver Operations*) เพียงประกาศ Object ใน Config ระบบ Sidebar และ Routing จะสร้างให้อัตโนมัติ

---

## 📝 บันทึกประวัติการปรับปรุง (Changelog)

### 🚀 2026-08-19: ระบบบันทึกการซ่อมบำรุงรถ & บันทึกการลางานคนขับแบบละเอียด V2.2
* ✅ **Dedicated Maintenance & Leave DB Architecture (`create_maintenance_and_leave_tables.sql`):**
  * **`public.truck_maintenance_records`:** เก็บประวัติการเข้าซ่อม, ประเภทการซ่อม (เช็กระยะ, เครื่องยนต์, เบรก, ยาง, ไฟ, ตัวถัง), อู่/ศูนย์บริการ, เลขไมล์, ค่าอะไหล่, ค่าแรง, ยอดรวม, เลขที่บิล, รายการอะไหล่, ผู้ส่งซ่อม, และสถานะ
  * **`public.driver_leave_records`:** เก็บประวัติการลา, ประเภทการลา (ลากิจ, ลาป่วย, ลาพักร้อน, ลาบวช/คลอด, ขาดงาน), วันที่เริ่ม-สิ้นสุด, ลาไม่มีกำหนด, จำนวนวันลาจริง, เหตุผลการลา, การจ่ายค่าจ้าง (Paid/Unpaid), ผู้อนุมัติ, และสถานะ
* ✅ **Dedicated Service Layer:**
  * [`maintenanceService.js`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/maintenanceService.js): CRUD, คำนวณวันเข้าซ่อมอัตโนมัติ, คำนวณยอดเงินรวมอัตโนมัติ, ระบบเชื่อมต่อ Supabase พร้อม LocalStorage Cache Fallback
  * [`leaveService.js`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/leaveService.js): CRUD, ปรับวันสิ้นสุดการลาอัตโนมัติเมื่อกลับมาทำงาน, คำนวณยอดวันลา, ระบบเชื่อมต่อ Supabase พร้อม LocalStorage Cache Fallback
* ✅ **New Dedicated Views & Master Navigation:**
  * 🔧 **[`TruckMaintenanceView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/TruckMaintenanceView.jsx):** หน้าจัดการประวัติการซ่อมบำรุงรถ พร้อม KPI (รถที่กำลังซ่อม, ยอดรวมค่าใช้จ่าย, รายการที่ซ่อมเสร็จ, รถที่เคยซ่อม), ฟิลเตอร์ค้นหา, และส่งออก Excel
  * 🏖️ **[`DriverLeavesView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/DriverLeavesView.jsx):** หน้าจัดการประวัติการลางานคนขับ พร้อม KPI (คนที่กำลังลา, วันลารวม, คนที่เคยลา), ฟิลเตอร์ค้นหา, และส่งออก Excel
  * 📜 **[`DriverTruckHistoryView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/DriverTruckHistoryView.jsx):** หน้าประวัติการปฏิบัติงาน (Operation History & Audit Trail) รวมทั้งระบบ พร้อมปุ่มล้างประวัติ (Clear History Log), สลับมุมมองตารางเต็มและไทม์ไลน์, และส่งออก Excel
  * 🏷️ **Updated Operation Action Badges:** ปรับข้อความสถานะให้ตรงจุดประสงค์การทำงาน: `🟢 เริ่มปฏิบัติงาน` (ASSIGN) และ `🔴 สิ้นสุดการปฏิบัติงาน` (UNASSIGN)
  * ⚙️ **Unified Centralized Column Preferences:** ทั้ง 3 ตารางใหม่เชื่อมต่อระบบจัดการคอลัมน์กลาง (`useColumnPreferences`, `ColumnVisibilityDropdown`, `TableContextMenu`, `RenameColumnModal`) ครบวงจร 100% พร้อมจัดวางตำแหน่งปุ่มคอลัมน์คลีนและถูกต้อง
  * ลงทะเบียนเมนูใน [`navigationConfig.js`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/config/navigationConfig.js) ภายใต้ชื่อ **"ประวัติการปฏิบัติงาน (Operation History)"** ในหมวดหมู่ **"รถและคนขับ"**
* ✅ **🔧 Decoupled Completed Maintenance Ledger Architecture (สมุดบันทึกประวัติการซ่อมบำรุง & ค่าใช้จ่าย):**
  * **แยกอิสระจากสถานะรถ 100% (Decoupled):** การบันทึกงานซ่อม ค่าอะไหล่ ค่าแรง และบิล จะเป็นสมุดบันทึกประวัติค่าใช้จ่าย (Completed Ledger) โดยไม่ไปแทรกแซงหรือบังคับเปลี่ยนสถานะการดำเนินงานของรถ
  * **ฟอร์มบันทึกการซ่อมคลีน 1 หน้า ([`MaintenanceModal.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/components/maintenance/MaintenanceModal.jsx)):** ระบุเบอร์รถ, ประเภทงานซ่อม (เช็กระยะ, ยาง, เบรก, เครื่องยนต์ ฯลฯ), วันที่ซ่อม, อู่/ศูนย์, เลขไมล์, ค่าอะไหล่ + ค่าแรง ➡️ รวมเงินอัตโนมัติ, เลขที่บิล, รายการอะไหล่
  * **หน้าจัดการประวัติการซ่อม ([`TruckMaintenanceView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/TruckMaintenanceView.jsx)):** แสดงตารางบันทึกค่าใช้จ่ายทั้งหมด พร้อม 3 KPI หลัก (ยอดค่าซ่อมรวม, จำนวนครั้งที่ซ่อม, รถที่เข้าซ่อม), ค้นหา/กรอง, และส่งออก Excel
  * **หน้าข้อมูลรถ ([`TrucksView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/TrucksView.jsx)):** ปรับสถานะรถได้เหมือนเดิมอย่างคลีนและสะดวก โดยไม่ปะปนกับประวัติบิลซ่อมบำรุง
* ✅ **Cascade Unassign on Clear All & Delete Operations (`operationsService.js`):**
  * เมื่อกด **"ล้างข้อมูลการดำเนินงานทั้งหมด (Clear All)"** หรือ **"ลบรายการการดำเนินงาน"**: ระบบจะสั่งปลดการผูกรถ-คนขับ (`assigned_driver_name = '-'` และ `assigned_truck_no = '-'`) ใน `truck_records` และ `driver_records` อัตโนมัติ ป้องกันข้อมูลค้างหรือ Ghost Assignment
  * ใน [`fetchTrucks`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/truckDriverService.js) และ [`fetchDrivers`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/truckDriverService.js) ปรับให้อ่านสถานะคนขับ/รถประจำสดตรงจาก **`truck_operations` (Single Source of Truth)** เสมอ หากไม่มีการดำเนินงานที่กำลัง Active อยู่ รถและคนขับจะแสดงสถานะเป็นว่าง (`-`) ทันที 100%

### 🚀 2026-08-19: การเชื่อมโยงระบบการดำเนินงานรถและยกระดับสถาปัตยกรรม Database V2.1
* ✅ **Maintenance & Leave Lifecycle Tracking (`StatusChangeConfirmModal.jsx`):**
  * **กรณีส่งรถเข้าซ่อมบำรุง (`maintenance`):** บันทึกวันที่เริ่มเข้าซ่อม, วันที่คาดว่าจะเสร็จ (หรือติ๊ก "ยังไม่มีกำหนดวันเสร็จ"), และรายการซ่อม/อู่
  * **กรณีรถซ่อมเสร็จกลับมาพร้อมใช้งาน (`active`):** ระบบจะดึงวันที่เริ่มเข้าซ่อมเดิมมาแสดง พร้อมให้ระบุ **วันที่ซ่อมเสร็จ/พร้อมใช้งาน** และ **คำนวณสรุประยะเวลาที่เข้าซ่อม (รวม X วัน)** บันทึกลงใน Timeline ประวัติ (`MAINTENANCE_END`) ทันที
  * **กรณีคนขับลางาน (`leave`):** บันทึกวันที่เริ่มลา, วันที่คาดว่าจะกลับมา (หรือติ๊ก "ลาไม่มีกำหนด"), และเหตุผลการลา
  * **กรณีคนขับกลับมาปฏิบัติงาน (`active`):** ระบบจะนำ **วันที่กลับมาทำงาน** ไป **ปรับปรุงเป็นวันที่สิ้นสุดการลาก่อนหน้าอัตโนมัติ** พร้อม **คำนวณสรุปช่วงเวลาลางาน (รวม X วัน)** บันทึกลงใน Timeline ประวัติ (`RESUME_WORK`) อย่างแม่นยำ
* ✅ **App-Native Status Change Confirmation Modal with Effective Date (`StatusChangeConfirmModal.jsx`):**
  * สร้างโมดอล UI สไตล์ของแอปสำหรับยืนยันการเปลี่ยนสถานะ (แทนบราวเซอร์ alert/confirm) ทั้งใน **หน้ารถ ([`TrucksView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/TrucksView.jsx))** และ **หน้าคนขับ ([`DriversView.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/views/DriversView.jsx))**
  * มีช่อง **"📅 ระบุวันที่มีผล (Effective Date)"** ให้เลือกวันที่ต้องการบันทึกลงในงวดงานและ Timeline ได้อย่างแม่นยำ
  * มี 3 ทางเลือกชัดเจน:
    1. 🛑 *ยืนยัน (เปลี่ยนสถานะ + หยุดงวดงานและปลดคนขับ/รถ)*
    2. *เปลี่ยนเฉพาะสถานะ (ยังคงคนขับ/รถเดิมไว้)*
    3. *ยกเลิก*
  * ในฟอร์มแก้ไข ([`TruckModal.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/components/trucks/TruckModal.jsx) และ [`DriverModal.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/components/drivers/DriverModal.jsx)) มีกล่องตัวเลือกพร้อมช่องเลือกวันที่มีผลรองรับเช่นเดียวกัน
* ✅ **Vehicle Operations as Single Source of Truth:**
  * ปรับสถาปัตยกรรมการมอบหมายรถ-คนขับให้ขับเคลื่อนผ่าน **"เมนูการดำเนินงานรถ (Vehicle Operations)"** เป็นศูนย์กลางเพียงจุดเดียว
  * ถอดฟอร์มเลือกคนขับ/เลือกรถออกจาก `TruckModal.jsx` และ `DriverModal.jsx` และตาราง โดยเปลี่ยนเป็น Read-Only Badge ที่สะท้อนสถานะปัจจุบันจากงวดงานสด ป้องกันการแก้ข้อมูลทับซ้อนนอกกระบวนการ
* ✅ **Smart Driver Auto-Activation in Operations:**
  * ใน [`OperationModal.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/components/operations/OperationModal.jsx) เมื่อเลือกคนขับที่สถานะเป็น `🟡 ลางาน` หรือ `⚪ พักงาน/ลาออก` ระบบจะแสดงกล่องแจ้งเตือนพร้อมตัวเลือก "เปลี่ยนสถานะกลับเป็น 🟢 ปฏิบัติงาน (Active) อัตโนมัติ" ทันทีที่เปิดงวดงานใหม่
* ✅ **Driver KPI Workload Period Attribution (`fetchDrivers`):**
  * ปรับระบบคำนวณ KPI ยอดงานของคนขับ (`master_containers`, `matched_containers`) ให้ตรวจเช็กตาม **ช่วงเวลาที่ขึ้นขับจริง (`truck_operations`)** โดยเทียบ `date_job` ของตู้กับ `[start_date, end_date]` ของงวดงาน แทนการอิงแค่เบอร์รถปัจจุบัน ทำให้แม้มีการสลับรถหรืองวดงานในอดีต ยอดผลงานของคนขับแต่ละคนจะถูกต้องตามวันที่วิ่งงานจริง 100%
* ✅ **UI Terminology & Column Name Refinement:**
  * ปรับเปลี่ยนชื่อคอลัมน์และป้าย KPI ในหน้ารถและหน้าคนขับ:
    * `มีใบงานแล้ว` ➡️ **`ตรวจสอบแล้ว`**
    * `ยังไม่มีใบงาน` ➡️ **`รอตรวจสอบ`**
  * ปรับปุ่มหยุดงวดงานในหน้างวดการดำเนินงานรถจาก `🛑 หยุดการดำเนินงาน` ➡️ **`🛑 หยุด`** ให้กะทัดรัดและคลีนขึ้น
* ✅ **Driver Lifetime Workload Preservation:**
  * ยืนยันระบบคำนวณยอดงานของคนขับ (`master_containers`, `matched_containers`, `missing_containers`) จะคงอยู่ถาวรตามประวัติช่วงเวลาที่เคยวิ่งงานจริง แม้คนขับจะเปลี่ยนสถานะเป็นลางานหรือลาออก หรือไม่มีรถประจำอยู่ในปัจจุบัน
* ✅ **Rate Per Trip Decoupling:**
  * ถอดฟิลด์ `rate_per_trip` ออกจากฟอร์มคนขับ (`DriverModal.jsx`), ตารางคนขับ (`DriversView.jsx`), และงวดงาน เพื่อรอเชื่อมโยงกับโมดูลตารางเรทราคาเฉพาะ (Trip Rate Matrix) ในอนาคต
* ✅ **Detailed Audit Trail Expansion (`driver_truck_history`):**
  * เพิ่มฟิลด์ `effective_date` (วันที่มีผลจริง), `truck_license` (ป้ายทะเบียนรถขณะมอบหมาย), `operation_id` (รหัสงวดงาน), และ `created_by` (ผู้ทำรายการ) ในตาราง `driver_truck_history` และหน้า Timeline Modal
* ✅ **Atomic SQL Transactions via Supabase RPC:**
  * สร้าง Stored Procedure `assign_driver_to_truck_rpc` และ `unassign_driver_truck_rpc` รวบกระบวนการสลับรถ 8 ขั้นตอนให้อยู่ใน 1 Transaction สมบูรณ์แบบ ป้องกัน Race Condition และข้อมูลค้างครึ่งทาง 100%
  * อัปเกรด [`truckDriverService.js`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/truckDriverService.js) ให้เรียกใช้ RPC ก่อนเสมอ พร้อม Client Fallback อัจฉริยะ
* ✅ **Driver Uniqueness & Constraint Hardening:**
  * เพิ่ม `UNIQUE (driver_name)` constraint บน `driver_records` ป้องกันปัญหาชื่อคนขับซ้ำ
* ✅ **Full Supabase History Synchronization:**
  * อัปเกรด [`historyService.js`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/services/historyService.js) ให้ดึงข้อมูลจริงจาก `driver_truck_history` (Supabase) ไม่จำกัดแค่ LocalStorage อีกต่อไป
  * ซิงค์ [`AssignmentHistoryModal.jsx`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/src/components/ui/AssignmentHistoryModal.jsx) ให้โหลดประวัติสดจาก Cloud ทันทีที่เปิดดู
* ✅ **Supabase Migration Script V2.1:**
  * รวมคำสั่งทั้งหมดไว้ใน [`supabase_truck_driver_v2_migration.sql`](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/supabase_truck_driver_v2_migration.sql) เพื่อให้รันเพียง 1 ครั้งใน Supabase SQL Editor

### 🚀 2026-08-18: การยกเครื่องสถาปัตยกรรมฐานข้อมูล 2 เสาหลัก และระบบกระทบยอดอัตโนมัติ
* ✅ **Dual-Pillar Database Architecture & Direct ID Linking:**
  * แบ่งแยก 2 เสาหลักอิสระ: `container_records` (ฝั่งใบวางบิล Master DB) และ `job_sheets` + `job_sheet_items` (ฝั่งใบงาน Completed)
  * บรรจุคอลัมน์ **`ref_master_id`** ใน `job_sheet_items` ชี้ตรงไปยัง `container_records.id` เพื่อระบุตัวตนแบบ PK ⟷ FK 1:1 ชัดเจน
* ✅ **Full Auto-Reconciliation Engine (Auto Re-link & Heal):**
  * อัปเกรด `autoReconcileUnmatchedRecords()` ให้ทำการ Re-link `ref_master_id` และ Auto-heal ตู้แดง (🔴) ➡️ เขียว (🟢) อัตโนมัติทุกครั้งที่มีการล้างหรืออัปโหลดไฟล์ Excel ใบวางบิลใหม่
* ✅ **Strict 6-Tier Hierarchy Matching with `date_job`:**
  * เพิ่มลำดับขั้นการจับคู่ตู้โดยยึด **เบอร์รถก่อนเสมอ (Truck-First Strict)**
  * เพิ่มการตรวจสอบวันที่ `date_job` และ `isDateMatching` เป็นตัวช่วยเสริม (Bonus Filter) สำหรับตู้ซ้ำต่างวัน
* ✅ **Truck & Driver Master Performance Foundation:**
  * ปรับแก้ `truckDriverService.js` ให้ยึด `container_records` ฝั่งใบวางบิลเป็นฐานในการนับยอดงานทั้งหมด (`master_containers`) ของรถและคนขับ
  * ปรับบทบาทของ `ocr_records` เป็นตาราง Archive & Backup เท่านั้น (ยัง Sync-Write บันทึกสำเนาคู่ขนานตามปกติ แต่ไม่นำมาใช้คำนวณสถิติ/KPI ใดๆ)
* ✅ **Containers KPI Synchronization:**
  * ซิงค์การ์ดสรุป KPI ในหน้า Containers (`DatabaseView.jsx`) ให้คำนวณผ่าน `ref_master_id` และ `workflow_status === 'completed'` ตรงเป๊ะ 100% (354 Master / 98 Matched / 4 Unmatched / 256 Missing)
* ✅ **Edit Modal UI Polish (`EditOcrContainerModal.jsx`):**
  * จัดระเบียบ Header และ Action Buttons สวยงาม กะทัดรัด ความสูง 34px เท่ากัน
  * ตัด Badge ซ้ำซ้อน (`📌 แถวที่ #X`) ออก คงเหลือเฉพาะ `📄 บรรทัดที่ Y`

### 🗓️ 2026-08-17
* ✅ **Image Viewer & Edit Modal:**
  * แก้ไขภาพจอดำจาก Google Drive Link ด้วย Fallback Engine
  * เพิ่มระบบคลิกลากเลื่อนภาพ (Pan & Drag) และ Wheel Zoom
  * แก้ไขบั๊ก Candidate Auto-fill (ดึงเลขตู้, ท่าเรือ, ขนาด, DIS/LOAD อัตโนมัติ)
  * เพิ่มปุ่ม 1-คลิก `⚡ ดึงข้อมูลใบวางบิลนี้อัตโนมัติ`
  * เพิ่ม Badge ระบุตำแหน่ง `📌 แถวที่ #X` (ตาราง) และ `📄 บรรทัดที่ Y` (กระดาษ)
  * แก้ไขบั๊ก UUID Syntax Error และปรับระบบให้แก้ไขข้อมูลได้ถาวร (Persistent)
* ✅ **KPI Calculation:**
  * ปรับปรุงสูตร KPI ให้นับเฉพาะ `workflow_status === 'completed'` (แยกขาดจาก Pending)
  * ปรับข้อความบรรยายบน KPI การ์ดให้ชัดเจน (`ตรวจสอบแล้วและพบในใบวางบิล`, `⚠️ Missing`)
* ✅ **Layout & UI:**
  * ปรับ 5 KPI Cards ในหน้า OCR Container History ให้อยู่ในแถวเดียวพอดี (Single Row)
* ✅ **Multi-Filter System (เมนู Containers):**
  * เพิ่มตัวกรองรอบงาน (Batch), เบอร์รถ (Truck), ประเภทงาน (DIS/LOAD), ท่าเรือ (Port), ขนาด (Size), ไฟล์ตั้งต้น (Source File), และช่องค้นหา (Search Box)
  * ตัดคำว่า "ทุก" ในตัวเลือกเริ่มต้นของฟิลเตอร์ทั้งหมดเพื่อความกระชับ

---

## 🚀 6. แผนพัฒนาด่วนรอบถัดไป (Next Sprint - Priority #1)
* 🎯 **หน้ารายงานสรุปยอดตู้คู่ค้า (Partner Monthly Summary View):**
  * สร้าง View Component `PartnerSummaryView.jsx`
  * คำนวณยอดตู้รถร่วม (`ชนิดรถ = 'SUB'`) แยกตามช่วงวันที่ (1-15 และ 16-31), เบอร์รถ (501-513), และขนาดตู้ (20"/40") อัตโนมัติ 100%
  * รองรับการบันทึก "ตัดตู้ข้ามรอบ" และ "หมายเหตุ"
  * ส่งออก Excel ในรูปแบบตรงตามไฟล์แม่แบบ `5Jun69_template_สรุปคู่ค้าแต่ละเดือน.xltx`


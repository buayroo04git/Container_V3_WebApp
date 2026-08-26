# 📘 Container V3 WebApp - มาตรฐานระบบและบันทึกการปรับปรุง (System Conventions & Changelog)

เอกสารนี้รวบรวมมาตรฐานการออกแบบ UI/UX, กฎทางธุรกิจ (Business Rules), มาตรฐานดีไซน์ และบันทึกประวัติการปรับปรุงระบบ

---

## 🎨 1. มาตรฐาน UI & Wording (UI Conventions)

### 1.1 ปุ่มตัวกรอง (Filter Dropdowns)
* ❌ **ไม่ใส่คำว่า "ทุก..." ใน Option แรก:** ห้ามใช้คำว่า `ทุกรอบงาน`, `ทุกเบอร์รถ`, `ทุกประเภท`
* ✅ **ใช้ชื่อหัวข้อโดยตรงพร้อมไอคอน:**
  * 📁 `รอบงาน (Batch)`
  * 🚚 `เบอร์รถ`
  * 🏷️ `ประเภท (DIS/LOAD)`
  * ⚓ `ท่าเรือ`
  * 📐 `ขนาด`
* 💡 **ปุ่มล้างตัวกรอง (Auto-detect Clear Filter):** แสดงปุ่ม `✕ ล้างตัวกรอง` อัตโนมัติเฉพาะเมื่อมีฟิลเตอร์หรือคำค้นหาทำงานอยู่ (`hasActiveFilters`)

### 1.2 การ์ดสถิติ (KPI Summary Cards Layout)
* **Single-Row Layout:** ขนาดการ์ดกะทัดรัด (Min-width ~`160px - 170px`, Padding `10px 14px`, สูง ~`80px`) เพื่อให้การ์ดสรุป 4-5 ใบ **เรียงตัวพอดีใน 1 แถวเสมอ**
* **คำอธิบายใต้การ์ด Master DB:**
  * 🟢 **Matched:** `ตรวจสอบแล้วและพบในใบวางบิล`
  * 🔴 **Unmatched:** `ตรวจสอบแล้วและไม่พบในใบวางบิล`
  * ⚠️ **Missing:** หัวข้อการ์ดใช้ `⚠️ Missing`

### 1.3 มาตรฐานช่องค้นหา (Unified Search Box Standards)
* โครงสร้าง: `<div style={{ position: 'relative', width: '240px' }}>`
* ไอคอนแว่นขยาย: วางเป็น `<span>🔍</span>` ด้านซ้าย (`left: 10px`, `paddingLeft: 32px`, `pointerEvents: 'none'`)
* **ห้ามใส่ `🔍` ใน placeholder:** ช่องค้นหาใช้ placeholder สะอาดตา เช่น `'ค้นหา...' หรือ 'ค้นหาชื่อ/เบอร์รถ...'`
* มีปุ่มล้างคำค้นหาด่วน (`✕`) ด้านขวาเมื่อมีข้อความค้นหา

---

## 📊 2. มาตรฐานการจัดตาราง & เซลล์ (Universal Table Tokens)

* **ความกว้างตาราง:** `width: '100%', minWidth: totalTableWidth || '100%', tableLayout: 'fixed'` พอดีกรอบตาราง 100%
* **Cell Padding:** `padding: '8px 10px'` สำหรับแถวตารางทั่วไป
* **การจัดแนวข้อความ (Text Alignment):**
  * 👈 **Left:** ข้อมูลข้อความ (ชื่อคนขับ, ท่าเรือ, หมายเหตุ)
  * ⏺️ **Center:** ลำดับ (`#`), เบอร์รถ, วันที่, ป้ายสถานะ (`Badges`), ปุ่มจัดการ (`Actions`)
  * 👉 **Right:** ตัวเลขสถิติ, ยอดเงิน, ค่ารอบ, ฐานเงินเดือน
* **เลขตู้คอนเทนเนอร์:** ใช้ฟอนต์ Monospace หนา (`'SF Mono', Consolas, monospace`, `fontWeight: 700`)
* **ป้าย DIS / LOAD:**
  * 📥 **DIS (สีฟ้า):** `background: '#f0f9ff'`, `color: '#0369a1'`, `border: '1px solid #bae6fd'`
  * 📤 **LOAD (สีส้ม):** `background: '#fff7ed'`, `color: '#c2410c'`, `border: '1px solid #fed7aa'`

---

## 📝 3. บันทึกประวัติการปรับปรุง (Changelog Summary)

### 🗓️ 2026-08-26
* 🚀 **อัปเกรดแบรนด์ระบบเป็น `Container V3 PRO MAX`:**
  * ปรับ Badge ส่วนหัวเมนูบาร์เป็น **`Container V3` `PRO MAX`** พร้อมดีไซน์ Gradient และขอบสีน้ำเงินพรีเมียม
  * อัปเดตชื่อ Title บน Browser Tab เป็น `<title>Container V3 Pro MAX</title>`
* 💾 **ระบบจดจำงวดเดือนข้ามเมนูอัตโนมัติ (Persistent & Synchronized Month Filtering):**
  * พัฒนา Hook `useActiveMonth.js` จัดเก็บเดือนที่เลือกลง `localStorage` (`app_selected_month`) พร้อมระบบ Event Bus `app_month_changed` ซิงค์ข้อมูลแบบ Real-time
  * เมื่อผู้ใช้เลือกดูเดือนใดก็ตาม (เช่น เมษายน `2026-04`) ในหน้าใดก็ตาม แล้วสลับไปเมนูอื่น หรือกลับมาใหม่ ระบบจะยังคงจดจำและแสดงผลเดือนเมษายนต่อเนื่องทันที ไม่ต้องเลือกใหม่ซ้ำซ้อน
* 🔄 **ระบบฟิลเตอร์งวดเดือนมาตรฐาน (Unified MonthPicker Date Period Filtering):**
  * นำ `MonthPicker` (ปุ่มเลื่อนเดือน ◀ ▶ + เมนูดรอปดาวน์เลือกปี-เดือนภาษาไทย + ปุ่ม 'ทุกเดือน') มาใช้งานเป็นมาตรฐานเดียวกันทุกเมนูในระบบ:
    * `DatabaseView.jsx` (Containers / Master DB ใบวางบิล) & `ContainerTableToolbar.jsx`: กรองตู้ตามเดือนทำงาน (`date_job_parsed`, `date_job`, `batch_name`)
    * `TruckExpensesView.jsx` (ค่าใช้จ่ายรถ & น้ำมัน): เปลี่ยนจาก Date Input คู่เป็น `MonthPicker` ที่เชื่อมโยงกับฐานข้อมูล Supabase ตามช่วงเดือนอัตโนมัติ
    * `DriverPayrollView.jsx` (ผลงานคนขับ Tab 1): กรองงวดรอบวิ่งตู้และคำนวณค่าตอบแทนตามงวดเดือนที่เลือก
    * `BatchManagerView.jsx` (Completed Job Sheets): กรองใบงานตามงวดเดือน และนำช่อง `<input type="month">` เดิมที่ซ้ำซ้อนออก
    * `OcrContainerHistoryView.jsx` (ประวัติตู้ OCR): กรองประวัติตู้ตามงวดเดือน
    * `TruckOperationsView.jsx` (ประวัติการขับขี่รถ/คนขับ): กรองงวดการขับขี่ตามงวดเดือน
    * `TruckMaintenanceView.jsx` (ประวัติการซ่อมบำรุง): กรองประวัติการเข้าซ่อมตามงวดเดือน
    * `DriverLeavesView.jsx` (ประวัติการลางานคนขับ): กรองประวัติการลาตามงวดเดือน
    * `ExecutiveDashboardView.jsx` (ผลประกอบการรถ) & `DriverIncomeSummaryView.jsx` (สรุปรายได้คนขับ): ซิงค์งวดเดือนอัตโนมัติ
* 📐 **ปรับปรุง Responsive Layout และแก้ไขปัญหาการเว้นช่องว่างด้านบนหัวตาราง:**
  * ล็อกการ์ด KPI ให้เป็นแบบ Fixed 4 คอลัมน์ (`repeat(4, minmax(0, 1fr))`) ใน `BatchManagerView` เพื่อป้องกันการแตกแถวเป็น 2 ชั้นเมื่อหน้าจอไม่ได้เปิดแบบ Full Screen
  * ปรับโครงสร้าง Table Toolbar ให้ลื่นไหลเป็นธรรมชาติ (Natural Flow) ป้องกันการเกิดช่องว่างด้านหน้าตัวกรอง
  * ปรับขนาดช่องค้นหาให้กะทัดรัด (180px) พอดีกับแถบเครื่องมือ
* ⚡ **Fleet Data Integrity Diagnostics & Auto-Heal:**
  * เพิ่มเครื่องมือตรวจสอบความสอดคล้องของข้อมูลรถ-คนขับ-งวดการขับขี่แบบเรียลไทม์ และระบบซ่อมแซมความสอดคล้องอัตโนมัติ (Auto-Heal) ในหน้า `SettingsView`
* 🛡️ **Loan Installment Metadata Fallback:**
  * รองรับการจัดเก็บ metadata ค่างวดเงินกู้ (`installments_total`, `installments_paid`, `installment_amount`) ใน Supabase Columns และ embedded fallback ใน `remark`
* 🧭 **ปรับปรุงโครงสร้างเมนูแดชบอร์ด & ปรับคำศัพท์มาตรฐาน (Dashboard Structure & Wording Refresh):**
  * เปลี่ยนชื่อหมวดหมู่หลัก: `ภาพรวมบริหาร` ➔ `แดชบอร์ด`
  * เปลี่ยนชื่อเมนูย่อยหลัก: `แดชบอร์ดภาพรวม` ➔ `ผลประกอบการรถ`
  * เพิ่มเมนูย่อยใหม่ในหมวดแดชบอร์ด: `สรุปรายได้คนขับ`
  * ปรับคำศัพท์แสดงผลทั่วทั้งระบบ: `เรทท่าเรือ` ➔ `ค่าเที่ยวท่าเรือ`, `ค่ารอบ (ค่าเที่ยว)` ➔ `ค่ารอบคนขับ`
  * ปรับมุมมองการจ่ายเงินในหน้าสรุปจ่ายคนขับ: `รวมรายรับทั้งหมด` ➔ `รวมยอดตั้งจ่ายก่อนหัก (Gross Payroll)`, `รวมยอดโอนสุทธิ` ➔ `รวมยอดโอนจ่ายจริงสุทธิ (Total Net Payable)`
* ⚡ **เพิ่มประสิทธิภาพฐานข้อมูล & การโหลดข้อมูลแดชบอร์ด (Database & Dashboard Performance Boost):**
  * สร้าง Database Indexes สำหรับ 4 ตารางหลัก (`container_records`, `truck_expenses`, `job_sheet_items`, `driver_advances`)
  * เคลียร์ข้อมูลเรทราคาซ้ำซ้อนและสร้าง Unique Index สำหรับ `port_billing_rates` ป้องกันการบันทึกเรทซ้ำ
  * ปรับปรุง Server-Side Date Filtering กรองข้อมูลเฉพาะงวดเดือนที่เลือก ลดขนาด Payload ข้าม Network ลงกว่า 90% โหลดแดชบอร์ดได้เร็วขึ้นอย่างมาก

### 🗓️ 2026-08-25
* 💵 **ศูนย์รวมรายได้คนขับแบบครบวงจร (Driver Payroll & Compensation Hub 5 Tabs):**
  * **แท็บ 1: 📦 สรุปค่ารอบตู้ & เงินพิเศษ:** คำนวณค่ารอบตามเรทขนาดตู้ + โบนัสขั้นบันไดตามจำนวนงานจริง
  * **แท็บ 2: 💵 ตั้งค่าเงินเดือน & เงินหัก:** ทะเบียนคนขับหลัก จัดการฐานเงินเดือนประจำ, ยอดหักประกันสังคม (875฿), ภาษีหัก ณ ที่จ่าย 3% พร้อมตัวกรองและการค้นหา
  * **แท็บ 3: 💸 รายการเบิกล่วงหน้า:** บันทึกและหักเงินเบิกค่าเที่ยว/เบิกเงินล่วงหน้า
  * **แท็บ 4: 📜 ประวัติการตัดจ่ายเงิน:** สมุดใบสำคัญจ่าย (Vouchers) บันทึกการจ่ายเงินพร้อมระบบ Rollback
  * **แท็บ 5: ⚙️ ตั้งค่าเรทราคา & เงินพิเศษ:** กำหนดช่วงเวลาเรทราคาตู้ 20/40/45 ฟุต และขั้นบันไดเงินพิเศษ (150-230 ตู้)
* 📐 **ปรับปรุงระบบตารางกลางสากล (Universal Table Framework):**
  * แก้ไขปัญหาคอลัมน์ `#` กว้างผิดปกติเวลารีเฟรช โดยตั้งค่า `autoFitOnMount = false` และล็อกขนาด `#` ที่ 45px
  * แก้ไขเส้นแบ่งหัวตารางให้มองเห็นชัดเจนทุกคอลัมน์ พร้อมระบบ Hover ไฮไลต์สีน้ำเงิน
  * ปรับแต่งตารางให้แผ่เต็มความกว้างขอบจอ 100% พอดีกรอบการ์ด ไม่มีช่องว่างแหว่ง

### 🗓️ 2026-08-24
* 🚚 **ระบบบันทึกค่าใช้จ่ายรถเบ็ดเสร็จ (Unified Truck Expenses):**
  * รวมค่าน้ำมัน, ซ่อมบำรุง, ค่าทางด่วน/ผ่านท่า, ค่างวดรถ, ประกัน/พ.ร.บ. และกองกลาง ในตาราง `truck_expenses`
  * ระบบอ่านไฟล์ Excel นำเข้าข้อมูลอัตโนมัติจากชีทรถทุกคัน (`parseExpenseExcelFile`)
* 💳 **ระบบตัดจ่ายเงินค่ารอบคนขับ & ป้องกันคิดเงินซ้ำ (Driver Payment Settlement):**
  * ตาราง `driver_payment_batches` และ Atomic RPCs `mark_driver_containers_paid_rpc`, `cancel_driver_payment_batch_rpc`

### 🗓️ 2026-08-23
* 💰 **ระบบคำนวณค่าตอบแทนคนขับ & เรทราคาตามช่วงเวลา (Driver Payroll Engine):**
  * เรทราคาตามขนาดตู้ (20/40/45) และช่วงเวลา (`start_date` ถึง `end_date`)
  * กฎ Strict Verified Completed Matching และ Date Lag Override
* 1️⃣ **1 Job Sheet = 1 Driver Consensus:** สิทธิ์ความเป็นเจ้าของงานยึดตามใบงานเป็นหลัก 100%

### 🗓️ 2026-08-22
* 🔄 **ระบบมอบหมายงานรถ/คนขับด่วนผ่านหน้าตาราง (Quick Operation Assignment):**
  * Interactive Selector ในหน้า `TrucksView` และ `DriversView`
  * ปิดงวดเดิมอัตโนมัติแบบ Seamless Transition (`end_date = startDate - 1 วัน`)

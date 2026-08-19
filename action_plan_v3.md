# Container OCR WebApp (V3) - Action Plan & Roadmap

> **สถานะปัจจุบัน:** 
> - หมวด `📄 ใบงาน (Job Sheets)` เสร็จสมบูรณ์ 100% พร้อมระบบโหลดคู่ขนานความเร็วสูง
> - หมวด `📦 Containers (Reconciliation & Master DB)` เสร็จสมบูรณ์ 100% พร้อมระบบโหลดคู่ขนานความเร็วสูง
> - หมวด `🚚 รถและคนขับ (Truck & Driver Management)` พัฒนาและปรับปรุง DB Schema V2.3 (Foreign Keys, Cascade, Triggers, RPCs, Automated Tests) เสร็จสมบูรณ์ 100%
> - หมวด `🌐 Cloud Deployment & CI/CD`: ขึ้นระบบโปรดักชันบน **Vercel** (`buayroo04git/Container_V3_WebApp`) สำเร็จ 100%
> **อัปเดตล่าสุด:** 20 สิงหาคม 2026 (00:30 น.)

---

## 🎯 แผนพัฒนาเมนูและฟีเจอร์ถัดไป (Upcoming Milestones)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          ROADMAP & MILESTONES                          │
├────────────────────────────────────────────────────────────────────────┤
│ ✅ Milestone 1: 🚚 ทะเบียนรถ & ข้อมูลคนขับ (Truck & Driver Management)    │
│ 🚀 Milestone 2: 💰 ระบบบันทึกค่าใช้จ่ายรถ (Truck Expenses Management)    │
│ 🚀 Milestone 3: ⛽ ระบบบันทึกค่าน้ำมัน & ซ่อมบำรุง (Fuel & Maintenance)    │
│ 🚀 Milestone 4: 📈 แดชบอร์ดสรุปผลประกอบการรายรอบ (Financial Summary)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 รายละเอียดแผนงานรายโมดูล (Detailed Action Plan)

### 🚚 Milestone 1: ทะเบียนรถ & ข้อมูลคนขับ (Truck & Driver Management) — [เสร็จสมบูรณ์ 100%]
- [x] **1.1 Database Schema (Supabase SQL):**
  - ตาราง `truck_records` (id, truck_no, truck_license, truck_type, truck_kind, brand, status, assigned_driver_name, tax_expiry_date, act_expiry_date, insurance_expiry_date, remark)
  - ตาราง `driver_records` (id, driver_name, phone, id_card, license_no, license_type, license_expiry_date, assigned_truck_no, status, rate_per_trip, start_date, emergency_contact, remark)
  - สร้าง B-Tree Indexes และ RLS Policies อนุญาต Read/Write ครบถ้วน
- [x] **1.2 Service Layer (`src/services/truckDriverService.js`):**
  - ฟังก์ชัน CRUD ข้อมูลรถและคนขับครบวงจร
  - ระบบ Two-way Automatic Sync: ผูกคนขับกับรถประจำ (Assigned Truck <-> Assigned Driver) อัตโนมัติ
  - ระบบ Live Enrichment ดึงยอดเที่ยววิ่งจริงและจำนวนตู้จริงจาก `job_sheets` มารวมให้อัตโนมัติ
  - ฟังก์ชัน Bulk Upsert สำหรับนำเข้าไฟล์ Excel
- [x] **1.3 UI Views (Universal Table Blueprint):**
  - `src/views/TrucksView.jsx` (🚛 ข้อมูลรถประจำการ): KPI 4 ใบ + ตัวกรองสถานะ/ประเภทรถ + ตาราง Universal Flexbox + Import/Export Excel
  - `src/views/DriversView.jsx` (👤 ทะเบียนพนักงานขับรถ): KPI 4 ใบ + ตัวกรองสถานะ/ใบขับขี่ + ตาราง Universal Flexbox + Import/Export Excel
- [x] **1.4 Modals (เพิ่ม/แก้ไข):**
  - `src/components/trucks/TruckModal.jsx`
  - `src/components/drivers/DriverModal.jsx`
- [x] **1.5 Navigation Registration:**
  - ลงทะเบียนใน `src/config/navigationConfig.js` ภายใต้หมวด `🚚 รถและคนขับ` (Sub-menus: `ข้อมูลรถ (Trucks)` + `ข้อมูลคนขับ (Drivers)`)
- [x] **1.6 คำนวณยอด `จำนวนงาน (งาน)` จากประวัติ OCR จริง:**
  - เปลี่ยนคอลัมน์และคำนวณเป็น **`จำนวนงาน (งาน)`** (1 ตู้ = 1 งานจริง)
  - **กฎการนับ:** นับตามจำนวนรายการงานที่เกิดขึ้นจริง (หากเลขตู้เดิมถูกวิ่งซ้ำในหลายรอบงาน/หลายเที่ยว ให้นับแยกเป็นคนละงาน)
  - เชื่อมโยงข้อมูลสรุปจาก `job_sheets` (และ fallback `ocr_records`) เข้าสู่หน้าจอ `TrucksView` และ `DriversView` แบบเรียลไทม์ พร้อมการ์ดสรุป KPI และ Export Excel ครบถ้วน
- [x] **1.7 Database Integrity Polish & Automated Test Suite (V2.3):**
  - เพิ่ม Foreign Keys (`ON UPDATE CASCADE`), CHECK Constraints บนสถานะทุกตาราง
  - ติดตั้ง Triggers คำนวณค่าซ่อมบำรุงอัตโนมัติ (`cost_total`) และอัปเดต `updated_at` อัตโนมัติ
  - เพิ่มพารามิเตอร์ `p_created_by` ให้กับ Stored Procedures (`assign_driver_to_truck_rpc` / `unassign_driver_truck_rpc`)
  - สร้างชุดทดสอบอัตโนมัติ `test_truck_driver_db.js` (ผลทดสอบ 18/18 ผ่าน 100%)
- [x] **1.8 Cloud Deployment, CI/CD & Performance Tuning:**
  - ปรับระบบโหลดข้อมูลแบบคู่ขนาน (`Promise.all`) ลดเวลารอเหลือ < 400ms
  - ระบบ Sanitization & Validation ล้าง `\n`, `\r` จาก Environment Variables ป้องกัน Header Invalid Value Error
  - ลบ Hardcoded Secrets ออกจากโค้ด 100% ดึงผ่าน Vercel Environment Variables
  - ปรับตรรกะคำนวณวันลา (`expected_end_date`) และซิงค์ขึ้น Vercel สำเร็จสมบูรณ์

---

### 💰 Milestone 2: ระบบจัดการค่าใช้จ่ายรถ (Truck Expenses)
- [ ] **2.1 Database Schema (Supabase):**
  - ออกแบบตาราง `truck_expenses` (id, date, truck_no, batch_name, expense_type, amount, vat, slip_url, created_by, remark)
- [ ] **2.2 Service Layer (`src/services/truckExpenseService.js`):**
  - ฟังก์ชัน CRUD ข้อมูลค่าใช้จ่าย
  - ฟังก์ชันสรุปยอดค่าใช้จ่ายแยกตามเบอร์รถ และแยกตามรอบงาน
- [ ] **2.3 UI View (`src/views/TruckExpenseView.jsx`):**
  - ใช้ **Universal Table Blueprint** จาก [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md)
  - การ์ดสรุปยอดด้านบน (Total Expenses, แยกตามประเภทค่าใช้จ่าย)
  - แถบกรองข้อมูล (รอบงาน, เบอร์รถ, ช่วงวันที่, ประเภทค่าใช้จ่าย)
- [ ] **2.4 Import / Export & Slip Attachment:**
  - นำเข้า/ส่งออกไฟล์ Excel และแนบรูปสลิป

---

### ⛽ Milestone 3: ระบบบันทึกค่าน้ำมันและซ่อมบำรุง (Fuel & Maintenance)
- [ ] **3.1 Database Schema (Supabase):**
  - ตาราง `fuel_logs` (truck_no, date, odometer, liters, total_price, gas_station, slip_url)
  - ตาราง `maintenance_logs` (truck_no, date, service_type, cost, garage_name, next_service_due)
- [ ] **3.2 AI Slip OCR (Gemini Vision):**
  - ถ่ายรูป/อัปโหลดสลิปค่าน้ำมัน ดึงยอดเงินและจำนวนลิตรเข้าตารางอัตโนมัติ
- [ ] **3.3 UI Views:**
  - หน้ารายการเติมน้ำมัน + คำนวณอัตราสิ้นเปลือง (กม./ลิตร)
  - หน้าแจ้งเตือนการบำรุงรักษาตามรอบไมล์/เวลา

---

## 🛠️ แนวทางและมาตรฐานการพัฒนา (Development Standards)
1. **Single Source of Truth:** สถาปัตยกรรม, กฎเหล็ก RLS, โค้ดสี, ลำดับโมเดล AI, และพิมพ์เขียว UI ทั้งหมด ให้อ้างอิงจาก [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md) เสมอ
2. **Pluggable Architecture:** ทุกเมนูใหม่ให้พัฒนาเป็น View อิสระใน `src/views/` และลงทะเบียนผ่าน `src/config/navigationConfig.js` โดยไม่แก้ไข Router กลาง
3. **Build & Quality Assurance:** รัน `npm run build` ตรวจสอบความถูกต้องของโค้ดทุกครั้งก่อนส่งมอบงาน

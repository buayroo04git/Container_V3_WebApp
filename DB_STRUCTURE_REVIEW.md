# สรุปโครงสร้าง Database & Stored Procedures (Supabase PostgreSQL)

อัปเดตล่าสุด: 2026-08-25

---

## 🗄️ 1. รายชื่อตารางในระบบ (Database Tables)

### กลุ่มที่ 1: OCR & Master Container (ใบงาน & ใบวางบิล)
- **`container_records`**: Master DB ใบวางบิล (34 คอลัมน์, Single Source of Truth ของยอดงานที่รถต้องวิ่ง)
- **`job_sheets`**: หัวใบงานที่สแกนและตรวจเสร็จสมบูรณ์แล้ว (1 ใบ = 1 แถว)
- **`job_sheet_items`**: รายการตู้ย่อยในแต่ละใบงาน (1-25 แถว, มี `ref_master_id` ชี้ตรงไปที่ `container_records.id`)
- **`ocr_cache`**: คิวรูปภาพและผลสแกน AI ระหว่างรอตรวจ
- **`ocr_records`**: ตารางประวัติการสแกนสำรอง (Legacy Archive)

### กลุ่มที่ 2: Fleet & Drivers (รถและคนขับ)
- **`truck_records`**: ทะเบียนรถ, สภาพรถ, สถานะ (`active`, `maintenance`, `inactive`)
- **`driver_records`**: ทะเบียนคนขับ, สถานะ, ฐานเงินเดือน (`base_salary`), รูปแบบภาษี/สปส. (`tax_profile`), ยอดหัก สปส. (`social_security_amount`)
- **`truck_operations`**: งวดการขับขี่และการมอบหมายรถ-คนขับ (Single Source of Truth ของการมอบหมาย)
- **`driver_truck_history`**: Audit Trail บันทึกประวัติการเปลี่ยนตัวคนขับ/ส่งซ่อม/ลางาน
- **`truck_maintenance_records`**: สมุดบันทึกประวัติค่าซ่อมบำรุงและอะไหล่
- **`driver_leave_records`**: สมุดบันทึกประวัติการลางาน

### กลุ่มที่ 3: Payroll & Expenses (การเงิน & ค่าใช้จ่าย)
- **`driver_rate_configs`**: ช่วงเวลาเรทค่ารอบแยกตามขนาดตู้ (20, 40, 45 ฟุต)
- **`driver_incentive_configs`**: ตารางขั้นบันไดเงินพิเศษตามจำนวนงาน (150-230 ตู้)
- **`driver_advances`**: ประวัติการเบิกเงินล่วงหน้า / เบิกค่าเที่ยว
- **`driver_payment_batches`**: สมุดใบสำคัญจ่ายค่ารอบคนขับ (Payment Vouchers)
- **`truck_expenses`**: สมุดบันทึกค่าใช้จ่ายรถรวม 17 คอลัมน์ (ตัดคอลัมน์ซ้ำซ้อนออกทั้งหมด: รวมยอดเงินเป็น `amount_total`, รองรับหมวดหมู่ `salary` เงินเดือน/ค่ารอบ, `fuel`, `maintenance`, `toll_port`, `installment`, `tax_insurance`, `misc` อื่นๆ)

---

## ⚡ 2. รายชื่อ Stored Procedures (Atomic RPCs)

1. **`complete_job_sheet_rpc`**: บันทึกหัวใบงาน, รายการตู้ 25 แถว, อัปเดตแคช และตัดยอดตู้ใน Transaction เดียว
2. **`assign_driver_to_truck_rpc`**: มอบหมายคนขับประจำรถ, ปิดงวดเดิมอัตโนมัติแบบ Seamless, บันทึกประวัติลง Audit Log
3. **`unassign_driver_truck_rpc`**: ปลดคนขับออกจากรถ พร้อมบันทึกลง Audit Log
4. **`mark_driver_containers_paid_rpc`**: ตัดจ่ายเงินค่ารอบคนขับ สร้างใบสำคัญจ่าย และล็อกสถานะตู้เป็น `paid`
5. **`cancel_driver_payment_batch_rpc`**: ยกเลิกใบสำคัญจ่าย และย้อนคืนสถานะตู้กลับเป็น `unpaid`

---

## 🛡️ 3. มาตรฐานความปลอดภัยและ Data Integrity
- **Foreign Key Cascade/Restrict:** ป้องกัน Orphaned Records และป้องกันการเผลอลบข้อมูล Master ที่มีประวัติเชื่อมโยง
- **Atomic Operations:** ทุกการเปลี่ยนแปลงที่กระทบ >= 2 ตาราง ทำงานผ่าน RPC Transaction เดียว
- **RLS Soft-Deletion:** ไม่ใช้ `DELETE` บนตารางแคช ใช้ Soft-Update เพื่อความปลอดภัย

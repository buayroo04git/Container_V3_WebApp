# สรุปรีวิวโครงสร้าง Database & สถานะการปรับปรุง

วันที่รีวิว: 2026-08-20 (อัปเดตล่าสุด: 2026-08-20 14:40 น.)

## ภาพรวม & สถานะความคืบหน้า

โครงสร้างฐานข้อมูลของโปรเจกต์นี้แยกโดเมนหลักออกเป็น 2 กลุ่มชัดเจน:

1. กลุ่ม OCR / Container
   - `container_records`: Master DB ฝั่งใบวางบิล
   - `job_sheets`: หัวใบงานที่ตรวจเสร็จ
   - `job_sheet_items`: รายการตู้ในแต่ละใบงาน
   - `ocr_cache`: คิว/แคช OCR ระหว่างรอตรวจ
   - `ocr_records`: ตาราง legacy/archive สำรอง

2. กลุ่ม Fleet / Driver
   - `truck_records`: ข้อมูลรถ
   - `driver_records`: ข้อมูลคนขับ
   - `truck_operations`: งวดการขับขี่และการมอบหมายรถ-คนขับ
   - `driver_truck_history`: ประวัติ/audit timeline
   - `truck_maintenance_records`: ประวัติซ่อมบำรุง
   - `driver_leave_records`: ประวัติการลา

---

## 📊 สถานะการแก้ไขและยกระดับระบบ (Update Status)

### 1. หมวด Master Container / ใบวางบิล
- [x] **✅ [จัดการแล้ว] Data Normalization วันที่:** แปลงวันที่ทุกรูปแบบจาก Excel เป็นมาตรฐาน `YYYY-MM-DD` (`normalizeExcelDate`) ทั้งหมด
- [x] **✅ [จัดการแล้ว] กำหนดรอบงาน (Batch) รายตู้:** ตู้แต่ละตู้ใน Master DB มี `batch_name` ของตัวเอง 100% ตามไฟล์วางบิล Excel
- [ ] **⏳ [รอทำ] รวมไฟล์ Migration เต็ม:** สร้างไฟล์ `01_initial_ocr_master_schema.sql` รวบรวม DDL เริ่มต้นของกลุ่ม OCR ให้ครบชุด

---

### 2. หมวด OCR / Job Sheets
- [x] **✅ [จัดการแล้ว] Atomic Transaction บันทึกใบงาน:** สร้าง Stored Procedure `complete_job_sheet_rpc` บันทึกทั้ง Header, Detail Items, Archive, และ Cache ใน Transaction เดียว (All-or-Nothing) ป้องกันใบงานไร้ไส้
- [x] **✅ [จัดการแล้ว] 1:1 Consumption Matching:** ตู้ที่จับคู่แล้วจะไม่ถูกนำมานับเบิ้ลซ้ำในรอบเดียวกัน
- [x] **✅ [จัดการแล้ว] แก้บั๊ก `masterMap` ใน Auto-Reconcile:** แก้ไขฟังก์ชันค้นหาให้สมบูรณ์ ไม่มี Error หยุดชะงัก
- [ ] **⏳ [รอทำ] เพิ่ม Foreign Key:** ผูก FK `job_sheet_items.job_sheet_id -> job_sheets.id (CASCADE)` และ `ref_master_id -> container_records.id (SET NULL)`
- [ ] **⏳ [รอทำ] ลด Payload `.select('*')` บน `ocr_cache`:** ปรับให้ดึงเฉพาะ Metadata ตอนแสดงหน้ารวมคิว

---

### 3. หมวด Truck / Driver Master
- [x] **✅ [จัดการแล้ว] ป้องกันการนับยอดเบิ้ล (`fetchTrucks` & `fetchDrivers`):** ใช้ฟังก์ชันกลาง `calculateMatchedMasterIds` ตัดยอดแบบ 1:1
- [x] **✅ [จัดการแล้ว] Live Derived Driver/Truck:** ดึงข้อมูลคนขับและรถประจำปัจจุบันแบบ Live Real-time จาก `truck_operations` เสมอ
- [x] **✅ [จัดการแล้ว] Unique & Check Constraints:** มี Unique บน `truck_no`, `driver_name` และ CHECK บนสถานะ
- [—] **⚪ [ข้ามได้/ไม่จำเป็น] เปลี่ยนเป็น Surrogate UUID:** โครงสร้างปัจจุบันใช้ `truck_no`/`driver_name` คู่กับ `ON UPDATE CASCADE` ทำงานได้ดีและตรงกับงานจริง

---

### 4. หมวด Truck Operations
- [x] **✅ [จัดการแล้ว] Partial Unique Indexes:** เพิ่ม Index บังคับว่ารถ 1 คัน และ คนขับ 1 คน มี active operation ได้เพียง 1 แถว ณ เวลาเดียวกัน (`unique_active_truck_op`, `unique_active_driver_op`)
- [x] **✅ [จัดการแล้ว] Stored Procedures:** มี RPC สำหรับ assign/unassign แบบ Atomic

---

### 5. หมวด Assignment History / Audit Trail
- [x] **✅ [จัดการแล้ว] แยก Event Log อิสระ:** `driver_truck_history` คงอยู่ถาวรแยกจากตาราง Master
- [ ] **⏳ [รอทำ] เพิ่ม Check Constraint บน `action`:** กำหนดให้รับเฉพาะ `'ASSIGN'`, `'UNASSIGN'`, `'TRANSFER'`, `'MAINTENANCE'`, `'LEAVE'`

---

### 6. หมวด Maintenance / Leave
- [x] **✅ [จัดการแล้ว] แยก Ledger อิสระ:** ตารางซ่อมบำรุงและลางานแยกเป็นเอกเทศ ไม่กวนสถานะรถ
- [x] **✅ [จัดการแล้ว] Trigger คำนวณ `cost_total` อัตโนมัติ:** รวมยอดค่าแรง+ค่าอะไหล่อัตโนมัติ
- [ ] **⏳ [รอทำ] Validation Constraints:** เพิ่ม `CHECK (end_date IS NULL OR end_date >= start_date)` และ `CHECK (cost_parts >= 0 AND cost_labor >= 0)`

---

### 7. Security / RLS
- [—] **⚪ [ข้ามตาม Business Requirement]:** คงสิทธิ์ Zero-login สำหรับ Inspectors หน้างาน เพื่อความคล่องตัวในการทำงานของสาขาชลบุรี

---

## 🎯 สรุปสิ่งที่เหลือให้เลือกทำต่อ (Remaining Action Items)

| ลำดับ | รายการที่เหลือ | ประโยชน์ | ความเร่งด่วน |
| :---: | :--- | :--- | :---: |
| **1** | สร้างไฟล์ Migration เต็ม `01_initial_ocr_master_schema.sql` (รวม DDL, FK ของกลุ่ม OCR) | มีประวัติ Schema สำหรับกู้คืนหรือ Deploy ฐานข้อมูลใหม่ได้ 100% | ปานกลาง |
| **2** | รัน SQL เพิ่ม Check Constraints ให้ Maintenance, Leaves, Audit Action | ป้องกันข้อมูลติดลบ หรือวันที่สิ้นสุดมาก่อนวันที่เริ่ม | ปานกลาง |
| **3** | ปรับ `fetchPendingJobSheets()` ให้เลิกดึง Base64 ตอนโหลดหน้ารวมคิว | โหลดหน้าแรกและคิวสแกนเร็วขึ้น 3-5 เท่า | แนะนำ |

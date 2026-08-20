# สรุปรีวิวโครงสร้าง Database

วันที่รีวิว: 2026-08-20

## ภาพรวม

โครงสร้างฐานข้อมูลของโปรเจกต์นี้ออกแบบมาถูกทางแล้ว โดยแยกโดเมนหลักออกเป็น 2 กลุ่มชัดเจน:

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

แนวคิดหลักดี โดยเฉพาะการแยก Master ใบวางบิลออกจากผล OCR และการให้ `truck_operations` เป็น Single Source of Truth ของการมอบหมายรถ-คนขับ แต่ยังมีจุดที่ควรปรับก่อนถือว่า production-grade

## คะแนนประเมินโดยรวม

ประมาณ 70-75% สำหรับระบบภายในที่ใช้งานจริงได้แล้ว

ยังไม่ควรถือว่าแข็งแรงเต็มที่สำหรับ production public app เพราะมีประเด็นเรื่อง RLS, foreign key, migration completeness, และข้อมูล derived ที่ยังถูกเขียนซ้ำหลายที่

## 1. หมวด Master Container / ใบวางบิล

### จุดที่ออกแบบดี

- `container_records` ถูกวางเป็น Master Source of Truth ของยอดงานทั้งหมดที่รถต้องวิ่ง
- มี index สำหรับ field สำคัญ เช่น `container_no`, `truck_no`, `batch_name`, `date_job`
- แนวคิด read-only master ดี ช่วยป้องกัน OCR ไปแก้ข้อมูลตั้งต้นโดยไม่ตั้งใจ

### จุดที่ควรปรับ

- ไม่พบ migration เต็มที่สร้าง `container_records` และ schema กลุ่ม OCR ทั้งหมด เห็นเฉพาะ migration เพิ่ม index
- ถ้า schema ถูกสร้างผ่าน Supabase Dashboard/manual SQL จะทำให้ deploy ใหม่หรือ restore ยาก
- `date_job` เป็น `text` ควรมี column วันที่แบบ normalized เพิ่ม เช่น `date_job_parsed DATE` สำหรับ report/filter จริง

## 2. หมวด OCR / Job Sheets

### จุดที่ออกแบบดี

- โครงสร้าง `job_sheets` แบบ header และ `job_sheet_items` แบบ detail เหมาะกับใบงาน 1 ใบมีหลายตู้
- `ref_master_id` ใน `job_sheet_items` เป็นแนวทางที่ดีมาก เพราะเชื่อมกลับไป `container_records.id` ได้ชัดเจน
- รองรับตู้แดงได้ด้วย `ref_master_id = NULL`
- `ocr_records` ถูกลดบทบาทเป็น archive/backup ไม่ใช่ฐานคำนวณ KPI หลัก

### จุดที่ควรปรับ

- ควรมี foreign key จริง:
  - `job_sheet_items.job_sheet_id -> job_sheets.id`
  - `job_sheet_items.ref_master_id -> container_records.id`
- การบันทึกจบงานมีการ delete/insert หลายตารางจาก client-side ถ้ากลางทาง fail อาจเกิดข้อมูลครึ่งชุด ควรย้ายเป็น RPC transaction
- มีหลายจุดใช้ `.select('*')` กับ `ocr_cache` ซึ่งเสี่ยงโหลด payload หนัก ควร select เฉพาะ column ที่ใช้

## 3. หมวด Truck / Driver Master

### จุดที่ออกแบบดี

- `truck_records` และ `driver_records` มีข้อมูลพื้นฐานครบ
- มี unique constraint บน `truck_no` และ `driver_name`
- มี check constraint สำหรับ status
- มีข้อมูล expiry date ที่เหมาะกับงาน fleet เช่น ภาษี, พ.ร.บ., ประกัน, ใบขับขี่

### จุดที่ควรปรับ

- ใช้ `truck_no` และ `driver_name` เป็น foreign key แทน `truck_id` / `driver_id` ทำให้เปราะหากเปลี่ยนชื่อคนขับหรือรูปแบบเบอร์รถ
- `assigned_driver_name` และ `assigned_truck_no` เป็นข้อมูล derived แต่ยังถูกเขียนซ้ำหลายจุด ควรลดการพึ่งพาให้เหลืออ่านจาก `truck_operations` เป็นหลัก

## 4. หมวด Truck Operations

### จุดที่ออกแบบดี

- เป็นหมวดที่คิดมาดีที่สุดในแง่ business workflow
- `truck_operations` ถูกใช้เป็น Single Source of Truth ของการมอบหมายรถ-คนขับ
- มี `start_date`, `end_date`, `status`, `operation_type` ครบสำหรับทำ timeline
- มี RPC สำหรับ assign/unassign แบบ atomic

### จุดที่ควรปรับ

- ควรเพิ่ม partial unique index เพื่อบังคับว่า:
  - รถ 1 คันมี active operation ได้แค่ 1 แถว
  - คนขับ 1 คนมี active operation ได้แค่ 1 แถว
- ตอนนี้ยังมี fallback ที่เขียนหลายตารางจาก client ถ้า RPC fail ทำให้ consistency อาจไม่แน่นเท่า transaction เดียว
- LocalStorage fallback มีประโยชน์ แต่ต้องระวัง sync กลับขึ้น Supabase แล้วทับข้อมูลจริง

## 5. หมวด Assignment History / Audit Trail

### จุดที่ออกแบบดี

- แยก `driver_truck_history` เป็น event log ออกจาก state ปัจจุบัน ถูกต้องสำหรับ audit
- มี field สำคัญ เช่น `action`, `reason`, `effective_date`, `operation_id`, `created_by`
- ช่วยดู timeline ย้อนหลังได้ดี

### จุดที่ควรปรับ

- ควรมี check constraint สำหรับ `action` เพื่อกันค่าสะกดผิด
- ควรมี FK จาก `operation_id` ไป `truck_operations.id` ถ้าต้องอ้างอิง operation จริง
- ถ้าจะใช้เป็น audit trail จริง ไม่ควรลบ hard delete ได้ง่าย ควรใช้ soft delete หรือจำกัดสิทธิ์

## 6. หมวด Maintenance / Leave

### จุดที่ออกแบบดี

- แยก ledger ซ่อมบำรุงและการลาออกจาก master status ถูกต้อง
- มีข้อมูลที่จำเป็นครบ เช่น วันที่เริ่ม/จบ, ค่าใช้จ่าย, อู่, ประเภทการลา, จ่าย/ไม่จ่ายค่าจ้าง
- มี trigger คำนวณ `cost_total`

### จุดที่ควรปรับ

- `id` เป็น `TEXT` ที่สร้างจาก client ควรพิจารณาเปลี่ยนเป็น `UUID DEFAULT gen_random_uuid()`
- ควรเพิ่ม validation:
  - `end_date >= start_date`
  - cost ไม่ติดลบ
  - mileage ไม่ติดลบ
- FK แบบ `ON DELETE CASCADE` อาจทำให้ลบรถ/คนขับแล้วประวัติซ่อมหรือการลาหายตาม ถ้าต้องเก็บ audit/report ระยะยาวควรใช้ `RESTRICT` หรือ soft delete master แทน

## 7. Security / RLS

### จุดที่ต้องระวังมากที่สุด

ตอนนี้ migration เปิด RLS แต่ policy ให้ `anon` และ `authenticated` ทำได้ทั้งหมด:

```sql
FOR ALL TO anon USING (true) WITH CHECK (true)
FOR ALL TO authenticated USING (true) WITH CHECK (true)
```

ถ้าแอป deploy public และใช้ Supabase anon key บน frontend ผู้ที่รู้ endpoint/key อาจ read/write/delete ข้อมูล fleet, driver, maintenance, leave ได้ทั้งหมด

### ข้อเสนอแนะ

- แยก policy read/write/delete ตาม role
- อย่างน้อยควรปิด write/delete สำหรับ `anon`
- ตาราง audit/history ควรเข้มกว่า table ทั่วไป
- ถ้ามีระบบ login ควรผูก policy กับ user role

## ลำดับความสำคัญที่แนะนำให้แก้

1. สร้าง migration เต็มสำหรับ schema กลุ่ม OCR:
   - `container_records`
   - `job_sheets`
   - `job_sheet_items`
   - `ocr_cache`
   - `ocr_records`
   - `column_aliases`

2. เพิ่ม FK จริงให้กลุ่ม OCR:
   - `job_sheet_items.job_sheet_id -> job_sheets.id`
   - `job_sheet_items.ref_master_id -> container_records.id`

3. เพิ่ม partial unique index ให้ `truck_operations`:
   - active operation ต่อรถได้แค่ 1
   - active operation ต่อคนขับได้แค่ 1

4. ปรับ RLS policy ไม่ให้ `anon` เขียน/ลบทุกตารางได้

5. ลด `.select('*')` โดยเฉพาะกับ `ocr_cache`

6. ระยะกลาง ค่อย migrate foreign key จาก `truck_no`/`driver_name` ไปใช้ `truck_id`/`driver_id`

## สรุปสุดท้าย

โครงสร้าง DB ของโปรเจกต์นี้ไม่ได้แย่ ตรงกันข้ามคือวาง domain model มาค่อนข้างดีแล้ว โดยเฉพาะ:

- การแยก Master ใบวางบิลกับใบงาน OCR
- การมี `job_sheet_items.ref_master_id`
- การใช้ `truck_operations` เป็น source หลักของการมอบหมาย
- การแยก history, maintenance, leave เป็น ledger ของตัวเอง

แต่จุดที่ควรรีบแก้คือความแข็งแรงของฐานข้อมูล ไม่ใช่หน้าตา schema:

- migration ยังไม่ครบ
- FK บางกลุ่มยังไม่ชัด
- RLS เปิดกว้างเกินไป
- active operation ยังไม่ได้ถูกบังคับด้วย DB constraint
- ยังมีการเขียนข้อมูล derived ซ้ำหลายตาราง

ถ้าแก้ 4 เรื่องแรกได้ โครงสร้างนี้จะพร้อมใช้งานระยะยาวขึ้นมาก

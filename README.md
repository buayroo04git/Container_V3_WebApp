# 🚚 Container OCR & Reconciliation WebApp (V3)

ระบบเว็บแอปพลิเคชันอัจฉริยะสำหรับสแกนใบงานคนขับรถบรรทุก (Truck Job Sheets) ด้วย AI (Google Gemini Vision), จับคู่เลขตู้คอนเทนเนอร์กับฐานข้อมูลงานหลัก (Master DB) แบบ Real-time, จัดการข้อมูลรอบงาน และสำรองไฟล์ขึ้น Google Drive อย่างเป็นระบบ

---

## ✨ คุณสมบัติหลัก (Key Features)

1. **AI Vision OCR (Google Gemini Fallback Hierarchy):**
   - รองรับการสแกนใบงานอัตโนมัติด้วย Multi-model Fallback (`gemini-3.7-flash` ➡️ `3.5` ➡️ `3.0` ➡️ `2.5` ➡️ `3.1-flash-lite` โควต้า 500 ครั้ง/วัน)
   - บีบอัดภาพผ่าน Canvas อัตโนมัติ สแกนได้คมชัดและรวดเร็ว
2. **ระบบตรวจเทียบและจัดตาราง 25 บรรทัดคงที่ (Fixed 25 Rows Standard):**
   - ตารางตรวจเทียบตรึงไว้ที่ 25 แถว (`#1` - `#25`) ตามแบบฟอร์มกระดาษจริง 1:1
   - แถวที่ไม่มีข้อมูลเปิดให้คลิกพิมพ์เพิ่มตู้ได้ทันที
   - ระบบ **Hover-to-Reveal Strikethrough (`🚫 ขีดฆ่า`)** สำหรับบรรทัดที่คนขับขีดฆ่ายกเลิกบนกระดาษ โดยไม่นับเป็นข้อผิดพลาด
   - การจัดแนว Monospace 1:1 ระหว่างช่องพิมพ์กับข้อความดิบ OCR
3. **สมองกลตรวจเทียบ 4 สี (Color Coding Matching Logic):**
   - 🟢 **ตรง 100% (Green):** เลขตู้ตรงเป๊ะ ยืนยันอัตโนมัติ (แสดงปุ่ม Candidate 1 ตัวกระชับ)
   - 🔵 **ใกล้เคียงสูง (Blue):** ความคล้าย $\ge 85\%$ แทนค่าและจับคู่อัตโนมัติ
   - 🟡 **ตัวแนะนำ (Yellow):** กรณีมีหลายงานในตู้เดียว (Duplicate) หรือมีตัวเลือกใกล้เคียงหลายตัว (คงข้อความดิบ OCR 100%)
   - 🔴 **ไม่พบใน DB (Red):** เลขตู้ไม่ตรงในฐานข้อมูล เปิดให้พิมพ์ค้นหาหรือสลับตู้ได้อิสระ
4. **ระบบแก้ไขตู้ค้างแยกเดี่ยว (Isolated Red Containers Editor):**
   - ในหน้าประวัติรอบงานที่บันทึกแล้ว มีปุ่ม `✏️ แก้ไขตู้ค้าง (N)` เพื่อแก้ไขเฉพาะตู้ที่ยังไม่พบใน DB โดยไม่กระทบตู้สีเขียวที่ยืนยันแล้ว
5. **Hybrid Cloud Storage & Zero Login Inspector:**
   - ผู้ตรวจงานทุกสาขาเปิดดูภาพและตรวจงานได้ทันทีผ่าน Supabase Data URL โดยไม่ต้องล็อกอิน Google
   - ผู้อัปโหลดงานสามารถเชื่อมต่อ Google Drive API เพื่อจัดระเบียบไฟล์เข้าโฟลเดอร์แยกตามรอบงานและเบอร์รถโดยอัตโนมัติ
6. **ระบบบริหารจัดการรถและคนขับ (Fleet & Driver Management V2.3):**
   - จัดการทะเบียนรถ, ประวัติพนักงานขับรถ, งวดการขับขี่ และประวัติการครองรถแบบ Real-time
   - ระบบคำนวณค่าซ่อมบำรุงและประวัติการลางานอัตโนมัติด้วย Database Triggers & Atomic Stored Procedures
   - มีชุดทดสอบอัตโนมัติ `node test_truck_driver_db.js` ตรวจสอบความถูกต้องของระบบครบ 100%

---

## 🚀 วิธีการติดตั้งและรันโปรเจค (Getting Started)

```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. เริ่มต้นรัน Dev Server
npm run dev

# 3. หรือดับเบิลคลิกไฟล์ Batch เพื่อรันอัตโนมัติ
run_webapp.bat
```

---

## 🛠 Tech Stack
- **Frontend Framework:** React 19 + Vite
- **Database & Auth:** Supabase (PostgreSQL + RLS)
- **AI Engine:** Google Gemini API (v1beta)
- **Cloud Storage:** Google Drive API (v3)
- **Styling:** Custom Vanilla CSS + Glassmorphism UI

---

## 📖 คู่มือและกฎเหล็กการพัฒนา
ดูรายละเอียดเชิงลึก กฎเหล็กของสถาปัตยกรรม และแนวทางการพัฒนาต่อยอดได้ที่ [PROJECT_GUIDE.md](file:///C:/Users/AMD/Desktop/Container_V3_WebApp/PROJECT_GUIDE.md)

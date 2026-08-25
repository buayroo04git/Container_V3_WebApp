# Container OCR WebApp (V3) - Action Plan & Roadmap

> **สถานะปัจจุบัน:** 
> - ✅ หมวด `📄 ใบงาน (Job Sheets)` & `📦 Containers (Master DB)` เสร็จสมบูรณ์ 100%
> - ✅ หมวด `🚚 รถและคนขับ (Fleet & Driver Hub)` เสร็จสมบูรณ์ 100%
> - ✅ หมวด `💰 ค่าใช้จ่ายรถ (Unified Truck Expenses)` เสร็จสมบูรณ์ 100%
> - ✅ หมวด `💵 สรุปรายได้คนขับ (Driver Payroll Hub 5 Tabs)` เสร็จสมบูรณ์ 100%
> - ✅ หมวด `🌐 Cloud Deployment & CI/CD` บน Vercel เสร็จสมบูรณ์ 100%
> **อัปเดตล่าสุด:** 25 สิงหาคม 2026

---

## 🎯 แผนพัฒนาเมนูและฟีเจอร์ถัดไป (Milestones)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          ROADMAP & MILESTONES                          │
├────────────────────────────────────────────────────────────────────────┤
│ ✅ Milestone 1: 🚚 ทะเบียนรถ & ข้อมูลคนขับ (Truck & Driver Management)    │
│ ✅ Milestone 2: 💰 ตารางบันทึกค่าใช้จ่ายรถ & ค่าน้ำมัน (Unified Expenses)│
│ ✅ Milestone 3: 💵 ศูนย์รวมรายได้คนขับ (Driver Payroll Hub 5 Tabs)     │
│ 🚀 Milestone 4: 📈 แดชบอร์ดสรุปผลประกอบการรายรอบ (P&L Financial Hub)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 รายละเอียดแผนงานรายโมดูล (Detailed Status)

### 🚚 Milestone 1: ทะเบียนรถ & ข้อมูลคนขับ (Truck & Driver Hub) — [เสร็จสมบูรณ์ 100%]
- ตาราง `truck_records`, `driver_records`, `truck_operations`, `driver_truck_history`, `driver_leave_records`
- Live Derived driver/truck assignment พร้อม Atomic RPCs
- ระบบตรวจสอบวันลาอัตโนมัติและการบันทึกประวัติการครองรถ

### 💰 Milestone 2: ค่าใช้จ่ายรถและค่าน้ำมันเบ็ดเสร็จ (Unified Truck Expenses) — [เสร็จสมบูรณ์ 100%]
- ตาราง `truck_expenses` รวมค่าน้ำมัน, ซ่อมบำรุง, ผ่านท่า, ผ่อนรถ, ประกัน/พ.ร.บ.
- ระบบนำเข้าและแปลงไฟล์ Excel ค่าน้ำมัน/ค่าใช้จ่ายรถอัตโนมัติ (`parseExpenseExcelFile`)
- หน้ารายการค่าใช้จ่าย `TruckExpensesView.jsx` พร้อม 5 KPI Cards และการกรองขั้นสูง

### 💵 Milestone 3: ศูนย์รวมรายได้คนขับ (Driver Payroll Hub 5 Tabs) — [เสร็จสมบูรณ์ 100%]
- **Tab 1:** สรุปค่ารอบตู้ & เงินพิเศษ (คำนวณตามเรทขนาดตู้ + โบนัสขั้นบันได)
- **Tab 2:** ตั้งค่าเงินเดือน & เงินหัก (ฐานเงินเดือน, สปส. 875฿, ภาษี 3%)
- **Tab 3:** รายการเบิกล่วงหน้า (บันทึกและหักเงินเบิก)
- **Tab 4:** ประวัติการตัดจ่ายเงิน (สมุดใบสำคัญจ่าย Vouchers & Rollback)
- **Tab 5:** ตั้งค่าเรทราคา & เงินพิเศษ (ช่วงเวลาเรทตู้ 20/40/45 และขั้นบันได 150-230)

### 📈 Milestone 4: แดชบอร์ดสรุปผลประกอบการรายรอบ (Financial & Operations P&L Hub) — [เป้าหมายถัดไป]
- [ ] **4.1 Monthly P&L Aggregator:**
  - เชื่อมโยงรายรับจาก `job_sheets` (ค่าตู้) ปะทะ ค่าใช้จ่ายรถ (`truck_expenses`) และค่ารอบคนขับ (`driver_payroll`)
- [ ] **4.2 Executive Profit & Loss Dashboard:**
  - กราฟและตารางสรุปกำไร-ขาดทุนสุทธิแยกรายคันและภาพรวมบริษัท

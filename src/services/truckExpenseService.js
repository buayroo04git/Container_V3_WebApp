import { supabase } from '../supabaseClient.js';
import * as XLSX from 'xlsx';
import { normalizeExcelDate } from '../utils/matchingLogic.js';

const STORAGE_KEY = 'fleet_truck_expenses_v1';

export const EXPENSE_CATEGORIES = {
  fuel: {
    id: 'fuel',
    label: 'ค่าน้ำมัน',
    icon: '⛽',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe'
  },
  maintenance: {
    id: 'maintenance',
    label: 'ซ่อมบำรุง & อะไหล่',
    icon: '🔧',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a'
  },
  toll_port: {
    id: 'toll_port',
    label: 'ค่าผ่านทาง / ผ่านท่า',
    icon: '🛣️',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0'
  },
  installment: {
    id: 'installment',
    label: 'ค่างวดรถ & หาง',
    icon: '💳',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe'
  },
  tax_insurance: {
    id: 'tax_insurance',
    label: 'ภาษี & พ.ร.บ. & ประกัน',
    icon: '📑',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd'
  },
  misc: {
    id: 'misc',
    label: 'อื่นๆ',
    icon: '📦',
    color: '#4b5563',
    bg: '#f9fafb',
    border: '#e5e7eb'
  },
  salary: {
    id: 'salary',
    label: 'เงินเดือน/ค่ารอบ',
    icon: '💸',
    color: '#be185d',
    bg: '#fdf2f8',
    border: '#fbcfe8'
  }
};

const safeGetStorage = (key) => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
};

const safeSetStorage = (key, value) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (e) {}
};

const safeRemoveStorage = (key) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (e) {}
};

/**
 * จัดหมวดหมู่อัตโนมัติจากชื่อรายการ (Auto Categorize)
 */
export function detectExpenseCategory(description = '') {
  const text = String(description).toLowerCase().trim();
  if (!text) return 'misc';

  if (text.includes('เติมน้ำมัน') || text.includes('น้ำมัน') || text.includes('ดีเซล') || text.includes('gasoline')) {
    return 'fuel';
  }
  if (
    text.includes('ซ่อม') || text.includes('ปะยาง') || text.includes('เปลี่ยนยาง') ||
    text.includes('สลับยาง') || text.includes('แอร์') || text.includes('ฟิล์ม') ||
    text.includes('ถ่ายน้ำมันเครื่อง') || text.includes('กลอน') || text.includes('วาล์ว') ||
    text.includes('กรอง') || text.includes('ไฟ') || text.includes('ครัช') ||
    text.includes('เบรค') || text.includes('จารบี') || text.includes('ลมยาง') ||
    text.includes('ช่าง') || text.includes('อู่')
  ) {
    return 'maintenance';
  }
  if (
    text.includes('ผ่านท่า') || text.includes('ทางด่วน') || text.includes('มอเตอร์ไซด์') ||
    text.includes('มอไซด์') || text.includes('สะพาน') || text.includes('ที่จอด')
  ) {
    return 'toll_port';
  }
  if (text.includes('ผ่อนรถ') || text.includes('ผ่อนหาง') || text.includes('งวด') || text.includes('ค่างวด')) {
    return 'installment';
  }
  if (
    text.includes('ทะเบียน') || text.includes('พรบ') || text.includes('พ.ร.บ') ||
    text.includes('ประกัน') || text.includes('ตรวจสภาพ') || text.includes('ภาษี')
  ) {
    return 'tax_insurance';
  }
  if (
    text.includes('เงินเดือน') || text.includes('ค่ารอบ') || text.includes('เบี้ยเลี้ยง') ||
    text.includes('ค่าจ้าง') || text.includes('จ่ายเงินเดือน') || text.includes('เบิกค่าเที่ยว') ||
    text.includes('ค่าเที่ยว') || text.includes('จ่ายพนักงาน') || text.includes('salary')
  ) {
    return 'salary';
  }
  return 'misc';
}

export const truckExpenseService = {
  /**
   * 1. ดึงรายการค่าใช้จ่ายทั้งหมดพร้อม Filter
   */
  async fetchExpenses(filters = {}) {
    try {
      const {
        dateFrom,
        dateTo,
        yearMonth,
        truckNo,
        driverName,
        category,
        batchName,
        searchQuery
      } = filters;

      let query = supabase
        .from('truck_expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (yearMonth && yearMonth !== 'ALL') query = query.eq('year_month', yearMonth);
      if (dateFrom) query = query.gte('expense_date', dateFrom);
      if (dateTo) query = query.lte('expense_date', dateTo);
      if (truckNo && truckNo !== 'ALL') query = query.eq('truck_no', truckNo);
      if (driverName && driverName !== 'ALL') query = query.eq('driver_name', driverName);
      if (category && category !== 'ALL') query = query.eq('category', category);
      if (batchName && batchName !== 'ALL') query = query.eq('batch_name', batchName);

      const { data, error } = await query;

      let list = [];
      if (!error && Array.isArray(data)) {
        list = data;
        safeSetStorage(STORAGE_KEY, JSON.stringify(list));
      } else {
        console.warn('truckExpenseService.fetchExpenses fallback to localStorage:', error?.message);
        const cached = safeGetStorage(STORAGE_KEY);
        if (cached) {
          try {
            list = JSON.parse(cached);
            
            // Apply all filters manually since we are offline
            if (dateFrom) list = list.filter(r => r.expense_date >= dateFrom);
            if (dateTo) list = list.filter(r => r.expense_date <= dateTo);
            if (truckNo && truckNo !== 'ALL') list = list.filter(r => r.truck_no === truckNo);
            if (driverName && driverName !== 'ALL') list = list.filter(r => r.driver_name === driverName);
            if (category && category !== 'ALL') list = list.filter(r => r.category === category);
            if (batchName && batchName !== 'ALL') list = list.filter(r => r.batch_name === batchName);

          } catch (e) {
            list = [];
          }
        }
      }

      // Client-side search and filters fallback
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        list = list.filter(r =>
          (r.truck_no && r.truck_no.toLowerCase().includes(q)) ||
          (r.driver_name && r.driver_name.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (r.invoice_no && r.invoice_no.toLowerCase().includes(q)) ||
          (r.remark && r.remark.toLowerCase().includes(q))
        );
      }

      // Calculate summary KPIs
      let totalAmount = 0;
      let fuelAmount = 0;
      let maintenanceAmount = 0;
      let tollPortAmount = 0;
      let installmentAmount = 0;
      let taxInsuranceAmount = 0;
      let salaryAmount = 0;
      let miscAmount = 0;

      list.forEach(item => {
        const amt = Number(item.amount_total || 0);
        totalAmount += amt;

        if (item.category === 'fuel') {
          fuelAmount += amt;
        } else if (item.category === 'maintenance') {
          maintenanceAmount += amt;
        } else if (item.category === 'toll_port') {
          tollPortAmount += amt;
        } else if (item.category === 'installment') {
          installmentAmount += amt;
        } else if (item.category === 'tax_insurance') {
          taxInsuranceAmount += amt;
        } else if (item.category === 'salary') {
          salaryAmount += amt;
        } else {
          miscAmount += amt;
        }
      });

      return {
        data: list,
        kpis: {
          total_amount: totalAmount,
          total_count: list.length,
          fuel_amount: fuelAmount,
          maintenance_amount: maintenanceAmount,
          toll_port_amount: tollPortAmount,
          installment_amount: installmentAmount,
          tax_insurance_amount: taxInsuranceAmount,
          salary_amount: salaryAmount,
          misc_amount: miscAmount
        },
        error: null
      };
    } catch (error) {
      console.error('truckExpenseService.fetchExpenses error:', error);
      return { data: [], kpis: {}, error };
    }
  },

  /**
   * 2. บันทึก / อัปเดตรายการค่าใช้จ่าย (Save / Upsert)
   */
  async saveExpense(recordData) {
    try {
      const id = recordData.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const amountTotal = recordData.amount_total !== undefined && recordData.amount_total !== null
        ? Number(recordData.amount_total)
        : 0;

      const expenseDate = recordData.expense_date ? String(recordData.expense_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const payload = {
        id,
        expense_date: expenseDate,
        year_month: expenseDate.slice(0, 7),
        truck_no: String(recordData.truck_no || 'FLEET_SHARED').trim(),
        driver_name: recordData.driver_name?.trim() || '-',
        batch_name: recordData.batch_name?.trim() || '-',
        category: recordData.category || detectExpenseCategory(recordData.description),
        description: recordData.description?.trim() || 'ค่าใช้จ่ายทั่วไป',
        amount_total: amountTotal,
        has_vat: !!recordData.has_vat,
        vat_amount: Number(recordData.vat_amount || 0),
        payment_method: recordData.payment_method || 'cash',
        invoice_no: recordData.invoice_no?.trim() || '-',
        slip_url: recordData.slip_url?.trim() || '-',
        remark: recordData.remark?.trim() || '-',
        created_by: recordData.created_by || 'Admin',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('truck_expenses')
        .upsert([payload])
        .select();

      if (error) {
        console.warn('truckExpenseService.saveExpense Supabase fallback:', error.message);
        // Cache update
        const cached = safeGetStorage(STORAGE_KEY);
        let list = cached ? JSON.parse(cached) : [];
        const idx = list.findIndex(r => r.id === id);
        if (idx >= 0) list[idx] = payload;
        else list.unshift(payload);
        safeSetStorage(STORAGE_KEY, JSON.stringify(list));
        return { data: payload, error: null };
      }

      // Update local storage
      const cached = safeGetStorage(STORAGE_KEY);
      let list = cached ? JSON.parse(cached) : [];
      const savedItem = data?.[0] || payload;
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) list[idx] = savedItem;
      else list.unshift(savedItem);
      safeSetStorage(STORAGE_KEY, JSON.stringify(list));

      return { data: savedItem, error: null };
    } catch (error) {
      console.error('truckExpenseService.saveExpense error:', error);
      return { data: null, error };
    }
  },

  /**
   * 3. ลบรายการค่าใช้จ่าย
   */
  async deleteExpense(id) {
    try {
      const { error } = await supabase
        .from('truck_expenses')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn('truckExpenseService.deleteExpense fallback:', error.message);
      }

      const cached = safeGetStorage(STORAGE_KEY);
      if (cached) {
        let list = JSON.parse(cached);
        list = list.filter(r => r.id !== id);
        safeSetStorage(STORAGE_KEY, JSON.stringify(list));
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('truckExpenseService.deleteExpense error:', error);
      return { success: false, error };
    }
  },

  /**
   * 3.1 ล้างข้อมูลค่าใช้จ่ายทั้งหมด (Clear All / Reset สำหรับทดสอบระบบ)
   */
  async clearAllExpenses() {
    try {
      const { error } = await supabase
        .from('truck_expenses')
        .delete()
        .neq('id', '___non_existing_dummy_id___');

      if (error) {
        console.warn('truckExpenseService.clearAllExpenses fallback:', error.message);
      }

      safeRemoveStorage(STORAGE_KEY);
      return { success: true, error: null };
    } catch (error) {
      console.error('truckExpenseService.clearAllExpenses error:', error);
      safeRemoveStorage(STORAGE_KEY);
      return { success: true, error: null };
    }
  },

  /**
   * 4. Bulk Insert หลายรายการ (เช่น จาก Excel Import)
   */
  async bulkInsertExpenses(records = []) {
    try {
      if (!records || records.length === 0) return { count: 0, error: null };

      const cleanRecords = records.map(r => {
        const id = r.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const amountTotal = r.amount_total !== undefined && r.amount_total !== null
          ? Number(r.amount_total)
          : (Number(r.amount_goods || 0) + Number(r.amount_labor || 0));

        return {
          id,
          expense_date: r.expense_date ? String(r.expense_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
          truck_no: String(r.truck_no || 'FLEET_SHARED').trim(),
          driver_name: r.driver_name?.trim() || '-',
          batch_name: r.batch_name?.trim() || '-',
          category: r.category || detectExpenseCategory(r.description),
          description: r.description?.trim() || 'ค่าใช้จ่ายทั่วไป',
          amount_total: amountTotal,
          has_vat: !!r.has_vat,
          vat_amount: Number(r.vat_amount || 0),
          payment_method: r.payment_method || 'cash',
          invoice_no: r.invoice_no?.trim() || '-',
          slip_url: r.slip_url?.trim() || '-',
          remark: r.remark?.trim() || '-',
          created_by: r.created_by || 'Import Excel',
          updated_at: new Date().toISOString()
        };
      });

      const { data, error } = await supabase
        .from('truck_expenses')
        .upsert(cleanRecords)
        .select();

      if (error) {
        console.error('truckExpenseService.bulkInsertExpenses Supabase error:', error);
        throw new Error(`บันทึกลงฐานข้อมูล Supabase ไม่สำเร็จ: ${error.message}`);
      }

      // Update localStorage cache
      const cached = safeGetStorage(STORAGE_KEY);
      let list = cached ? JSON.parse(cached) : [];
      const savedMap = new Map(list.map(item => [item.id, item]));
      cleanRecords.forEach(item => savedMap.set(item.id, item));
      const merged = Array.from(savedMap.values()).sort((a, b) => b.expense_date.localeCompare(a.expense_date));
      safeSetStorage(STORAGE_KEY, JSON.stringify(merged));

      return { count: cleanRecords.length, error: null };
    } catch (error) {
      console.error('truckExpenseService.bulkInsertExpenses error:', error);
      return { count: 0, error };
    }
  },

  /**
   * 5. ตัวแกะไฟล์ Excel (Excel Parser) สำหรับชีท May-69_รถหัวลากรับ-จ่าย
   */
  async parseExpenseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const parsedRecords = [];

          // 🎯 Check if first sheet is a Standard Flat Table Template
          const firstSheetName = workbook.SheetNames[0];
          const firstWs = workbook.Sheets[firstSheetName];
          const firstRows = XLSX.utils.sheet_to_json(firstWs, { header: 1, defval: null });
          const firstHeader = (firstRows && firstRows[0]) ? firstRows[0].map(h => String(h || '').trim().toLowerCase()) : [];

          const isFlatTable = firstHeader.some(h => 
            h.includes('รายการค่าใช้จ่าย') || h.includes('รหัสหมวดหมู่') || 
            h.includes('หมวดหมู่ค่าใช้จ่าย') || h.includes('description') || 
            (h.includes('เบอร์รถ') && h.includes('ยอดรวม'))
          );

          if (isFlatTable) {
            // 📊 Parse Standard Flat Table
            const jsonObjects = XLSX.utils.sheet_to_json(firstWs, { defval: '' });
            jsonObjects.forEach((row, rIdx) => {
              const desc = String(row['รายการค่าใช้จ่าย'] || row['description'] || row['รายการ'] || '').trim();
              if (!desc || desc.includes('รวมทั้งหมด') || desc.includes('Total')) return;

              let truck = String(row['เบอร์รถ'] || row['truck_no'] || 'FLEET_SHARED').trim();
              if (truck === 'กองกลาง' || truck === 'ส่วนกลาง') truck = 'FLEET_SHARED';

              const driver = String(row['ชื่อคนขับ'] || row['driver_name'] || row['คนขับ'] || '-').trim();
              const batch = String(row['งวดงาน/เดือน'] || row['batch_name'] || row['งวด/รอบ'] || 'พฤษภาคม 2569').trim();
              const rawCategory = String(row['รหัสหมวดหมู่'] || row['หมวดหมู่ค่าใช้จ่าย'] || row['หมวดหมู่'] || row['category'] || '').trim().toLowerCase();
              let catCode = '';
              if (rawCategory === 'salary' || rawCategory.includes('เงินเดือน') || rawCategory.includes('ค่ารอบ') || rawCategory.includes('ค่าเที่ยว')) {
                catCode = 'salary';
              } else if (rawCategory === 'fuel' || rawCategory.includes('น้ำมัน')) {
                catCode = 'fuel';
              } else if (rawCategory === 'maintenance' || rawCategory.includes('ซ่อม') || rawCategory.includes('อะไหล่')) {
                catCode = 'maintenance';
              } else if (rawCategory === 'toll_port' || rawCategory.includes('ผ่านท่า') || rawCategory.includes('ทางด่วน')) {
                catCode = 'toll_port';
              } else if (rawCategory === 'installment' || rawCategory.includes('ผ่อน') || rawCategory.includes('งวด')) {
                catCode = 'installment';
              } else if (rawCategory === 'tax_insurance' || rawCategory.includes('ประกัน') || rawCategory.includes('ภาษี') || rawCategory.includes('พรบ')) {
                catCode = 'tax_insurance';
              } else if (EXPENSE_CATEGORIES[rawCategory] && rawCategory !== 'misc') {
                catCode = rawCategory;
              } else {
                catCode = detectExpenseCategory(desc);
              }

              let amountTotal = parseFloat(row['ยอดรวมสุทธิ (บาท)'] || row['จำนวนเงิน'] || row['amount_total'] || 0);
              // Fallback just in case they upload the old format
              if (!amountTotal) {
                const amountGoods = parseFloat(row['ค่าของ/อะไหล่/น้ำมัน (บาท)'] || row['amount_goods'] || 0) || 0;
                const amountLabor = parseFloat(row['ค่าแรงช่าง (บาท)'] || row['amount_labor'] || 0) || 0;
                amountTotal = amountGoods + amountLabor;
              }

              let dateVal = row['วันที่'] || row['expense_date'] || new Date().toISOString().slice(0, 10);
              if (dateVal instanceof Date) {
                dateVal = dateVal.toISOString().slice(0, 10);
              } else if (typeof dateVal === 'string' && dateVal.includes('/')) {
                const parts = dateVal.split('/');
                if (parts.length === 3) {
                  let year = parseInt(parts[2], 10);
                  if (year > 2500) year -= 543;
                  const month = String(parts[1]).padStart(2, '0');
                  const day = String(parts[0]).padStart(2, '0');
                  dateVal = `${year}-${month}-${day}`;
                }
              }

              parsedRecords.push({
                expense_date: String(dateVal).slice(0, 10),
                truck_no: truck,
                driver_name: driver,
                batch_name: batch,
                category: catCode,
                description: desc,
                amount_total: amountTotal,
                has_vat: false,
                vat_amount: 0,
                payment_method: String(row['วิธีชำระเงิน'] || row['payment_method'] || 'เงินสด').trim(),
                invoice_no: String(row['เลขที่บิล/ใบเสร็จ'] || row['invoice_no'] || row['เลขที่บิล'] || '-').trim(),
                remark: String(row['หมายเหตุ'] || row['remark'] || '-').trim(),
                sheet_origin: firstSheetName
              });
            });

            resolve(parsedRecords);
            return;
          }

          // 🚚 Else: Parse Multi-sheet Raw Bookkeeping Format
          workbook.SheetNames.forEach(sheetName => {
            // Skip non-expense sheets
            if (sheetName.includes('ร้านโชห่วย') || sheetName.includes('รายรับ-จ่าย จริง') || sheetName.includes('ทะเบียน ประกัน')) {
              return;
            }

            const ws = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
            if (!rows || rows.length < 6) return;

            // Detect truck number and driver from sheet name or header
            let defaultTruck = '-';
            let defaultDriver = '-';
            let batchMonth = 'พฤษภาคม 2569';

            // Check row 1 & 2
            if (rows[0]) {
              const r0 = rows[0];
              if (r0[2]) batchMonth = String(r0[2]).trim();
            }
            if (rows[1]) {
              const r1 = rows[1];
              if (r1[2]) defaultDriver = String(r1[2]).trim();
            }

            // Extract truck number from sheet name e.g. "39 506 Bonbon" -> "39", "501 เต่า" -> "501", "รายจ่ายอื่นๆ" -> "FLEET_SHARED"
            if (sheetName.includes('รายจ่ายอื่นๆ')) {
              defaultTruck = 'FLEET_SHARED';
            } else {
              const numMatch = sheetName.match(/(\d+)/);
              if (numMatch) defaultTruck = numMatch[1];
            }

            // Rows 7 onwards (index 6 to ~30) contains daily expense logs
            for (let r = 6; r < rows.length; r++) {
              const row = rows[r];
              if (!row) continue;

              const dateVal = row[0];
              const descVal = row[1];
              const tripCountVal = row[2];
              const goodsVal = row[5];
              const laborVal = row[6];
              const docVal = row[10] || row[9] || '';

              if (!descVal || String(descVal).trim() === '') continue;
              const desc = String(descVal).trim();

              // Skip non-expense calculation summary rows
              if (
                desc.includes('รวมรายจ่าย') || desc.includes('กำไร') ||
                desc.includes('คำนวณค่าตู้') || desc.includes('สรุปรายได้')
              ) {
                continue;
              }

              const amountGoods = Number(goodsVal || 0) || 0;
              const amountLabor = Number(laborVal || 0) || 0;
              const amountTotal = amountGoods + amountLabor;
              if (amountTotal === 0 && !tripCountVal) continue;

              // Format date
              let expDate = new Date().toISOString().slice(0, 10);
              if (dateVal instanceof Date) {
                expDate = dateVal.toISOString().slice(0, 10);
              } else if (typeof dateVal === 'string' && dateVal.includes('/')) {
                const parts = dateVal.split('/');
                if (parts.length === 3) {
                  let year = parseInt(parts[2], 10);
                  if (year > 2500) year -= 543;
                  const month = String(parts[1]).padStart(2, '0');
                  const day = String(parts[0]).padStart(2, '0');
                  expDate = `${year}-${month}-${day}`;
                }
              }

              // Extract vendor / location if mentioned
              let vendor = '-';
              if (desc.includes('ผ่านท่า')) vendor = 'ผ่านท่า';
              else if (desc.includes('ช่างเอ')) vendor = 'ช่างเอ';
              else if (desc.includes('Makro')) vendor = 'Makro';
              else if (desc.includes('Lotus')) vendor = "Lotus's";

              const category = detectExpenseCategory(desc);
              const tripCount = Number(tripCountVal || 0);

              parsedRecords.push({
                expense_date: expDate,
                truck_no: defaultTruck,
                driver_name: defaultDriver,
                batch_name: batchMonth,
                category,
                description: desc,
                amount_total: amountTotal,
                has_vat: false,
                vat_amount: 0,
                payment_method: 'cash',
                invoice_no: '-',
                remark: docVal ? String(docVal).trim() : '-',
                sheet_origin: sheetName
              });
            }
          });

          resolve(parsedRecords);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * 6. ส่งออกรายการค่าใช้จ่ายเป็น Excel (Export to Excel)
   */
  exportToExcel(expenses = [], filename = 'truck_expenses.xlsx') {
    const exportData = expenses.map((r, index) => ({
      '#': index + 1,
      'วันที่': r.expense_date || '-',
      'เบอร์รถ': r.truck_no === 'FLEET_SHARED' ? 'กองกลาง' : r.truck_no || '-',
      'คนขับ': r.driver_name || '-',
      'งวด/รอบ': r.batch_name || '-',
      'หมวดหมู่ค่าใช้จ่าย': EXPENSE_CATEGORIES[r.category]?.label || r.category || '-',
      'รายการค่าใช้จ่าย': r.description || '-',
      'จำนวนเงิน': Number(r.amount_total || 0),
      'VAT (บาท)': Number(r.vat_amount || 0),
      'เลขที่บิล': r.invoice_no || '-',
      'วิธีชำระ': r.payment_method || 'เงินสด',
      'หมายเหตุ': r.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายการค่าใช้จ่ายรถ');
    XLSX.writeFile(wb, filename);
  }
};

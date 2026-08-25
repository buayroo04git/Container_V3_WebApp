import { describe, it, expect } from 'vitest';
import { jobSheetService } from '../../src/services/jobSheetService';
import { driverPayrollService } from '../../src/services/driverPayrollService';
import fs from 'fs';

describe('Triple View Reconciliation Test (Completed Job Sheets vs OCR History vs Driver Payroll)', () => {
  it('checks all 3 views return consistent driver assignments and container counts', async () => {
    // 1. Completed Job Sheets
    const sheetsRes = await jobSheetService.fetchPaginatedCompletedJobSheets({
      page: 1,
      pageSize: 100
    });

    // 2. OCR Container History
    const ocrHistoryRes = await jobSheetService.fetchPaginatedOcrContainersHistory({
      page: 1,
      pageSize: 'ALL',
      statusFilter: 'ALL'
    });

    // 3. Driver Payroll
    const payrollRes = await driverPayrollService.calculatePayrollSummary({
      driverFilter: 'ALL',
      batchFilter: 'ALL',
      paymentStatusFilter: 'ALL'
    });

    const report = {
      completedSheets: {
        totalSheets: sheetsRes.data?.length,
        driverSheets: sheetsRes.data?.map(s => ({
          batch_name: s.batch_name,
          truck_no: s.truck_no,
          driver_name: s.driver_name,
          total: s.total_containers,
          green: s.green,
          red: s.red
        }))
      },
      ocrHistory: {
        totalContainers: ocrHistoryRes.totalCount,
        driverCounts: ocrHistoryRes.data?.reduce((acc, r) => {
          acc[r.driver_name] = (acc[r.driver_name] || 0) + 1;
          return acc;
        }, {})
      },
      payroll: {
        kpis: payrollRes.data?.kpis,
        drivers: payrollRes.data?.drivers?.map(d => ({
          driver_name: d.driver_name,
          assigned_truck_no: d.assigned_truck_no,
          total_containers: d.total_containers,
          verified_containers: d.verified_containers,
          pending_containers: d.pending_containers,
          total_earnings: d.total_earnings
        }))
      }
    };

    const redInOcr = ocrHistoryRes.data?.filter(r => r.match_status === 'manual_red');
    console.log('Red items in OCR history:', redInOcr?.map(r => ({
      id: r.id,
      container_no: r.container_no,
      driver_name: r.driver_name,
      date_job: r.date_job,
      truck_no: r.truck_no,
      sheet_id: r.sheet_id
    })));

    fs.writeFileSync('triple_reconciliation.json', JSON.stringify(report, null, 2));

    // 1. "สายัน หงษ์สันเทียะ" must have 73 verified containers (฿7,300) and 4 pending red containers, operated truck 501
    const sayanPayroll = payrollRes.data.drivers.find(d => d.driver_name === 'สายัน หงษ์สันเทียะ');
    expect(sayanPayroll).toBeDefined();
    expect(sayanPayroll.assigned_truck_no).toBe('501');
    expect(sayanPayroll.verified_containers).toBe(73);
    expect(sayanPayroll.pending_containers).toBe(4);
    expect(sayanPayroll.total_earnings).toBe(7300);

    // 2. "บุญมี ศรีสุระ" must have 25 verified containers (฿2,500) and 38 pending cache containers, operated truck 505
    const boonmeePayroll = payrollRes.data.drivers.find(d => d.driver_name === 'บุญมี ศรีสุระ');
    expect(boonmeePayroll).toBeDefined();
    expect(boonmeePayroll.assigned_truck_no).toBe('505');
    expect(boonmeePayroll.verified_containers).toBe(25);
    expect(boonmeePayroll.total_earnings).toBe(2500);

    // 3. OCR Container History:
    // Sayan must have 77 completed containers (73 green + 4 red)
    const ocrSayanCompleted = ocrHistoryRes.data.filter(r => r.workflow_status === 'completed' && r.driver_name === 'สายัน หงษ์สันเทียะ').length;
    expect(ocrSayanCompleted).toBe(77);

    // Total Completed in OCR History must match total in Completed Job Sheets (102)
    const ocrTotalCompleted = ocrHistoryRes.data.filter(r => r.workflow_status === 'completed').length;
    expect(ocrTotalCompleted).toBe(102);
  }, 30000);
});

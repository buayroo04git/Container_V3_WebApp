/**
 * 🧪 In-Memory Supabase Mock Helper for High-Speed Scenario Simulation
 */
export function createMockDatabase(initialData = {}) {
  const db = {
    driver_records: initialData.driver_records ? [...initialData.driver_records] : [],
    truck_records: initialData.truck_records ? [...initialData.truck_records] : [],
    truck_operations: initialData.truck_operations ? [...initialData.truck_operations] : [],
    driver_leave_records: initialData.driver_leave_records ? [...initialData.driver_leave_records] : [],
    truck_maintenance_records: initialData.truck_maintenance_records ? [...initialData.truck_maintenance_records] : [],
    container_records: initialData.container_records ? [...initialData.container_records] : [],
    job_sheets: initialData.job_sheets ? [...initialData.job_sheets] : [],
    job_sheet_items: initialData.job_sheet_items ? [...initialData.job_sheet_items] : [],
    driver_truck_history: initialData.driver_truck_history ? [...initialData.driver_truck_history] : []
  };

  const client = {
    from(tableName) {
      if (!db[tableName]) db[tableName] = [];
      let queryList = [...db[tableName]];

      const builder = {
        select(cols = '*') {
          return builder;
        },
        order(col, { ascending = true } = {}) {
          queryList.sort((a, b) => {
            if (a[col] < b[col]) return ascending ? -1 : 1;
            if (a[col] > b[col]) return ascending ? 1 : -1;
            return 0;
          });
          return builder;
        },
        eq(col, val) {
          queryList = queryList.filter(item => String(item[col]) === String(val));
          return builder;
        },
        neq(col, val) {
          queryList = queryList.filter(item => String(item[col]) !== String(val));
          return builder;
        },
        limit(num) {
          queryList = queryList.slice(0, num);
          return builder;
        },
        async insert(rows) {
          const toAdd = Array.isArray(rows) ? rows : [rows];
          db[tableName].push(...toAdd);
          return { data: toAdd, error: null };
        },
        async update(changes) {
          const updated = [];
          db[tableName] = db[tableName].map(item => {
            const matches = queryList.some(q => q.id === item.id || (q.driver_name && q.driver_name === item.driver_name) || (q.truck_no && q.truck_no === item.truck_no));
            if (matches) {
              const newItem = { ...item, ...changes, updated_at: new Date().toISOString() };
              updated.push(newItem);
              return newItem;
            }
            return item;
          });
          return { data: updated, error: null };
        },
        async delete() {
          const deleted = [];
          db[tableName] = db[tableName].filter(item => {
            const matches = queryList.some(q => q.id === item.id);
            if (matches) {
              deleted.push(item);
              return false;
            }
            return true;
          });
          return { data: deleted, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: queryList, error: null }).then(resolve, reject);
        }
      };

      return builder;
    },
    async rpc(funcName, params = {}) {
      if (funcName === 'assign_driver_to_truck_rpc') {
        const { p_truck_no, p_driver_name, p_effective_date, p_remark, p_created_by } = params;
        
        // 1. Check previous active operation on this truck
        const oldOp = db.truck_operations.find(op => op.truck_no === p_truck_no && op.status === 'active');
        if (oldOp) {
          oldOp.status = 'completed';
          oldOp.end_date = p_effective_date;
        }

        // 2. Insert new operation
        const newOp = {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          truck_no: p_truck_no,
          driver_name: p_driver_name,
          start_date: p_effective_date,
          end_date: null,
          status: 'active',
          remark: p_remark || null
        };
        db.truck_operations.push(newOp);

        // 3. Update truck_records
        const truck = db.truck_records.find(t => t.truck_no === p_truck_no);
        if (truck) {
          truck.assigned_driver_name = p_driver_name;
          truck.status = 'active';
        }

        // 4. Update driver_records
        const driver = db.driver_records.find(d => d.driver_name === p_driver_name);
        if (driver) {
          driver.assigned_truck_no = p_truck_no;
          driver.status = 'active';
        }

        // 5. Close ongoing leave for driver if any
        const activeLeave = db.driver_leave_records.find(l => l.driver_name === p_driver_name && l.status === 'active_leave');
        if (activeLeave) {
          activeLeave.status = 'completed';
          const effDate = new Date(p_effective_date);
          effDate.setDate(effDate.getDate() - 1);
          activeLeave.end_date = effDate.toISOString().slice(0, 10);
        }

        return { data: { success: true, operation_id: newOp.id }, error: null };
      }

      if (funcName === 'unassign_driver_truck_rpc') {
        const { p_truck_no, p_effective_date, p_remark, p_created_by } = params;
        const activeOp = db.truck_operations.find(op => op.truck_no === p_truck_no && op.status === 'active');
        let oldDriver = '-';
        if (activeOp) {
          activeOp.status = 'completed';
          activeOp.end_date = p_effective_date;
          oldDriver = activeOp.driver_name;
        }

        const truck = db.truck_records.find(t => t.truck_no === p_truck_no);
        if (truck) truck.assigned_driver_name = '-';

        if (oldDriver && oldDriver !== '-') {
          const driver = db.driver_records.find(d => d.driver_name === oldDriver);
          if (driver) driver.assigned_truck_no = '-';
        }

        return { data: { success: true }, error: null };
      }

      return { data: null, error: new Error(`RPC ${funcName} not mocked`) };
    },
    _getRawDatabase() {
      return db;
    }
  };

  return { client, db };
}

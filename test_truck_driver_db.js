import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://siayvbmblmfgrxlbtzja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpYXl2Ym1ibG1mZ3J4bGJ0emphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxNDQsImV4cCI6MjA5ODExNTE0NH0.9sblmdvNbKRU5j1QSCRA247WZlxWZ24IIfKXJSc4CvI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Automated Supabase V2.3 DB Tests...');
  console.log('====================================================\n');

  const testTruckNo = 'TEST_TRUCK_999';
  const testDriverName = 'ทดสอบ คนขับ 999';
  const testDriverName2 = 'ทดสอบ คนขับ 888';

  let passedCount = 0;
  let totalTests = 0;

  function assert(name, condition, extra = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${name} ${extra}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${name} ${extra}`);
    }
  }

  try {
    // 0. Cleanup any old test data
    await supabase.from('truck_operations').delete().eq('truck_no', testTruckNo);
    await supabase.from('truck_maintenance_records').delete().eq('truck_no', testTruckNo);
    await supabase.from('driver_leave_records').delete().eq('driver_name', testDriverName);
    await supabase.from('driver_truck_history').delete().eq('truck_no', testTruckNo);
    await supabase.from('truck_records').delete().eq('truck_no', testTruckNo);
    await supabase.from('driver_records').delete().eq('driver_name', testDriverName);
    await supabase.from('driver_records').delete().eq('driver_name', testDriverName2);

    // ----------------------------------------------------
    // TEST 1: Check Table Existence & Read Access
    // ----------------------------------------------------
    console.log('--- TEST 1: Table Read Permissions & RLS ---');
    const tables = [
      'truck_records',
      'driver_records',
      'truck_operations',
      'driver_truck_history',
      'truck_maintenance_records',
      'driver_leave_records'
    ];

    for (const tbl of tables) {
      const { data, error } = await supabase.from(tbl).select('*').limit(1);
      assert(`Table '${tbl}' exists and readable`, !error, error ? `(${error.message})` : `(rows: ${data ? data.length : 0})`);
    }

    // ----------------------------------------------------
    // TEST 2: Insert Test Truck & Driver
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Insert Master Records & Triggers ---');
    const { data: truckData, error: truckErr } = await supabase.from('truck_records').insert([{
      truck_no: testTruckNo,
      truck_license: '70-9999 ชบ',
      brand: 'ISUZU',
      status: 'active'
    }]).select().single();
    assert('Insert truck_record', !truckErr && truckData?.truck_no === testTruckNo, truckErr?.message || '');

    const { data: driverData, error: driverErr } = await supabase.from('driver_records').insert([{
      driver_name: testDriverName,
      phone: '0812345678',
      license_type: 'ท.4',
      status: 'active'
    }]).select().single();
    assert('Insert driver_record 1', !driverErr && driverData?.driver_name === testDriverName, driverErr?.message || '');

    const { error: driverErr2 } = await supabase.from('driver_records').insert([{
      driver_name: testDriverName2,
      phone: '0899999999',
      license_type: 'ท.4',
      status: 'active'
    }]);
    assert('Insert driver_record 2', !driverErr2, driverErr2?.message || '');

    // ----------------------------------------------------
    // TEST 3: Stored Procedure assign_driver_to_truck_rpc
    // ----------------------------------------------------
    console.log('\n--- TEST 3: RPC assign_driver_to_truck_rpc ---');
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('assign_driver_to_truck_rpc', {
      p_truck_no: testTruckNo,
      p_driver_name: testDriverName,
      p_start_date: new Date().toISOString().slice(0, 10),
      p_operation_type: 'primary',
      p_remark: 'Test Auto Assignment',
      p_created_by: 'AutomatedTester'
    });
    assert('assign_driver_to_truck_rpc execution', !rpcErr && rpcRes?.success === true, rpcErr?.message || '');

    // Verify Truck updated
    const { data: verifiedTruck } = await supabase.from('truck_records').select('*').eq('truck_no', testTruckNo).single();
    assert('Truck assigned_driver_name updated', verifiedTruck?.assigned_driver_name === testDriverName);

    // Verify Driver updated
    const { data: verifiedDriver } = await supabase.from('driver_records').select('*').eq('driver_name', testDriverName).single();
    assert('Driver assigned_truck_no updated', verifiedDriver?.assigned_truck_no === testTruckNo);

    // Verify truck_operations created
    const { data: verifiedOps } = await supabase.from('truck_operations').select('*').eq('truck_no', testTruckNo).eq('status', 'active');
    assert('truck_operations created with active status', verifiedOps?.length > 0 && verifiedOps[0].driver_name === testDriverName);

    // Verify driver_truck_history logged
    const { data: verifiedHist } = await supabase.from('driver_truck_history').select('*').eq('truck_no', testTruckNo).order('timestamp', { ascending: false });
    assert('driver_truck_history recorded ASSIGN event with created_by', verifiedHist?.length > 0 && verifiedHist[0].action === 'ASSIGN' && verifiedHist[0].created_by === 'AutomatedTester');

    // ----------------------------------------------------
    // TEST 4: Transfer Driver (Swap driver via RPC)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Driver Transfer & Auto-close Previous Op ---');
    const { data: rpcTransferRes, error: rpcTransferErr } = await supabase.rpc('assign_driver_to_truck_rpc', {
      p_truck_no: testTruckNo,
      p_driver_name: testDriverName2,
      p_start_date: new Date().toISOString().slice(0, 10),
      p_operation_type: 'primary',
      p_remark: 'Test Driver Transfer',
      p_created_by: 'AutomatedTester'
    });
    assert('Transfer driver to truck via RPC', !rpcTransferErr && rpcTransferRes?.success === true, rpcTransferErr?.message || '');

    // Old driver should be unassigned
    const { data: oldDriverAfter } = await supabase.from('driver_records').select('*').eq('driver_name', testDriverName).single();
    assert('Previous driver unassigned from truck', oldDriverAfter?.assigned_truck_no === '-');

    // ----------------------------------------------------
    // TEST 5: Maintenance Cost Auto-Compute Trigger
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Maintenance Auto-Compute Trigger ---');
    const maintId = 'maint_test_' + Date.now();
    const { data: maintData, error: maintErr } = await supabase.from('truck_maintenance_records').insert([{
      id: maintId,
      truck_no: testTruckNo,
      maintenance_type: 'tire',
      start_date: new Date().toISOString().slice(0, 10),
      cost_parts: 1200,
      cost_labor: 300,
      cost_total: 0 // Should trigger auto compute to 1500
    }]).select().single();
    assert('Auto-compute cost_total (1200+300=1500)', !maintErr && Number(maintData?.cost_total) === 1500, `got cost_total: ${maintData?.cost_total}`);

    // ----------------------------------------------------
    // TEST 6: Unassign RPC
    // ----------------------------------------------------
    console.log('\n--- TEST 6: RPC unassign_driver_truck_rpc ---');
    const { data: unassignRes, error: unassignErr } = await supabase.rpc('unassign_driver_truck_rpc', {
      p_truck_no: testTruckNo,
      p_driver_name: testDriverName2,
      p_end_date: new Date().toISOString().slice(0, 10),
      p_reason: 'Test Unassign Finished',
      p_created_by: 'AutomatedTester'
    });
    assert('unassign_driver_truck_rpc executed successfully', !unassignErr && unassignRes?.success === true, unassignErr?.message || '');

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log('\n--- CLEANUP: Removing Test Records ---');
    await supabase.from('truck_maintenance_records').delete().eq('id', maintId);
    await supabase.from('truck_operations').delete().eq('truck_no', testTruckNo);
    await supabase.from('driver_truck_history').delete().eq('truck_no', testTruckNo);
    await supabase.from('truck_records').delete().eq('truck_no', testTruckNo);
    await supabase.from('driver_records').delete().eq('driver_name', testDriverName);
    await supabase.from('driver_records').delete().eq('driver_name', testDriverName2);
    console.log('🧹 Cleanup finished.');

  } catch (err) {
    console.error('💥 Test execution error:', err);
  }

  console.log('\n====================================================');
  console.log(`🏁 TEST RESULTS: ${passedCount}/${totalTests} Tests Passed (${Math.round((passedCount/totalTests)*100)}%)`);
  console.log('====================================================\n');
}

runTests();

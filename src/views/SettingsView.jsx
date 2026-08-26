import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { checkFleetIntegrity, healFleetIntegrity } from '../services/operationsService';

export default function SettingsView() {
  const [geminiKey, setGeminiKey] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [googleDriveKey, setGoogleDriveKey] = useState('');
  const [isClearingCache, setIsClearingCache] = useState(false);
  
  useEffect(() => {
    setGeminiKey(localStorage.getItem('JWD_GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '');
    setSupabaseUrl(localStorage.getItem('JWD_SUPABASE_URL') || import.meta.env.VITE_SUPABASE_URL || '');
    setSupabaseKey(localStorage.getItem('JWD_SUPABASE_KEY') || import.meta.env.VITE_SUPABASE_ANON_KEY || '');
    setGoogleDriveKey(localStorage.getItem('JWD_GOOGLE_CLIENT_ID') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  }, []);


  const handleSave = () => {
    const trimmedGeminiKey = geminiKey.trim();
    
    // ดักจับเคสที่ผู้ใช้เผลอเอา Google Client ID มาใส่สลับช่อง
    if (trimmedGeminiKey && trimmedGeminiKey.includes('.apps.googleusercontent.com')) {
      alert("⚠️ ตรวจพบข้อผิดพลาด:\nดูเหมือนคุณจะนำ 'Google Client ID' มาใส่ในช่อง 'Gemini API Key' สลับกันครับ!\n\nกรุณาล้างค่า หรือใส่ Key ให้ถูกช่องครับ");
      return;
    }

    localStorage.setItem('JWD_GEMINI_API_KEY', trimmedGeminiKey);
    localStorage.setItem('JWD_SUPABASE_URL', supabaseUrl.trim());
    localStorage.setItem('JWD_SUPABASE_KEY', supabaseKey.trim());
    localStorage.setItem('JWD_GOOGLE_CLIENT_ID', googleDriveKey.trim());
    
    // โชว์แจ้งเตือนสวยๆ
    const btn = document.getElementById('save-btn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '✅ บันทึกข้อมูลสำเร็จ!';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '#2563eb';
      }, 2000);
    }
  };

  // ล้างแคชผลสแกน OCR (รีเซ็ตผลการสแกนของใบงานในคิวให้กลับไปเป็น 'รอสแกน' โดยไม่ลบรูปภาพ)
  const handleClearAllOcrCache = async () => {
    if (!window.confirm("⚠️ แน่ใจหรือไม่ที่จะรีเซ็ตผลสแกน OCR ของใบงานในคิวทั้งหมด?\n\n(รูปภาพในคิวจะยังคงอยู่ครบถ้วน แต่จะถูกรีเซ็ตให้สามารถกดสแกนใหม่อีกครั้ง)")) {
      return;
    }

    setIsClearingCache(true);
    try {
      // ดึงรายการที่อยู่ในคิว Pending เพื่อรีเซ็ตเฉพาะผล OCR
      const { data: pendingRows } = await supabase
        .from('ocr_cache')
        .select('*')
        .neq('model_used', 'deleted')
        .neq('model_used', 'completed');

      if (pendingRows && pendingRows.length > 0) {
        for (const row of pendingRows) {
          const oldOcr = row.ocr_data || {};
          const resetOcr = {
            is_pending: true,
            file_hash: row.id,
            drive_file_id: oldOcr.drive_file_id || null,
            folder_name: oldOcr.folder_name || null,
            relative_path: oldOcr.relative_path || row.image_name,
            image_url: oldOcr.image_url || null,
            thumbnail_url: oldOcr.thumbnail_url || null,
            webViewLink: oldOcr.webViewLink || null,
            batch_guess: oldOcr.batch_guess || null,
            created_at: oldOcr.created_at || row.created_at
            // ตัด rows และ truck_no ออก เพื่อรีเซ็ตสถานะเป็นรอสแกนใหม่
          };

          await supabase.from('ocr_cache').update({
            ocr_data: resetOcr,
            model_used: 'pending'
          }).eq('id', row.id);
        }
      }

      // เคลียร์ LocalStorage drafts
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('draft_') || key.startsWith('truck_') || key === 'gemini_model_bans')) {
          localStorage.removeItem(key);
        }
      }

      alert("✅ รีเซ็ตผลสแกน OCR ของใบงานในคิวเรียบร้อยแล้ว!\n(รูปภาพยังอยู่ครบ พร้อมให้กดสแกนใหม่ได้ทันที)");
    } catch (err) {
      console.error(err);
      alert("❌ เกิดข้อผิดพลาดในการรีเซ็ตแคช: " + err.message);
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div style={{
      height: '100%',
      width: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      padding: '24px 32px',
      background: '#f8fafc'
    }}>
      <div style={{ maxWidth: '840px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
        
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
            ⚙️ Owner Settings
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            ตั้งค่าระบบหลักและเชื่อมต่อ API (บันทึกเก็บไว้ในเบราว์เซอร์อย่างปลอดภัย)
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* API Credentials Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              🔑 Gemini API Key (สำหรับ AI OCR)
            </label>
            <input 
              type="password" 
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '7px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <small style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
              หากเว้นว่างไว้ ระบบจะใช้ค่าจากไฟล์ .env แทน
            </small>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              🗄️ Supabase Project URL
            </label>
            <input 
              type="text" 
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '7px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              🗄️ Supabase Anon Key
            </label>
            <input 
              type="password" 
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbG..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '7px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              📁 Google Client ID (สำหรับ Google Drive)
            </label>
            <input 
              type="text" 
              value={googleDriveKey}
              onChange={(e) => setGoogleDriveKey(e.target.value)}
              placeholder="353876659281-xxxx.apps.googleusercontent.com"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '7px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <small style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
              นำ Web Client ID มาใส่เพื่อให้อัปโหลดรูปขึ้น Google Drive แยกตามโฟลเดอร์ได้
            </small>
          </div>

          <button 
            id="save-btn"
            onClick={handleSave}
            style={{
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: 700,
              borderRadius: '7px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              cursor: 'pointer',
              marginTop: '6px',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
          >
            💾 บันทึกการตั้งค่า
          </button>
        </div>

        {/* OCR Cache Management Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>
              🧹 จัดการแคชข้อมูล OCR (Cloud Cache)
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
              ลบข้อมูลผลสแกนที่จำไว้ใน Supabase (`ocr_cache`) และ Draft ในเครื่อง เพื่อให้ระบบสแกนใหม่ทั้งหมด
            </p>
          </div>

          <button
            onClick={handleClearAllOcrCache}
            disabled={isClearingCache}
            style={{
              padding: '9px 16px',
              borderRadius: '7px',
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {isClearingCache ? '⏳ กำลังล้าง...' : '🗑️ ล้างแคช OCR ทั้งหมด'}
          </button>
        </div>

        {/* System Health & Data Integrity Card */}
        <SystemIntegrityCard />

      </div>
      
      </div>
    </div>
  );
}

function SystemIntegrityCard() {
  const [checking, setChecking] = useState(false);
  const [healing, setHealing] = useState(false);
  const [diagnostic, setDiagnostic] = useState(null);
  const [healResult, setHealResult] = useState(null);

  const runDiagnostic = async () => {
    setChecking(true);
    setHealResult(null);
    try {
      const res = await checkFleetIntegrity();
      setDiagnostic(res);
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  const handleHeal = async () => {
    setHealing(true);
    try {
      const res = await healFleetIntegrity();
      setHealResult(res);
      await runDiagnostic();
    } catch (e) {
      console.error(e);
    } finally {
      setHealing(false);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🩺 ตรวจสอบความถูกต้องของข้อมูลระบบ (System Health & Integrity)</span>
            {diagnostic && (
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: 700,
                background: diagnostic.status === 'HEALTHY' ? '#dcfce7' : '#fee2e2',
                color: diagnostic.status === 'HEALTHY' ? '#15803d' : '#b91c1c',
                border: `1px solid ${diagnostic.status === 'HEALTHY' ? '#86efac' : '#fca5a5'}`
              }}>
                {diagnostic.status === 'HEALTHY' ? '✅ สมบูรณ์ 100%' : `⚠️ พบข้อไม่ตรงกัน ${diagnostic.issue_count} รายการ`}
              </span>
            )}
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
            ตรวจสอบความสอดคล้องระหว่างทะเบียนรถ คนขับประจำ และประวัติงวดการขับขี่ที่ Active ป้องกันข้อมูลค้างหรือหลุดการซิงค์
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={runDiagnostic}
            disabled={checking || healing}
            style={{
              padding: '8px 14px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {checking ? '⏳ กำลังตรวจสอบ...' : '🔍 ตรวจสอบความสอดคล้อง'}
          </button>

          {diagnostic && diagnostic.issue_count > 0 && (
            <button
              onClick={handleHeal}
              disabled={healing || checking}
              style={{
                padding: '8px 14px',
                borderRadius: '7px',
                border: '1px solid #86efac',
                background: '#15803d',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(21, 128, 61, 0.2)',
                transition: 'all 0.15s ease'
              }}
            >
              {healing ? '⏳ กำลังซ่อมแซม...' : '⚡ ซ่อมแซมและซิงค์อัตโนมัติ'}
            </button>
          )}
        </div>
      </div>

      {healResult && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '7px',
          background: healResult.success ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${healResult.success ? '#bbf7d0' : '#fecaca'}`,
          color: healResult.success ? '#166534' : '#991b1b',
          fontSize: '12.5px',
          fontWeight: 600
        }}>
          {healResult.success ? '✅ ' : '❌ '} {healResult.message || healResult.error}
        </div>
      )}

      {diagnostic && diagnostic.issues && diagnostic.issues.length > 0 && (
        <div style={{
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#9a3412' }}>
            รายการที่ตรวจพบความไม่ตรงกัน:
          </span>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#c2410c' }}>
            {diagnostic.issues.map((issue, idx) => (
              <li key={idx} style={{ marginBottom: '2px' }}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

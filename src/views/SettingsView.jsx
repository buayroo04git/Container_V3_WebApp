import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

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
    setGoogleDriveKey(localStorage.getItem('JWD_GOOGLE_CLIENT_ID') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '353876659281-v8qg38uf7kj5girrp0omev3lephjbalm.apps.googleusercontent.com');
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
    <div style={{ padding: '24px 32px', maxWidth: '840px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
      
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

      </div>
      
    </div>
  );
}

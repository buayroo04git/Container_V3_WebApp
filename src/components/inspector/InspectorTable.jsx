import React, { useState } from 'react';
import CandidateButton from './CandidateButton';

/**
 * 📊 ตารางตรวจเทียบผลการจับคู่ตู้ 25 บรรทัด (Inspector Table)
 * - แสดงครบ 25 บรรทัดตามแบบฟอร์มกระดาษ A4 เสมอ 1:1
 * - ระบบขีดฆ่า Hover-to-Reveal ไม่รกสายตา
 * - จัดระนาบแนวนอนและฟอนต์ Monospace ตรงกันตัวต่อตัว
 */
export default function InspectorTable({
  ocrResult,
  matchingResults = [],
  activeModel,
  onApplyAllRecommendations,
  onContainerEdit,
  onContainerKeyDown,
  onApplyCandidate,
  onToggleCancelRow,
  onStartScan
}) {
  const [hoveredRowIdx, setHoveredRowIdx] = useState(null);

  if (!ocrResult) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        height: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🤖</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>ยังไม่ได้สแกน OCR ใบงานนี้</div>
        <button
          onClick={onStartScan}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🚀 เริ่มสแกน OCR ทันที
        </button>
      </div>
    );
  }

  const greenCount = matchingResults.filter(r => r.matchColor === 'green' && !r.isCancelled && !r.isEmpty).length;
  const blueCount = matchingResults.filter(r => r.matchColor === 'blue' && !r.isCancelled && !r.isEmpty).length;
  const yellowCount = matchingResults.filter(r => r.matchColor === 'yellow' && !r.isCancelled && !r.isEmpty).length;
  const redCount = matchingResults.filter(r => r.matchColor === 'red' && !r.isCancelled && !r.isEmpty).length;
  const recommendCount = matchingResults.filter(r => (r.matchColor === 'yellow' || r.matchColor === 'blue') && r.candidates?.length > 0 && !r.isCancelled).length;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100%',
      boxSizing: 'border-box'
    }}>
      {/* แถบสรุปยอดผลการจับคู่ (ตรงแนวเดียวกับแถบฟิลเตอร์ฝั่งซ้ายเป๊ะ 42px) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '10px',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '10px',
        height: '42px',
        boxSizing: 'border-box',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
            รายการตู้ ({matchingResults.length} แถว):
          </span>
          <div style={{ display: 'flex', gap: '4px', fontSize: '11px', fontWeight: 700 }}>
            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px' }}>
              🟢 {greenCount} ตรง
            </span>
            {blueCount > 0 && (
              <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 6px', borderRadius: '4px' }}>
                🔵 {blueCount} ใกล้เคียง
              </span>
            )}
            {yellowCount > 0 && (
              <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px' }}>
                🟡 {yellowCount} แนะนำ
              </span>
            )}
            {redCount > 0 && (
              <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '2px 6px', borderRadius: '4px' }}>
                🔴 {redCount} ไม่พบในใบวางบิล
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {recommendCount > 0 && (
            <button
              onClick={onApplyAllRecommendations}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #f59e0b',
                background: '#fffbeb',
                color: '#b45309',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.15)'
              }}
              title="ปรับใช้เลขตู้ตัวแนะนำอันดับ 1 ให้กับทุกแถวที่ยังรอตรวจอัตโนมัติ"
            >
              ⚡ ปรับใช้ตัวแนะนำทั้งหมด ({recommendCount})
            </button>
          )}
          
          <div style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
            โมเดล: <b>{activeModel || 'Gemini'}</b>
          </div>
        </div>
      </div>

      {/* ตารางจับคู่ 25 แถวคงที่ (Fixed 25 Rows with Strikethrough & Empty row support) */}
      <div style={{ flex: 1, overflowY: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>
            <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>
              <th style={{ padding: '8px 4px', width: '40px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>#</th>
              <th style={{ padding: '8px 4px', width: '96px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>สถานะ</th>
              <th style={{ padding: '8px 10px', width: '240px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>เลขตู้ OCR</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>จับคู่ใบวางบิล / เลือก Candidate</th>
            </tr>
          </thead>
          <tbody>
            {matchingResults.map((row, idx) => {
              if (!row) return null;
              const isEmpty = Boolean(row.isEmpty);
              const isCancelled = Boolean(row.isCancelled);
              const isGreen = row.matchColor === 'green';
              const isBlue = row.matchColor === 'blue';
              const isYellow = row.matchColor === 'yellow';
              const isRed = row.matchColor === 'red';
              const isDupRow = Boolean(row.isDuplicate || (row.candidates?.[0]?.siblings?.length > 1));
              const isDupYellow = isYellow && isDupRow;
              const isDupGreen = isGreen && isDupRow;

              let borderColor = '#cbd5e1';
              let rowBg = '#ffffff';
              let statusBadge = null;

              if (isEmpty) {
                borderColor = '#e2e8f0';
                rowBg = '#ffffff';
                statusBadge = (
                  <div style={{
                    width: '86px',
                    height: '26px',
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '5px',
                    background: '#f8fafc',
                    color: '#94a3b8',
                    border: '1px dashed #cbd5e1',
                    whiteSpace: 'nowrap'
                  }}>
                    <span>⚪ ว่าง</span>
                  </div>
                );
              } else if (isCancelled) {
                borderColor = '#94a3b8';
                rowBg = '#f8fafc';
                statusBadge = (
                  <div style={{
                    width: '86px',
                    height: '26px',
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    whiteSpace: 'nowrap'
                  }}>
                    <span>🚫 ขีดฆ่า</span>
                  </div>
                );
              } else {
                borderColor = isGreen ? (isDupGreen ? '#6366f1' : '#22c55e') : isBlue ? '#0ea5e9' : isDupYellow ? '#ea580c' : isYellow ? '#f59e0b' : '#ef4444';
                rowBg = isGreen ? (isDupGreen ? '#f5f3ff' : '#f8fdf9') : isBlue ? '#f0f9ff' : isDupYellow ? '#fffaf5' : isYellow ? '#fffdf7' : '#fff8f8';
                
                const badgeBg = isDupGreen ? '#ede9fe' : isGreen ? '#dcfce7' : isBlue ? '#e0f2fe' : isDupYellow ? '#ffedd5' : isYellow ? '#fef3c7' : '#fee2e2';
                const badgeColor = isDupGreen ? '#4338ca' : isGreen ? '#15803d' : isBlue ? '#0369a1' : isDupYellow ? '#c2410c' : isYellow ? '#b45309' : '#b91c1c';
                const badgeBorder = isDupGreen ? '#c7d2fe' : isGreen ? '#86efac' : isBlue ? '#7dd3fc' : isDupYellow ? '#fdba74' : isYellow ? '#fcd34d' : '#fca5a5';
                const badgeEmoji = isDupGreen ? '🔄' : isGreen ? '🟢' : isBlue ? '🔵' : isDupYellow ? '⚠️' : isYellow ? '🟡' : '🔴';
                const badgeLabel = isDupGreen 
                  ? (row.job_type ? `ซ้ำ Auto [${row.job_type}]` : 'ตู้ซ้ำ Dis/Load')
                  : isGreen 
                  ? 'ตรง 100%' 
                  : isBlue 
                  ? 'ใกล้เคียง' 
                  : isDupYellow 
                  ? 'ตู้ซ้ำ Dis/Load' 
                  : isYellow 
                  ? 'ตัวแนะนำ' 
                  : 'ไม่พบ DB';

                statusBadge = (
                  <div style={{
                    width: isDupYellow || isDupGreen ? '98px' : '86px',
                    height: '26px',
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontSize: isDupYellow || isDupGreen ? '10.5px' : '11px',
                    fontWeight: 800,
                    borderRadius: '5px',
                    background: badgeBg,
                    color: badgeColor,
                    border: `1.5px solid ${badgeBorder}`,
                    whiteSpace: 'nowrap'
                  }}
                  title={isDupGreen ? `ตู้หมายเลขนี้มี 2 งานใน DB แต่ AI สแกนเจอรอยติ๊ก ${row.job_type || 'Dis/Load'} จึงเลือกให้อัตโนมัติ` : undefined}
                  >
                    <span style={{ fontSize: '11px', lineHeight: 1 }}>{badgeEmoji}</span>
                    <span style={{ lineHeight: 1 }}>{badgeLabel}</span>
                  </div>
                );
              }

              return (
                <tr
                  key={idx}
                  onMouseEnter={() => setHoveredRowIdx(idx)}
                  onMouseLeave={() => setHoveredRowIdx(null)}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    borderLeft: `${isDupGreen ? '6px' : '4px'} solid ${borderColor}`,
                    background: hoveredRowIdx === idx && !isCancelled ? (isDupGreen ? '#ede9fe' : '#f8fafc') : rowBg,
                    opacity: isCancelled ? 0.65 : 1,
                    transition: 'background 0.15s ease'
                  }}
                >
                  {/* 1. ลำดับ # (คงที่ 1-25 อยู่ในระนาบเดียวกับช่องพิมพ์) */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                    <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: isDupGreen ? '#4338ca' : '#475569', fontWeight: 800, fontSize: '12px', fontFamily: 'monospace' }}>
                        #{idx + 1}
                      </span>
                    </div>
                  </td>

                  {/* 2. สถานะ (อยู่ในระนาบเดียวกับช่องพิมพ์) */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                    <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {statusBadge}
                    </div>
                  </td>

                  {/* 3. ช่องพิมพ์เลขตู้ พร้อมข้อความ OCR ดั้งเดิมกำกับอยู่ด้านล่าง ฟอนต์และตำแหน่งตัวอักษรตรงกัน 1:1 */}
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <input
                        id={`container_input_${idx}`}
                        value={row.container_no || ''}
                        onChange={(e) => onContainerEdit(idx, e.target.value)}
                        onKeyDown={(e) => onContainerKeyDown && onContainerKeyDown(idx, e, row.candidates || [])}
                        placeholder={isEmpty ? `แถวที่ ${idx + 1} (ว่าง)` : 'เลขตู้'}
                        disabled={isCancelled}
                        style={{
                          width: '100%',
                          height: '32px',
                          boxSizing: 'border-box',
                          padding: '0 8px',
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          fontSize: '13px',
                          fontWeight: 800,
                          letterSpacing: '0.8px',
                          color: isCancelled ? '#94a3b8' : (isEmpty ? '#64748b' : '#0f172a'),
                          textDecoration: isCancelled ? 'line-through' : 'none',
                          borderRadius: '6px',
                          border: isCancelled ? '1px solid #cbd5e1' : (isRed ? '1.5px solid #f87171' : isYellow ? '1.5px solid #fbbf24' : isBlue ? '1.5px solid #38bdf8' : isDupGreen ? '1.5px solid #818cf8' : isGreen ? '1px solid #86efac' : '1px dashed #cbd5e1'),
                          outline: 'none',
                          background: isCancelled ? '#f1f5f9' : '#ffffff'
                        }}
                      />
                      
                      {/* แสดงข้อความ OCR ดั้งเดิมกำกับใต้ช่องเสมอ (ตำแหน่งตัวอักษรและฟอนต์ตรงกับช่องพิมพ์เป๊ะๆ 1:1) */}
                      {!isEmpty && !isCancelled && (
                        <div
                          style={{
                            padding: '0 9px',
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '0.8px',
                            color: '#0284c7',
                            marginTop: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={`ข้อความเดิมที่ OCR สแกนได้: ${row.raw_ocr_no || row.autoCorrectedFrom || row.container_no || '-'}`}
                        >
                          <span>{row.raw_ocr_no || row.autoCorrectedFrom || row.container_no || '-'}</span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: '#0369a1',
                            fontFamily: 'sans-serif',
                            background: '#e0f2fe',
                            border: '1px solid #bae6fd',
                            padding: '0px 4px',
                            borderRadius: '3px',
                            marginLeft: '6px',
                            letterSpacing: 'normal'
                          }}>
                            OCR
                          </span>
                        </div>
                      )}

                      {/* ป้ายกำกับอธิบายสำหรับตู้ซ้ำที่ AI ช่วยเลือกรอบงานให้อัตโนมัติ */}
                      {isDupGreen && !isCancelled && !isEmpty && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            color: '#4338ca',
                            background: '#ede9fe',
                            border: '1px solid #c7d2fe',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            marginTop: '4px',
                            width: 'fit-content'
                          }}
                          title="มีเลขตู้นี้ 2 งานในรอบนี้ ระบบตรวจพบรอยติ๊กจึงเลือกรอบงานให้อัตโนมัติ"
                        >
                          <span>🔄 มี 2 งานใน DB • เลือกรอบ <b>{row.job_type || 'Dis/Load'}</b> ให้อัตโนมัติ</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 4. จับคู่ DB / เลือก Candidate (แถวเขียวโชว์ 1 ตัว, ปุ่มขีดฆ่าแบบ Hover-to-Reveal) */}
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      
                      {/* ฝั่งซ้าย: ปุ่ม Candidates (ถ้าเขียวโชว์ 1 ตัว ถ้าเหลือง/ฟ้าโชว์ตัวเลือกทั้งหมด) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                        {isCancelled ? (
                          <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic' }}>
                              แถวนี้ถูกขีดฆ่าทิ้ง (ไม่นำไปนับในยอดรวม)
                            </span>
                          </div>
                        ) : isEmpty ? null : row.candidates && Array.isArray(row.candidates) && row.candidates.length > 0 ? (
                          (isGreen && !isDupRow ? row.candidates.slice(0, 1) : row.candidates).flatMap((cand, cIdx) => {
                            if (!cand) return [];
                            const siblingList = (cand.siblings && cand.siblings.length > 0) ? cand.siblings : [cand.record || cand];
                            const listToRender = (isGreen && !isDupRow) ? [siblingList[0]] : siblingList;

                            return listToRender.filter(Boolean).map((sib, sIdx) => {
                              const isSelected = row.selectedDbId 
                                ? row.selectedDbId === sib.id 
                                : (row.container_no === cand.container_no && !row.isManuallyEdited && (row.job_type ? String(sib?.dis_load || '').toLowerCase().includes(String(row.job_type).toLowerCase()) : sIdx === 0));

                              return (
                                <CandidateButton
                                  key={`${cand.container_no}_${sib?.id || sIdx}`}
                                  cand={cand}
                                  sib={sib}
                                  cIdx={cIdx}
                                  isSelected={isSelected}
                                  rowMatchColor={isDupGreen ? 'dupGreen' : row.matchColor}
                                  onClick={() => onApplyCandidate(idx, cand, sib)}
                                />
                              );
                            });
                          })
                        ) : (
                          <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 600 }}>
                              ❌ ไม่พบใน DB
                            </span>
                          </div>
                        )}
                      </div>

                      {/* ฝั่งขวา: ปุ่มขีดฆ่า (Hover-to-Reveal: โผล่เฉพาะเวลาเอาเมาส์มาชี้ที่แถว ไม่รกสายตา) */}
                      <div style={{
                        flexShrink: 0,
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: isCancelled || hoveredRowIdx === idx ? 1 : 0,
                        pointerEvents: isCancelled || hoveredRowIdx === idx ? 'auto' : 'none',
                        transition: 'opacity 0.15s ease'
                      }}>
                        {isCancelled ? (
                          <button
                            onClick={() => onToggleCancelRow(idx)}
                            style={{
                              height: '26px',
                              padding: '0 8px',
                              borderRadius: '5px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#334155',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            title="ยกเลิกการขีดฆ่า นำแถวนี้กลับมาใช้งานตามปกติ"
                          >
                            <span>↩️</span>
                            <span>เลิกขีดฆ่า</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onToggleCancelRow(idx)}
                            style={{
                              height: '26px',
                              padding: '0 7px',
                              borderRadius: '5px',
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#64748b',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#fee2e2';
                              e.currentTarget.style.borderColor = '#fca5a5';
                              e.currentTarget.style.color = '#dc2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#ffffff';
                              e.currentTarget.style.borderColor = '#e2e8f0';
                              e.currentTarget.style.color = '#64748b';
                            }}
                            title="ขีดฆ่า/ยกเลิกตู้ในบรรทัดนี้ (ไม่นับเป็นข้อผิดพลาด และไม่บันทึกลงยอดรวม)"
                          >
                            <span>🚫</span>
                            <span>ขีดฆ่า</span>
                          </button>
                        )}
                      </div>

                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

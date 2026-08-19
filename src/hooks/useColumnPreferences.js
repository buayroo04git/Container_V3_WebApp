import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * 🎛️ Reusable Hook for Excel-grade Column Management
 * Supports:
 * 1. Column Visibility (Show / Hide)
 * 2. Drag & Drop Reordering
 * 3. Border Resize Handles
 * 4. Double-click Auto-fit
 * 5. Right-click Context Menu
 * 6. Column Aliases (Rename Modal + LocalStorage + Supabase sync)
 */
export function useColumnPreferences({
  storageKeyPrefix = 'table',
  rawColumns = [],
  defaultWidths = {},
  defaultNames = {},
  initialAliases = {},
  sampleRecords = [],
  formatCellValue = (col, val) => String(val || '')
}) {
  // Centralized Aliases (Load from app_column_aliases or localStorage fallback or initialAliases)
  const [aliases, setAliases] = useState(() => {
    try {
      const globalSaved = localStorage.getItem('app_column_aliases') || localStorage.getItem('container_column_aliases');
      const viewSaved = localStorage.getItem(`${storageKeyPrefix}_column_aliases`);
      const parsedGlobal = globalSaved ? JSON.parse(globalSaved) : {};
      const parsedView = viewSaved ? JSON.parse(viewSaved) : {};
      return { ...defaultNames, ...initialAliases, ...parsedGlobal, ...parsedView };
    } catch (e) {}
    return { ...defaultNames, ...initialAliases };
  });

  // Modal State for Rename
  const [renamingColumn, setRenamingColumn] = useState(null);

  // Visible Columns
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storageKeyPrefix}_visible_columns`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Column Widths
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storageKeyPrefix}_column_widths`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Column Order
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storageKeyPrefix}_column_order`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Drag & Drop
  const [draggedCol, setDraggedCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Context Menu { x, y, col }
  const [contextMenu, setContextMenu] = useState(null);

  // Automatically sync with Supabase column_aliases on mount
  useEffect(() => {
    async function loadGlobalAliases() {
      try {
        const { data } = await supabase.from('column_aliases').select('*');
        if (data && data.length > 0) {
          const map = {};
          data.forEach(item => {
            map[item.original_name] = item.alias_name;
          });
          setAliases(prev => ({ ...prev, ...map }));
          try {
            localStorage.setItem('app_column_aliases', JSON.stringify(map));
          } catch (e) {}
        }
      } catch (e) {}
    }
    loadGlobalAliases();
  }, []);

  // Update aliases if initialAliases changes
  useEffect(() => {
    if (initialAliases && Object.keys(initialAliases).length > 0) {
      setAliases(prev => ({ ...prev, ...initialAliases }));
    }
  }, [initialAliases]);

  // Ordered all columns (Smart Position Merge)
  const allColumns = (() => {
    if (!columnOrder || columnOrder.length === 0) return rawColumns;
    const set = new Set(rawColumns);
    const ordered = columnOrder.filter(c => set.has(c));

    // แทรกคอลัมน์ใหม่ที่ยังไม่อยู่ใน saved order ให้อยู่ในตำแหน่งสัมพัทธ์ตาม rawColumns (ไม่โยนไปต่อท้าย actions)
    rawColumns.forEach((c, idx) => {
      if (!ordered.includes(c)) {
        const nextColInRaw = rawColumns.slice(idx + 1).find(next => ordered.includes(next));
        if (nextColInRaw) {
          const insertIdx = ordered.indexOf(nextColInRaw);
          ordered.splice(insertIdx, 0, c);
        } else {
          const actionsIdx = ordered.indexOf('actions');
          if (actionsIdx !== -1) {
            ordered.splice(actionsIdx, 0, c);
          } else {
            ordered.push(c);
          }
        }
      }
    });

    // ล็อคให้ 'actions' อยู่ขวาสุดเสมอถ้ามี
    if (ordered.includes('actions')) {
      const actIdx = ordered.indexOf('actions');
      if (actIdx !== ordered.length - 1) {
        ordered.splice(actIdx, 1);
        ordered.push('actions');
      }
    }

    return ordered;
  })();

  // Active (visible) columns
  const activeColumns = allColumns.filter(col => visibleColumns[col] !== false);

  // Display Name
  const getColDisplayName = (col) => {
    if (aliases[col]) return aliases[col];
    if (defaultNames[col]) return defaultNames[col];
    return col;
  };

  // Default Width
  const getDefaultColWidth = (col) => {
    if (columnWidths[col]) return columnWidths[col];
    if (defaultWidths[col]) return defaultWidths[col];
    return 140;
  };

  // Reorder Columns
  const handleColumnReorder = (sourceCol, targetCol) => {
    if (!sourceCol || !targetCol || sourceCol === targetCol) return;
    const currentList = [...allColumns];
    const sourceIdx = currentList.indexOf(sourceCol);
    const targetIdx = currentList.indexOf(targetCol);
    if (sourceIdx === -1 || targetIdx === -1) return;

    currentList.splice(sourceIdx, 1);
    currentList.splice(targetIdx, 0, sourceCol);

    setColumnOrder(currentList);
    try {
      localStorage.setItem(`${storageKeyPrefix}_column_order`, JSON.stringify(currentList));
    } catch (e) {}
  };

  const handleResetColumnOrder = () => {
    setColumnOrder(null);
    try {
      localStorage.removeItem(`${storageKeyPrefix}_column_order`);
    } catch (e) {}
  };

  // Resize Mouse Down (Bulletproof signature supporting both (e, col) and (col, e))
  const handleResizeMouseDown = (arg1, arg2) => {
    let e, col;
    if (arg1 && typeof arg1.preventDefault === 'function') {
      e = arg1;
      col = arg2;
    } else {
      col = arg1;
      e = arg2;
    }
    if (!e || typeof e.preventDefault !== 'function') return;

    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getDefaultColWidth(col);

    const onMouseMove = (moveEvent) => {
      const currentWidth = Math.max(startWidth + (moveEvent.clientX - startX), 50);
      setColumnWidths(prev => ({
        ...prev,
        [col]: currentWidth
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setColumnWidths(latest => {
        try {
          localStorage.setItem(`${storageKeyPrefix}_column_widths`, JSON.stringify(latest));
        } catch (err) {}
        return latest;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Handle Sort Toggle
  const handleSort = (col) => {
    if (!col || col === 'actions' || col === 'id') return;
    setSortConfig(prev => {
      if (prev.key === col) {
        if (prev.direction === 'asc') return { key: col, direction: 'desc' };
        return { key: null, direction: 'asc' };
      }
      return { key: col, direction: 'asc' };
    });
  };

  // Sort Records Helper (Precision sorting supporting computed fields, status ranking, numbers & dates)
  const sortRecords = (records) => {
    if (!sortConfig.key || !records || records.length === 0) return records;
    const { key, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return [...records].sort((a, b) => {
      // 1. Obtain display/formatted values or raw values
      let vA = a[key];
      let vB = b[key];

      if (formatCellValue) {
        const formattedA = formatCellValue(key, vA, a);
        const formattedB = formatCellValue(key, vB, b);
        if (formattedA !== undefined && formattedA !== null) vA = formattedA;
        if (formattedB !== undefined && formattedB !== null) vB = formattedB;
      } else {
        // Fallback for views without custom formatCellValue
        if (key === 'work_status') {
          if (a?.driver_type === 'substitute' || a?.operation_type === 'substitute') vA = '🟡 ขับแทน';
          else if (a?.status === 'leave') vA = '🟡 ลางาน';
          else if (a?.status === 'inactive') vA = '⚪ พ้นสภาพ';
          else if (a?.assigned_truck_no && a?.assigned_truck_no !== '-') vA = '🟢 ขับประจำ';
          else vA = '⚪ ว่าง';

          if (b?.driver_type === 'substitute' || b?.operation_type === 'substitute') vB = '🟡 ขับแทน';
          else if (b?.status === 'leave') vB = '🟡 ลางาน';
          else if (b?.status === 'inactive') vB = '⚪ พ้นสภาพ';
          else if (b?.assigned_truck_no && b?.assigned_truck_no !== '-') vB = '🟢 ขับประจำ';
          else vB = '⚪ ว่าง';
        }
      }

      // Handle null/undefined/empty/placeholder
      const isNullA = vA === undefined || vA === null || vA === '' || vA === '-';
      const isNullB = vB === undefined || vB === null || vB === '' || vB === '-';
      if (isNullA && isNullB) return 0;
      if (isNullA) return 1; // place empty values at bottom
      if (isNullB) return -1;

      // Special handling for Work Status ranking
      if (key === 'work_status') {
        const rankOrder = {
          'ขับประจำ': 1,
          'ขับแทน': 2,
          'ว่าง': 3,
          'ลางาน': 4,
          'พ้นสภาพ': 5
        };
        const cleanA = String(vA).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const cleanB = String(vB).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const rankA = rankOrder[cleanA] || 99;
        const rankB = rankOrder[cleanB] || 99;
        if (rankA !== rankB) {
          return (rankA - rankB) * mult;
        }
      }

      // Special handling for Status ranking
      if (key === 'status') {
        const statusRank = {
          'active': 1,
          'พร้อมใช้งาน': 1,
          'ปกติ (Active)': 1,
          'กำลังปฏิบัติงาน': 1,
          'กำลังขับอยู่': 1,
          'substitute': 2,
          'ขับแทน': 2,
          'leave': 3,
          'ลางาน': 3,
          'maintenance': 4,
          'ซ่อมบำรุง': 4,
          'inactive': 5,
          'ระงับใช้งาน': 5,
          'พักงาน/ออก': 5,
          'พ้นสภาพ': 5,
          'completed': 6,
          'สิ้นสุดแล้ว': 6,
          'สิ้นสุด': 6
        };
        const cleanA = String(vA).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const cleanB = String(vB).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const rankA = statusRank[vA] || statusRank[cleanA] || 99;
        const rankB = statusRank[vB] || statusRank[cleanB] || 99;
        if (rankA !== rankB) {
          return (rankA - rankB) * mult;
        }
      }

      // Special handling for Operation Type ranking
      if (key === 'operation_type') {
        const opRank = {
          'primary': 1,
          'คนขับประจำ': 1,
          'substitute': 2,
          'ขับแทน': 2,
          'contract': 3,
          'จ๊อบพิเศษ': 3
        };
        const cleanA = String(vA).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const cleanB = String(vB).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').trim();
        const rankA = opRank[vA] || opRank[cleanA] || 99;
        const rankB = opRank[vB] || opRank[cleanB] || 99;
        if (rankA !== rankB) {
          return (rankA - rankB) * mult;
        }
      }

      // Check for numeric values (strip commas, %, บาท, วัน, prefix 'รถ ')
      const strA = String(vA).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').replace(/,/g, '').replace(/%/g, '').replace(/บาท/g, '').replace(/วัน/g, '').replace(/^รถ\s*/, '').trim();
      const strB = String(vB).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️/g, '').replace(/,/g, '').replace(/%/g, '').replace(/บาท/g, '').replace(/วัน/g, '').replace(/^รถ\s*/, '').trim();

      const numA = Number(strA);
      const numB = Number(strB);
      if (!isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '' && !strA.includes('-') && !strA.includes('/')) {
        return (numA - numB) * mult;
      }

      // Date comparison (DD/MM/YYYY or YYYY-MM-DD or ISO timestamp)
      const parseDateVal = (val) => {
        if (!val) return null;
        if (String(val).includes('ปัจจุบัน') || String(val).includes('Ongoing')) return new Date(9999, 11, 31).getTime();
        const s = String(val).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
          const [d, m, y] = s.split('/');
          return new Date(`${y}-${m}-${d}`).getTime();
        }
        const parsed = Date.parse(s);
        return isNaN(parsed) ? null : parsed;
      };

      const dateA = parseDateVal(vA) || parseDateVal(a[key]);
      const dateB = parseDateVal(vB) || parseDateVal(b[key]);
      if (dateA !== null && dateB !== null) {
        return (dateA - dateB) * mult;
      }

      // Default Thai Locale String Comparison (with natural number sorting)
      return strA.localeCompare(strB, 'th', { numeric: true, sensitivity: 'base' }) * mult;
    });
  };

  // Helper to format date as DD/MM/YYYY for measurement
  const formatDateHelper = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return String(dateStr);
    }
  };

  // Precision Text Width Measurement using HTML5 Canvas
  const measureTextPx = (text, isBold = false, isMonospace = false) => {
    if (!text && text !== 0) return 0;
    const str = String(text).trim();
    if (!str) return 0;
    
    // Extra allowance for emoji render width (~14px per emoji)
    const emojiMatches = str.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    const emojiExtra = emojiMatches ? emojiMatches.length * 12 : 0;

    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (isMonospace) {
          ctx.font = isBold ? '700 13.5px monospace, ui-monospace, Courier, sans-serif' : '500 13px monospace, ui-monospace, Courier, sans-serif';
        } else {
          ctx.font = isBold ? '700 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : '500 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        }
        return Math.ceil(ctx.measureText(str).width) + emojiExtra;
      }
    } catch (e) {}
    
    // Fallback: Strip Thai tone/vowel marks that don't add horizontal width
    const visualLen = str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;
    const charWidth = isMonospace ? 8.5 : (isBold ? 8.2 : 7.6);
    return Math.ceil(visualLen * charWidth) + emojiExtra;
  };

  // Auto-fit Column (Pixel Precision - Snug fit for text, headers & badge elements)
  const handleAutoFitColumn = (col, customRecords = null) => {
    const isMonospaceCol = ['truck_no', 'container_no', 'booking_bl', 'seal_no', 'license_plate'].includes(col);
    const headerText = aliases[col] || defaultNames[col] || col;
    
    // Header width: Header Text + Sort Icon (▲/▼/↕) + Header Padding (14px + 14px) + Icon Gap (5px) + Buffer
    const headerW = measureTextPx(headerText, true, false) + 48;
    let maxCellW = 0;

    const recordsToSample = (customRecords && customRecords.length > 0) ? customRecords : sampleRecords;
    (recordsToSample || []).slice(0, 500).forEach(r => {
      const rawVal = r[col];
      let valStr = '';
      if (formatCellValue) {
        valStr = formatCellValue(col, rawVal, r);
      } else {
        // Smart Built-in Fallbacks for Badges & Formatted Fields across all views
        if (col === 'end_date') {
          if (!rawVal || r?.status === 'active') {
            valStr = '🟢 ปัจจุบัน (Ongoing)';
          } else {
            valStr = formatDateHelper(rawVal);
          }
        } else if (col === 'start_date' || col === 'date_job' || col === 'date_eta' || col === 'employment_date' || col === 'act_expire_date' || col === 'tax_expire_date' || col === 'insurance_expire_date') {
          valStr = formatDateHelper(rawVal);
        } else if (col === 'status') {
          if (rawVal === 'active') valStr = '🟢 ปกติ (Active)';
          else if (rawVal === 'leave') valStr = '🟡 ลางาน';
          else if (rawVal === 'inactive') valStr = '⚪ พักงาน/ออก';
          else if (rawVal === 'completed') valStr = '⚪ สิ้นสุดแล้ว';
          else if (rawVal === 'maintenance') valStr = '🔧 ซ่อมบำรุง';
          else valStr = String(rawVal || '');
        } else if (col === 'work_status') {
          if (r?.driver_type === 'substitute' || r?.operation_type === 'substitute') valStr = '🟡 ขับแทน';
          else if (r?.status === 'leave') valStr = '🟡 ลางาน';
          else if (r?.status === 'inactive') valStr = '⚪ พ้นสภาพ';
          else if (r?.assigned_truck_no && r?.assigned_truck_no !== '-') valStr = '🟢 ขับประจำ';
          else valStr = '⚪ ว่าง';
        } else if (col === 'assigned_truck_no') {
          valStr = (rawVal && rawVal !== '-') ? String(rawVal).trim() : '-';
        } else if (col === 'operation_type') {
          valStr = rawVal === 'primary' ? '🟢 คนขับประจำ' : (rawVal === 'substitute' ? '🟡 ขับแทน' : (rawVal === 'contract' ? '🟣 จ๊อบพิเศษ' : String(rawVal || '')));
        } else if (col === 'duration_days') {
          valStr = `${rawVal || 0} วัน`;
        } else if (col === 'trip_rate') {
          valStr = rawVal ? `${Number(rawVal).toLocaleString()} บาท` : '-';
        } else if (col === 'match_status' || col === 'ocr_status') {
          valStr = rawVal === 'green' ? '🟢 ตรง 100%' : (rawVal === 'blue' ? '🔵 ใกล้เคียง' : (rawVal === 'yellow' ? '🟡 ตู้ซ้ำ' : (rawVal === 'red' ? '🔴 ไม่พบในใบวางบิล' : String(rawVal || ''))));
        } else if (col === 'workflow_status') {
          valStr = rawVal === 'completed' ? '🟢 ตรวจแล้ว' : '🟡 รอตรวจ';
        } else if (col === 'item_count') {
          valStr = `${rawVal || 0} ตู้`;
        } else {
          valStr = String(rawVal || '');
        }
      }

      if (valStr && valStr !== '-') {
        const hasBadge = valStr.includes('🟢') || valStr.includes('🟡') || valStr.includes('⚪') || valStr.includes('🔴') || valStr.includes('🔵') || valStr.includes('🟣') || valStr.includes('🔧') || valStr.includes('⚠️');
        
        // Extra allowance based on cell type:
        // - Badge: inner padding (16px) + cell padding (28px) + icon gap (4px) = 48px
        // - Plain text: cell padding (28px) + safety buffer (8px) = 36px
        const paddingExtra = hasBadge ? 48 : 36;
        const isBoldCell = col === 'truck_no' || col === 'driver_name' || col === 'assigned_driver_name' || col === 'assigned_truck_no';
        const w = measureTextPx(valStr, isBoldCell, isMonospaceCol) + paddingExtra;
        if (w > maxCellW) maxCellW = w;
      }
    });

    // Special minimum baseline for formatted status badges
    if (col === 'work_status') {
      maxCellW = Math.max(maxCellW, 110);
    }

    // Snug Auto Width: exactly fit content or header, never clipped
    const autoWidth = Math.min(Math.max(headerW, maxCellW, 75), 600);

    setColumnWidths(prev => {
      const updated = { ...prev, [col]: autoWidth };
      try {
        localStorage.setItem(`${storageKeyPrefix}_column_widths`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Toggle Visibility
  const handleToggleColumnHide = (col) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [col]: !prev[col] };
      try {
        localStorage.setItem(`${storageKeyPrefix}_visible_columns`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Show All Columns (Unhide All)
  const handleShowAllColumns = () => {
    const next = {};
    allColumns.forEach(col => {
      next[col] = true;
    });
    setVisibleColumns(next);
    try {
      localStorage.removeItem(`${storageKeyPrefix}_visible_columns`);
    } catch (e) {}
  };

  // Reset Width
  const handleResetColumnWidth = (col) => {
    setColumnWidths(prev => {
      const next = { ...prev };
      delete next[col];
      try {
        localStorage.setItem(`${storageKeyPrefix}_column_widths`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Global click listener to close context menu
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  // Header Context Menu
  const handleHeaderContextMenu = (arg1, arg2) => {
    let e, col;
    if (arg1 && typeof arg1.preventDefault === 'function') {
      e = arg1;
      col = arg2;
    } else {
      col = arg1;
      e = arg2;
    }
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        col: col
      });
    }
  };

  // Open Rename Dialog
  const handleStartRename = (col) => {
    setContextMenu(null);
    setRenamingColumn({
      col,
      currentName: aliases[col] || defaultNames[col] || col,
      defaultName: defaultNames[col] || col
    });
  };

  // Save Alias (Centralized)
  const handleSaveAlias = async (col, newAlias) => {
    if (!col) return;
    const cleanAlias = (newAlias || '').trim();
    
    setAliases(prev => {
      const updated = { ...prev, [col]: cleanAlias };
      try {
        localStorage.setItem('app_column_aliases', JSON.stringify(updated));
        localStorage.setItem(`${storageKeyPrefix}_column_aliases`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    
    try {
      await supabase
        .from('column_aliases')
        .upsert({ 
          original_name: col, 
          alias_name: cleanAlias, 
          updated_at: new Date().toISOString() 
        }, { onConflict: 'original_name' });
    } catch (err) {
      console.warn('Save alias warning:', err);
    }
  };

  // Reset Alias
  const handleResetAlias = async (col) => {
    if (!col) return;
    setAliases(prev => {
      const updated = { ...prev };
      delete updated[col];
      try {
        localStorage.setItem('app_column_aliases', JSON.stringify(updated));
        localStorage.setItem(`${storageKeyPrefix}_column_aliases`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await supabase
        .from('column_aliases')
        .delete()
        .eq('original_name', col);
    } catch (err) {}
  };

  // Reset All Aliases
  const handleResetAllAliases = async () => {
    if (!window.confirm("ต้องการรีเซ็ตชื่อคอลัมน์ทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?")) return;
    setAliases({ ...defaultNames });
    try {
      localStorage.removeItem('app_column_aliases');
      localStorage.removeItem('container_column_aliases');
      localStorage.removeItem(`${storageKeyPrefix}_column_aliases`);
    } catch (e) {}
    try {
      await supabase.from('column_aliases').delete().neq('original_name', '__dummy__');
    } catch (err) {}
  };

  return {
    aliases,
    setAliases,
    renamingColumn,
    setRenamingColumn,
    visibleColumns,
    setVisibleColumns,
    showColumnMenu,
    setShowColumnMenu,
    columnWidths,
    setColumnWidths,
    columnOrder,
    setColumnOrder,
    draggedCol,
    setDraggedCol,
    dragOverCol,
    setDragOverCol,
    contextMenu,
    setContextMenu,
    allColumns,
    activeColumns,
    getColDisplayName,
    getDefaultColWidth,
    handleColumnReorder,
    handleResetColumnOrder,
    handleResizeMouseDown,
    handleAutoFitColumn,
    handleToggleColumnHide,
    handleShowAllColumns,
    handleResetColumnWidth,
    handleHeaderContextMenu,
    handleStartRename,
    handleSaveAlias,
    handleResetAlias,
    handleResetAllAliases,
    sortConfig,
    setSortConfig,
    handleSort,
    sortRecords
  };
}

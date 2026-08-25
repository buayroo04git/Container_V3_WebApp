import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

/**
 * 🎛️ Reusable Hook for Excel-grade Column Management
 * Supports:
 * 1. Column Visibility (Show / Hide)
 * 2. Drag & Drop Reordering
 * 3. Border Resize Handles
 * 4. Double-click Auto-fit (Single Column & All Columns)
 * 5. Automatic Snug Auto-fit on Initial Load
 * 6. Right-click Context Menu
 * 7. Column Aliases (Rename Modal + LocalStorage + Supabase sync)
 */
export function useColumnPreferences({
  storageKeyPrefix = 'table',
  rawColumns = [],
  defaultWidths = {},
  defaultNames = {},
  initialAliases = {},
  sampleRecords = [],
  formatCellValue = (col, val) => String(val || ''),
  autoFitOnMount = false,
  onSortChange = null
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
  const menuRef = useRef(null);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showColumnMenu]);

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

    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const currentWidth = Math.max(startWidth + (moveEvent.clientX - startX), 30);
      setColumnWidths(prev => ({
        ...prev,
        [col]: currentWidth
      }));
    };

    const onMouseUp = () => {
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
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
    if (!col || col === 'actions') return;
    setSortConfig(prev => {
      let next;
      if (prev.key === col) {
        if (prev.direction === 'asc') next = { key: col, direction: 'desc' };
        else next = { key: null, direction: 'asc' };
      } else {
        next = { key: col, direction: 'asc' };
      }
      if (typeof onSortChange === 'function') {
        onSortChange(next);
      }
      return next;
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

      // Check for numeric values (strip commas, %, ฿, บาท, วัน, prefix 'รถ ')
      const strA = String(vA).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️|฿/g, '').replace(/,/g, '').replace(/%/g, '').replace(/บาท/g, '').replace(/วัน/g, '').replace(/^รถ\s*/, '').trim();
      const strB = String(vB).replace(/🟢|🟡|⚪|🔴|🔵|🟣|🔧|⚠️|฿/g, '').replace(/,/g, '').replace(/%/g, '').replace(/บาท/g, '').replace(/วัน/g, '').replace(/^รถ\s*/, '').trim();

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

  // Precision Text Width Measurement with Thai font metric compatibility
  const measureTextPx = (text, isBold = false, isMonospace = false, fontSize = '13px') => {
    if (!text && text !== 0) return 0;
    const str = String(text).trim();
    if (!str) return 0;

    let measuredWidth = 0;
    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (isMonospace) {
          ctx.font = isBold 
            ? `700 ${fontSize} "SF Mono", Monaco, Consolas, "Courier New", monospace` 
            : `500 ${fontSize} "SF Mono", Monaco, Consolas, "Courier New", monospace`;
        } else {
          ctx.font = isBold 
            ? `700 ${fontSize} -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Leelawadee UI", "Noto Sans Thai", sans-serif` 
            : `500 ${fontSize} -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Leelawadee UI", "Noto Sans Thai", sans-serif`;
        }
        measuredWidth = Math.ceil(ctx.measureText(str).width);
      }
    } catch (e) {}

    if (measuredWidth <= 0) {
      // Fallback calculation for Thai characters & emojis
      const visualLen = str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;
      const charWidth = isMonospace ? 8.8 : (isBold ? 8.5 : 7.8);
      measuredWidth = Math.ceil(visualLen * charWidth);
    }

    return measuredWidth;
  };

  // Calculate Single Column Auto-Fit Width (Snug Pixel-Precision)
  const calculateColAutoFitWidth = (col, customRecords = null, tableElement = null) => {
    // Fixed compact width for index / # / id column
    if (col === 'index' || col === '#' || col === 'id') {
      return defaultWidths[col] || 45;
    }
    if (col === 'actions') {
      return defaultWidths['actions'] || 105;
    }

    const isMonospaceCol = ['truck_no', 'container_no', 'booking_bl', 'seal_no', 'license_plate', 'batch_no'].includes(col);
    const headerText = aliases[col] || defaultNames[col] || col;
    const isSortable = col !== 'actions' && col !== 'id';

    // 1. Initial estimated Header width (Text + Sort Icon + Cell Padding 20px + Buffer 12px)
    const headerTextWidth = measureTextPx(headerText, true, false, '12.5px');
    let headerW = headerTextWidth + (isSortable ? 16 : 0) + 32;

    let maxContentW = 0;

    // 2. Real-world DOM Measurement if rendered table is available
    try {
      if (typeof document !== 'undefined') {
        const targetTable = tableElement || document.querySelector(`th[data-col="${col}"]`)?.closest('table') || document.querySelector('table.universal-data-table') || document.querySelector('table');

        if (targetTable) {
          const measurer = document.createElement('div');
          measurer.style.cssText = 'position:absolute;visibility:hidden;top:-9999px;left:-9999px;white-space:nowrap;display:inline-block;width:auto;height:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Leelawadee UI","Noto Sans Thai",sans-serif;font-size:13px;font-weight:700;';
          document.body.appendChild(measurer);

          // 2.1 Measure actual DOM <th> element width
          const th = targetTable.querySelector(`th[data-col="${col}"]`);
          if (th) {
            const innerDiv = th.querySelector('div') || th;
            measurer.innerHTML = innerDiv.innerHTML;
            const naturalThW = measurer.getBoundingClientRect().width + 28;
            if (naturalThW > headerW) {
              headerW = naturalThW;
            }
          }

          // 2.2 Measure body cells <td>
          let colIdx = -1;
          const headerCells = Array.from(targetTable.querySelectorAll('thead th'));
          if (headerCells.length > 0) {
            colIdx = headerCells.findIndex(h => 
              h.getAttribute('data-col') === col || 
              h.innerText.includes(headerText)
            );
          }

          if (colIdx >= 0) {
            const rows = targetTable.querySelectorAll('tbody tr');
            measurer.style.fontSize = '13px';
            measurer.style.fontWeight = isMonospaceCol ? '700' : 'normal';

            const sampleRows = Array.from(rows).slice(0, 100);
            sampleRows.forEach(tr => {
              const td = tr.children[colIdx];
              if (td && td.innerText.trim() !== '') {
                measurer.innerHTML = td.innerHTML;
                const naturalW = measurer.getBoundingClientRect().width;
                if (naturalW > maxContentW) maxContentW = naturalW;
              }
            });
          }

          document.body.removeChild(measurer);
        }
      }
    } catch (err) {}

    // 3. Synthetic Data Measurement (fallback if DOM is empty)
    const recordsToSample = (customRecords && customRecords.length > 0) ? customRecords : sampleRecords;
    if (recordsToSample && recordsToSample.length > 0) {
      recordsToSample.slice(0, 200).forEach(r => {
        const rawVal = r[col];
        let valStr = '';
        if (formatCellValue) {
          valStr = formatCellValue(col, rawVal, r);
        } else {
          if (col === 'end_date') {
            valStr = (!rawVal || r?.status === 'active') ? '🟢 ปัจจุบัน' : formatDateHelper(rawVal);
          } else if (col.includes('date')) {
            valStr = formatDateHelper(rawVal);
          } else if (col === 'status') {
            if (rawVal === 'active') valStr = '🟢 ปกติ';
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
          } else if (col === 'operation_type') {
            valStr = rawVal === 'primary' ? '🟢 คนขับประจำ' : (rawVal === 'substitute' ? '🟡 ขับแทน' : (rawVal === 'contract' ? '🟣 จ๊อบพิเศษ' : String(rawVal || '')));
          } else if (typeof rawVal === 'number') {
            if (col.includes('earnings') || col.includes('price') || col.includes('amount') || col.includes('salary')) {
              valStr = `฿${rawVal.toLocaleString()}`;
            } else if (col.includes('count') || col.includes('containers')) {
              valStr = `${rawVal.toLocaleString()} ตู้`;
            } else {
              valStr = rawVal.toLocaleString();
            }
          }
        }

        if (col === 'image_url' || col === 'sheet_url' || col === 'photo_url' || (typeof valStr === 'string' && (valStr.startsWith('http://') || valStr.startsWith('https://') || valStr.startsWith('data:')))) {
          valStr = '🖼️ รูปภาพ';
        }

        if (valStr && valStr !== '-') {
          const isBoldCell = col === 'truck_no' || col === 'driver_name' || col === 'assigned_truck_no' || col === 'total_earnings';
          const w = measureTextPx(valStr, isBoldCell, isMonospaceCol, '13px');
          if (w > maxContentW) maxContentW = w;
        }
      });
    }

    // 4. Calculate Final Usable Cell Width:
    const cellRequiredW = maxContentW > 0 ? maxContentW + 24 : 0;

    // Minimum boundary per column type:
    let minW = 40;
    if (col === 'index' || col === '#') minW = 36;
    else if (col === 'actions') minW = 85;
    else if (col === 'size' || col === 'port') minW = 50;
    else if (col === 'driver_name' || col === 'assigned_driver_name') minW = 130;

    const calculatedWidth = Math.max(headerW, cellRequiredW, minW);
    return Math.min(Math.ceil(calculatedWidth), 550);
  };

  // Auto-fit Single Column
  const handleAutoFitColumn = (col, customRecords = null, event = null) => {
    const targetTable = event?.currentTarget?.closest('table') || null;
    const finalWidth = calculateColAutoFitWidth(col, customRecords, targetTable);

    setColumnWidths(prev => {
      const updated = { ...prev, [col]: finalWidth };
      try {
        localStorage.setItem(`${storageKeyPrefix}_column_widths`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Auto-fit All Visible Columns
  const handleAutoFitAllColumns = (customRecords = null, targetTable = null) => {
    const records = (customRecords && customRecords.length > 0) ? customRecords : sampleRecords;
    const newWidths = {};
    activeColumns.forEach(col => {
      newWidths[col] = calculateColAutoFitWidth(col, records, targetTable);
    });

    setColumnWidths(prev => {
      const updated = { ...prev, ...newWidths };
      try {
        localStorage.setItem(`${storageKeyPrefix}_column_widths`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    return newWidths;
  };

  // Automatically Auto-Fit All Columns on Initial Mount / First Data Load
  const hasAutoFittedRef = useRef(false);
  useEffect(() => {
    if (!autoFitOnMount || hasAutoFittedRef.current) return;
    const records = (sampleRecords && sampleRecords.length > 0) ? sampleRecords : null;
    if (records && records.length > 0) {
      const timer = setTimeout(() => {
        handleAutoFitAllColumns(records);
        hasAutoFittedRef.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [sampleRecords, autoFitOnMount, activeColumns]);

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

  // Reset Width of Single Column
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

  // Reset All Column Widths back to default
  const handleResetAllColumnWidths = () => {
    setColumnWidths({});
    try {
      localStorage.removeItem(`${storageKeyPrefix}_column_widths`);
    } catch (e) {}
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
    menuRef,
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
    handleAutoFitAllColumns,
    handleToggleColumnHide,
    handleShowAllColumns,
    handleResetColumnWidth,
    handleResetAllColumnWidths,
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

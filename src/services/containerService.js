import { supabase } from '../supabaseClient';

/**
 * 📦 Container Service
 * บริการจัดการข้อมูล Master Database และการ Reconcile ตู้คอนเทนเนอร์
 */
export const containerService = {
  /**
   * ดึงข้อมูล Master Containers ทั้งหมดจาก Supabase
   */
  async fetchMasterContainers() {
    try {
      const { data, error } = await supabase
        .from('container_records')
        .select('*');

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('containerService.fetchMasterContainers error:', error);
      return { data: [], error };
    }
  },

  /**
   * ดึงข้อมูล Master Containers แบบแบ่งหน้า (Server-Side Pagination & Filter)
   */
  async fetchMasterContainersPaginated(params = {}) {
    const {
      page = 1,
      pageSize = 50,
      searchTerm = '',
      batchName = 'ALL',
      truckNo = 'ALL',
      port = 'ALL',
      dateFrom = null,
      dateTo = null,
      sortBy = 'id',
      sortAsc = false
    } = params;

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('container_records')
        .select('*', { count: 'exact' });

      if (searchTerm && searchTerm.trim()) {
        const cleanTerm = searchTerm.trim();
        query = query.or(`container_no.ilike.%${cleanTerm}%,truck_no.ilike.%${cleanTerm}%,batch_name.ilike.%${cleanTerm}%`);
      }
      if (batchName && batchName !== 'ALL') {
        query = query.eq('batch_name', batchName);
      }
      if (truckNo && truckNo !== 'ALL') {
        query = query.eq('truck_no', truckNo);
      }
      if (port && port !== 'ALL') {
        query = query.eq('port', port);
      }
      if (dateFrom) {
        query = query.or(`date_job_parsed.gte.${dateFrom},date_job.gte.${dateFrom}`);
      }
      if (dateTo) {
        query = query.or(`date_job_parsed.lte.${dateTo},date_job.lte.${dateTo}`);
      }

      query = query.order(sortBy, { ascending: sortAsc }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        error: null
      };
    } catch (error) {
      console.error('containerService.fetchMasterContainersPaginated error:', error);
      return { data: [], total: 0, page: 1, pageSize, totalPages: 0, error };
    }
  },

  /**
   * ดึงข้อมูลผลการสแกน OCR ทั้งหมดจากตาราง ocr_records
   */
  async fetchOcrRecords() {
    try {
      const { data, error } = await supabase
        .from('ocr_records')
        .select('*');

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('containerService.fetchOcrRecords error:', error);
      return { data: [], error };
    }
  },

  /**
   * ดึงการตั้งชื่อ Alias ของคอลัมน์
   */
  async fetchColumnAliases() {
    try {
      const { data, error } = await supabase
        .from('column_aliases')
        .select('*');

      if (error) throw error;

      const aliasMap = {};
      (data || []).forEach(item => {
        aliasMap[item.original_name] = item.alias_name;
      });

      return { data: aliasMap, error: null };
    } catch (error) {
      console.error('containerService.fetchColumnAliases error:', error);
      return { data: {}, error };
    }
  },

  /**
   * บันทึกหรืออัปเดตชื่อ Alias ของคอลัมน์
   */
  async saveColumnAlias(originalName, aliasName) {
    try {
      const { error } = await supabase
        .from('column_aliases')
        .upsert(
          { original_name: originalName, alias_name: aliasName.trim() },
          { onConflict: 'original_name' }
        );

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('containerService.saveColumnAlias error:', error);
      return { success: false, error };
    }
  },

  /**
   * นำเข้าข้อมูล Master Container แบบแบ่ง Chunk
   * @param {Array<object>} rows - รายการข้อมูลที่ต้องการเพิ่ม
   * @param {number} [chunkSize=500] - ขนาดต่อชุด
   * @param {function} [onProgress] - Callback แจ้งสถานะ %
   */
  async importMasterContainers(rows, chunkSize = 500, onProgress = null) {
    if (!rows || rows.length === 0) return { success: true, count: 0, error: null };

    try {
      let insertedCount = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('container_records')
          .insert(chunk);

        if (insertError) throw insertError;
        insertedCount += chunk.length;

        if (onProgress) {
          const progress = Math.min(100, Math.round((insertedCount / rows.length) * 100));
          onProgress(progress, insertedCount, rows.length);
        }
      }

      return { success: true, count: insertedCount, error: null };
    } catch (error) {
      console.error('containerService.importMasterContainers error:', error);
      return { success: false, count: 0, error };
    }
  },

  /**
   * ล้างข้อมูล Master Container ทั้งหมดในตาราง container_records
   */
  async clearMasterContainers() {
    try {
      const { error } = await supabase
        .from('container_records')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('containerService.clearMasterContainers error:', error);
      return { success: false, error };
    }
  }
};

export default containerService;

// Utility สำหรับจัดการ Google Drive API ผ่าน Access Token

export const getOrCreateFolder = async (accessToken, folderName, parentId = null) => {
  let q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }
  
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
    const errData = await searchRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive Search failed with HTTP ${searchRes.status}`);
  }
  
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  // ถ้าไม่เจอ ให้สร้างใหม่
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : []
  };
  
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  
  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive Create Folder failed with HTTP ${createRes.status}`);
  }
  
  const createData = await createRes.json();
  return createData.id;
};

export const uploadImageToDrive = async (accessToken, folderId, base64Data, filename) => {
  // สร้าง multipart request body
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";
  
  const metadata = {
    name: filename,
    mimeType: 'image/jpeg',
    parents: [folderId]
  };
  
  // แปลง base64 เป็น binary string
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: image/jpeg\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      close_delim;
      
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Drive upload failed with HTTP status ${res.status}`);
  }
  
  const data = await res.json();
  return {
    id: data.id,
    webViewLink: data.webViewLink,
    thumbnailLink: data.thumbnailLink
  };
};

export const moveFileInDrive = async (accessToken, fileId, newParentFolderId, previousParentFolderId = null) => {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentFolderId}&fields=id,parents,webViewLink`;
  if (previousParentFolderId) {
    url += `&removeParents=${previousParentFolderId}`;
  }
  
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await res.json();
  return data;
};

// ดึงรายการไฟล์ภาพทั้งหมดในโฟลเดอร์ Pending_Job_Sheets บน Google Drive
export const listPendingFilesInDrive = async (accessToken) => {
  try {
    const pendingFolderId = await getOrCreateFolder(accessToken, 'Pending_Job_Sheets');
    const q = `'${pendingFolderId}' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,thumbnailLink,webViewLink,webContentLink,createdTime,size,description)&pageSize=100&orderBy=createdTime desc`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    return {
      folderId: pendingFolderId,
      files: data.files || []
    };
  } catch (err) {
    console.error("listPendingFilesInDrive error:", err);
    throw err;
  }
};

// ดาวน์โหลดเนื้อหารูปภาพจาก Google Drive เป็น Blob
export const fetchImageBlobFromDrive = async (accessToken, fileId) => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`ไม่สามารถโหลดรูปภาพจาก Drive ได้ (${res.status} ${res.statusText})`);
  return await res.blob();
};

// ตั้งค่าสิทธิ์ไฟล์/โฟลเดอร์ให้เป็นสาธารณะ (เปิดดูผ่านลิงก์ได้โดยไม่ต้อง Login)
export const setFilePublicReadable = async (accessToken, fileId) => {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
    return res.ok;
  } catch (e) {
    console.warn("Could not set public permission on Drive file:", e);
    return false;
  }
};

// อัปโหลดรูปภาพตรงเข้าโฟลเดอร์ Pending_Job_Sheets บน Google Drive พร้อมเปิดแชร์สาธารณะอัตโนมัติ
export const uploadImageToPendingDrive = async (accessToken, base64Data, filename) => {
  const pendingFolderId = await getOrCreateFolder(accessToken, 'Pending_Job_Sheets');
  await setFilePublicReadable(accessToken, pendingFolderId);
  const result = await uploadImageToDrive(accessToken, pendingFolderId, base64Data, filename);
  if (result.id) {
    await setFilePublicReadable(accessToken, result.id);
  }
  return {
    ...result,
    directImageUrl: `https://lh3.googleusercontent.com/d/${result.id}`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${result.id}&sz=w600`
  };
};

// ลบไฟล์ออกจาก Google Drive
export const deleteFileFromDrive = async (accessToken, fileId) => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.ok;
};



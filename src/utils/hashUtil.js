export async function calculateFileHash(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // Convert first 32 characters to standard UUID format: 8-4-4-4-12
    const uuid = `${hashHex.slice(0, 8)}-${hashHex.slice(8, 12)}-${hashHex.slice(12, 16)}-${hashHex.slice(16, 20)}-${hashHex.slice(20, 32)}`;
    return uuid;
  } catch (error) {
    // Fallback: Create a pseudo-UUID from name and size if Crypto API fails
    const fallbackStr = (file.name + file.size).padEnd(32, '0').replace(/[^a-f0-9]/gi, 'a').toLowerCase();
    return `${fallbackStr.slice(0, 8)}-${fallbackStr.slice(8, 12)}-${fallbackStr.slice(12, 16)}-${fallbackStr.slice(16, 20)}-${fallbackStr.slice(20, 32)}`;
  }
}

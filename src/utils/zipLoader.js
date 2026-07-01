import JSZip from "jszip";

export async function extractZipEntries(zipFile) {
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(zipFile);
  });

  const zip = await JSZip.loadAsync(arrayBuffer, {
    decodeFileName: (bytes) => {
      // Shift_JISデコード（日本のMMDアセット対応）
      try {
        return new TextDecoder("shift_jis").decode(bytes);
      } catch (e) {
        return new TextDecoder("utf-8").decode(bytes);
      }
    }
  });

  const entries = [];
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const cleanPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
    const blob = await file.async("blob");
    entries.push({
      path: cleanPath,
      blob: blob,
      name: cleanPath.split("/").pop() || ""
    });
  }

  return entries;
}

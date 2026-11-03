import JSZip from "jszip";

export async function readScoreFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mxl") || name.endsWith(".musicxml.zip")) {
    return unzipMusicXml(await file.arrayBuffer());
  }
  return file.text();
}

async function unzipMusicXml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const container = zip.file("META-INF/container.xml");
  if (container) {
    const containerXml = await container.async("text");
    const match = containerXml.match(/full-path="([^"]+)"/);
    if (match?.[1]) {
      const entry = zip.file(match[1]);
      if (entry) return entry.async("text");
    }
  }

  const xmlFiles = Object.keys(zip.files).filter(
    (path) =>
      !path.startsWith("META-INF/") &&
      (path.endsWith(".xml") || path.endsWith(".musicxml")) &&
      !zip.files[path]!.dir,
  );

  const preferred =
    xmlFiles.find((p) => !/container/i.test(p)) ?? xmlFiles[0];
  if (!preferred) {
    throw new Error("No MusicXML file found inside the .mxl archive.");
  }
  return zip.file(preferred)!.async("text");
}

export function extractTitleFromXml(xml: string, fallback = "Untitled"): string {
  const match =
    xml.match(/<work-title[^>]*>([^<]+)<\/work-title>/i) ??
    xml.match(/<movement-title[^>]*>([^<]+)<\/movement-title>/i);
  return match?.[1]?.trim() || fallback;
}

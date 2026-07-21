const MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};

export function mimeType(path: string) {
  return MIME_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

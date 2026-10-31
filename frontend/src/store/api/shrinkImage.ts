// Shrinks a photo in the browser before upload: at most 1600 px on the longest side,
// JPEG (or WebP for PNGs, which keeps transparency). A 5 MB phone photo becomes a few
// hundred KB, so it uploads quickly on a weak connection. The server shrinks again as a
// safety net (backend config/cloudinary.ts). Anything that isn't a JPEG/PNG/WebP photo, or
// that's already small, is sent unchanged.

const MAX_SIDE = 1600;
const SKIP_BELOW = 400 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image"));
    };
    img.src = url;
  });

export const shrinkImage = async (file: File): Promise<File> => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= SKIP_BELOW) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + (type === "image/jpeg" ? ".jpg" : ".webp");
    return new File([blob], name, { type });
  } catch {
    return file;
  }
};

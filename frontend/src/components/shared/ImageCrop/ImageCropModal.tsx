import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "../../ui";
import styles from "./ImageCropModal.module.css";

// Square/round photo cropper with no extra dependencies: drag to position, zoom with the
// slider or mouse wheel, rotate in 90° steps. Produces a 512×512 JPEG blob.

const VIEW = 280; // on-screen crop window (px)
const OUT = 512; // output size (px)

interface ImageCropModalProps {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
  busy?: boolean;
  title?: string;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read this image"));
    img.src = src;
  });

const ImageCropModal = ({ file, onCancel, onCropped, busy, title = "Adjust your photo" }: ImageCropModalProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!src) return;
    loadImage(src)
      .then((i) => {
        setImg(i);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch((e) => setError(e.message));
  }, [src]);

  // Image scaled so it always covers the crop window at zoom 1.
  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;

  const clamp = useCallback(
    (x: number, y: number, ww = w, hh = h) => ({
      x: Math.max(-(ww - VIEW) / 2, Math.min((ww - VIEW) / 2, x)),
      y: Math.max(-(hh - VIEW) / 2, Math.min((hh - VIEW) / 2, y)),
    }),
    [w, h]
  );

  const setZoomClamped = (z: number) => {
    const nz = Math.max(1, Math.min(4, z));
    if (!img) return setZoom(nz);
    const nw = img.naturalWidth * base * nz;
    const nh = img.naturalHeight * base * nz;
    setZoom(nz);
    setOffset((o) => clamp(o.x, o.y, nw, nh));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Rotate by redrawing the image 90° into a new source.
  const rotate = async () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = img.naturalHeight;
    c.height = img.naturalWidth;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    setSrc(c.toDataURL("image/jpeg", 0.95));
  };

  const finish = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = OUT / VIEW;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, (VIEW / 2 - w / 2 + offset.x) * r, (VIEW / 2 - h / 2 + offset.y) * r, w * r, h * r);
    c.toBlob((blob) => blob && onCropped(blob), "image/jpeg", 0.9);
  };

  return (
    <Modal title={title} size="sm" onClose={busy ? () => undefined : onCancel}>
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : (
        <div className={styles.body}>
          <div
            className={styles.viewport}
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.0015)}
            role="img"
            aria-label="Drag to position your photo"
          >
            {img && src && (
              <img
                src={src}
                alt=""
                draggable={false}
                className={styles.image}
                style={{ width: w, height: h, left: VIEW / 2 - w / 2 + offset.x, top: VIEW / 2 - h / 2 + offset.y }}
              />
            )}
            <div className={styles.ring} />
          </div>
          <p className={styles.hint}>Drag to position · scroll or use the slider to zoom</p>
          <div className={styles.controls}>
            <span className={styles.zoomLabel}>Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
              aria-label="Zoom"
              className={styles.slider}
            />
            <Button size="sm" variant="outline" onClick={rotate} disabled={!img || busy}>
              Rotate
            </Button>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={finish} isLoading={busy} disabled={!img}>
              Save photo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ImageCropModal;

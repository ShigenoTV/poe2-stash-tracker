import { useRef, useState, type PointerEvent } from "react";
import { compactQuantity } from "../lib/format";
import {
  captureGame,
  loadRegion,
  saveRegion,
  scanRegion,
  type CapturePreview,
  type Region,
  type ScanResult,
} from "../lib/scanner";

const METHOD_LABEL = { wgc: "GPU (Windows Graphics Capture)", gdi: "GDI (repli)" };

export function ScannerView() {
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [region, setRegion] = useState<Region | null>(loadRegion);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const p = await run(captureGame);
    if (!p) return;
    setPreview(p);
    setResult(null);
    if (region) setResult((await run(() => scanRegion(region))) ?? null);
  }

  function point(e: PointerEvent): { x: number; y: number } {
    const box = frame.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((e.clientY - box.top) / box.height, 0), 1),
    };
  }

  function onDown(e: PointerEvent) {
    drag.current = point(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!drag.current) return;
    const p = point(e);
    const s = drag.current;
    setRegion({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }

  async function onUp() {
    drag.current = null;
    if (region && region.w > 0.02 && region.h > 0.02) {
      saveRegion(region);
      setResult((await run(() => scanRegion(region))) ?? null);
    }
  }

  const read = result?.slots.filter((s) => s.quantity !== null).length ?? 0;

  return (
    <div className="scanner">
      <div className="scanner-bar">
        <button type="button" className="primary" onClick={capture} disabled={busy}>
          {busy ? "…" : "Capturer le jeu"}
        </button>
        {preview && (
          <span className="muted">
            {preview.width}×{preview.height} · {METHOD_LABEL[preview.method]}
          </span>
        )}
        {error && <span className="update-error">{error}</span>}
      </div>

      {preview && (
        <>
          <p className="muted">
            {region ? "Zone du coffre enregistrée. Redessine-la si besoin." : "Encadre le coffre à la souris."}
          </p>
          <div
            ref={frame}
            className="capture-frame"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <img src={`data:image/png;base64,${preview.pngBase64}`} alt="Capture du jeu" draggable={false} />
            {region && (
              <div
                className="capture-region"
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.w * 100}%`,
                  height: `${region.h * 100}%`,
                }}
              />
            )}
          </div>
        </>
      )}

      {result && (
        <>
          <h2 className="scanner-title">
            {result.slots.length} cases occupées, {read} quantités lues
          </h2>
          <ul className="item-grid">
            {result.slots.map((s) => (
              <li key={`${s.x}-${s.y}`} className="item-tile" title={s.quantity === null ? "quantité illisible" : String(s.quantity)}>
                <img src={`data:image/png;base64,${s.iconPngBase64}`} alt="" className="item-icon" />
                <span className="item-qty">{s.quantity === null ? "?" : compactQuantity(s.quantity)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

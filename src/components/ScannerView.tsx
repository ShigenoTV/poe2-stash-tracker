import { useMemo, useRef, useState, type PointerEvent } from "react";
import { compactQuantity, formatValue } from "../lib/format";
import { SlotEditor } from "./SlotEditor";
import {
  captureGame,
  chosenItem,
  getPrices,
  labelSlot,
  loadRegion,
  saveRegion,
  scanRegion,
  type CapturePreview,
  type PriceFile,
  type Region,
  type ScanResult,
} from "../lib/scanner";

const METHOD_LABEL = { wgc: "GPU (Windows Graphics Capture)", gdi: "GDI (repli)" };

export function ScannerView() {
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [region, setRegion] = useState<Region | null>(loadRegion);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [prices, setPrices] = useState<PriceFile | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
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

  async function scan(r: Region) {
    const res = await run(() => scanRegion(r));
    setResult(res ?? null);
    if (res && !res.identifyError && !prices) setPrices((await run(getPrices)) ?? null);
  }

  async function pick(index: number, itemId: string) {
    const slot = result!.slots[index];
    await run(() => labelSlot(slot.descriptor, itemId));
    const slots = result!.slots.map((s, i) =>
      i === index ? { ...s, identification: { source: "memory" as const, candidates: [{ itemId, distance: 0 }] } } : s,
    );
    setResult({ ...result!, slots });
    setEditing(null);
  }

  async function capture() {
    const p = await run(captureGame);
    if (!p) return;
    setPreview(p);
    setResult(null);
    if (region) await scan(region);
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
      await scan(region);
    }
  }

  const read = result?.slots.filter((s) => s.quantity !== null).length ?? 0;
  const byId = useMemo(() => new Map((prices?.items ?? []).map((i) => [i.id, i])), [prices]);
  const exaltedPerDivine = prices?.rates.exalted ?? null;

  const valued = (result?.slots ?? []).map((slot) => {
    const chosen = chosenItem(slot);
    const item = chosen ? byId.get(chosen.itemId) : undefined;
    const total = item && slot.quantity !== null ? item.value * slot.quantity : null;
    return { slot, chosen, item, total };
  });
  const totalDivine = valued.reduce((sum, v) => sum + (v.total ?? 0), 0);
  const unknown = valued.filter((v) => !v.item).length;

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
            {prices && (
              <>
                {" · "}
                <span className="networth-inline">{formatValue(totalDivine)} div</span>
                {exaltedPerDivine && <span className="muted"> ({formatValue(totalDivine * exaltedPerDivine)} ex)</span>}
              </>
            )}
          </h2>
          {result.identifyError && <p className="update-error">Objets non identifiés : {result.identifyError}</p>}
          {prices && unknown > 0 && (
            <p className="muted">
              {unknown} case(s) sans objet reconnu, non comptées. Clique sur une case pour choisir l'objet ; l'app s'en
              souviendra.
            </p>
          )}
          <ul className="item-grid">
            {valued.map(({ slot, chosen, item, total }, i) => {
              const status = !item ? "unknown" : chosen?.confirmed ? "confirmed" : "guessed";
              const title = [
                item?.name ?? "Objet inconnu",
                slot.quantity === null ? "quantité illisible" : `× ${slot.quantity}`,
                total !== null ? `${formatValue(total)} div` : null,
                status === "guessed" ? "suggestion à confirmer" : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={`${slot.x}-${slot.y}`} className={`item-tile slot-${status}`} title={title}>
                  <button type="button" className="slot-button" onClick={() => prices && setEditing(i)}>
                    <img src={`data:image/png;base64,${slot.iconPngBase64}`} alt={item?.name ?? ""} className="item-icon" />
                    <span className="item-qty">{slot.quantity === null ? "?" : compactQuantity(slot.quantity)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {editing !== null && prices && (
            <SlotEditor
              slot={result.slots[editing]}
              prices={prices}
              onPick={(id) => pick(editing, id)}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

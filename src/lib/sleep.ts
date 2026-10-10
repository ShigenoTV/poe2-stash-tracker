/**
 * Attente qui ne ralentit pas quand la fenêtre est cachée (rangée dans la zone de notification).
 * Le navigateur espace fortement les `setTimeout` d'une page masquée (jusqu'à une fois par
 * minute) ; ceux d'un Web Worker ne le sont pas : le scan garde son rythme.
 */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, () => void>();

function timerWorker(): Worker | null {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    const code = "onmessage = (e) => setTimeout(() => postMessage(e.data.id), e.data.ms);";
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    worker.onmessage = (e: MessageEvent<number>) => {
      pending.get(e.data)?.();
      pending.delete(e.data);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function sleep(ms: number): Promise<void> {
  const w = timerWorker();
  if (!w) return new Promise((r) => setTimeout(r, ms));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, ms });
  });
}

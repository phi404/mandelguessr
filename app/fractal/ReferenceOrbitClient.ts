import { buildReferenceOrbitAsync, referenceOffset, repairOrbit, type ReferenceOrbit } from "./reference-orbit";
import type { Camera } from "./types";

export class ReferenceOrbitClient {
  private worker: Worker | null = null;
  private serial = 0;
  private cached: ReferenceOrbit | null = null;
  private pending: { id: number; resolve: (value: unknown) => void; reject: (error: Error) => void } | null = null;

  async reference(camera: Camera, maxIterations: number): Promise<ReferenceOrbit> {
    if (this.cached && this.cached.maxIterations >= maxIterations) {
      const offset = referenceOffset(camera, this.cached.camera);
      // Keep the reference through small pans and zooms; refresh after travelling.
      if (Math.hypot(...offset) < camera.viewportWidth / 2 && camera.viewportWidth >= this.cached.camera.viewportWidth/8 &&
          !(camera.viewportWidth<1e-12 && !this.cached.bla)) return this.cached;
    }
    const id = this.cancel();
    const orbit = this.getWorker()
      ? await this.request<ReferenceOrbit>({ id, kind: "reference", camera, maxIterations }, "orbit")
      : await buildReferenceOrbitAsync(camera, maxIterations, () => id !== this.serial);
    if (id !== this.serial) throw new DOMException("Cancelled", "AbortError");
    this.cached = orbit;
    return orbit;
  }

  async repair(camera: Camera, offsets: number[], maxIterations: number) {
    const id = this.cancel();
    if (this.getWorker()) return this.request<ReturnType<typeof repairOrbit>[]>({ id, kind: "repair", camera, offsets, maxIterations }, "pixels");
    const pixels = [];
    for (let index = 0; index < offsets.length; index += 2) {
      pixels.push(repairOrbit(camera, offsets[index], offsets[index + 1], maxIterations));
      if (index % 16 === 14) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (id !== this.serial) throw new DOMException("Cancelled", "AbortError");
      }
    }
    return pixels;
  }

  cancel() {
    this.serial++;
    this.pending?.reject(new DOMException("Cancelled", "AbortError"));
    this.pending = null;
    // A message interrupts the worker's next 512-iteration yield.
    this.worker?.postMessage({ id: this.serial, kind: "cancel" });
    return this.serial;
  }

  dispose() { this.cancel(); this.worker?.terminate(); this.worker = null; }

  private getWorker() {
    if (!this.worker && typeof Worker !== "undefined") {
      try { this.worker = new Worker(new URL("./reference-orbit.worker.ts", import.meta.url), { type: "module" }); }
      catch { return null; }
      this.worker.onerror = () => {
        this.pending?.reject(new Error("Reference orbit worker failed."));
        this.pending = null;
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }

  private request<T>(message: Record<string, unknown> & { id: number }, field: string) {
    return new Promise<T>((resolve, reject) => {
      this.pending = { id: message.id, resolve: value => resolve(value as T), reject };
      this.worker!.onmessage = (event: MessageEvent) => {
        if (event.data.id !== this.pending?.id) return;
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        if (event.data.error) pending.reject(new Error(event.data.error));
        else pending.resolve(event.data[field]);
      };
      this.worker!.postMessage(message);
    });
  }
}

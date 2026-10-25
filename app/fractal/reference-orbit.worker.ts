import { buildReferenceOrbitAsync, repairOrbit } from "./reference-orbit";
import type { Camera } from "./types";

let generation = 0;
self.onmessage = async (event: MessageEvent) => {
  const request = event.data as { id: number; kind: "reference" | "repair" | "cancel"; camera: Camera; maxIterations: number; offsets?: number[] };
  const current = ++generation;
  if (request.kind === "cancel") return;
  if (request.kind === "reference") {
    try {
      const orbit = await buildReferenceOrbitAsync(request.camera, request.maxIterations, () => generation !== current);
      const transfer = [orbit.data.buffer];
      if(orbit.bla)transfer.push(orbit.bla.high.buffer,orbit.bla.low.buffer,orbit.bla.bounds.buffer);
      self.postMessage({ id: request.id, orbit }, { transfer });
    } catch (error) {
      if (generation === current) self.postMessage({ id: request.id, error: String(error) });
    }
  } else {
    const pixels: { iteration: number; magnitudeSquared: number }[] = [];
    const offsets = request.offsets ?? [];
    for (let index = 0; index < offsets.length; index += 2) {
      pixels.push(repairOrbit(request.camera, offsets[index], offsets[index + 1], request.maxIterations));
      if (index % 16 === 14) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (generation !== current) return;
      }
    }
    self.postMessage({ id: request.id, pixels });
  }
};

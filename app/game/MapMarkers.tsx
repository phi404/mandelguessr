import { complexToScreen } from "../fractal/camera";
import type { ComplexCoordinate, ViewSnapshot } from "../fractal/types";

export type MarkerPosition = {
  x: number;
  y: number;
  left: string;
  top: string;
  visible: boolean;
};

export function markerPosition(
  coordinate: ComplexCoordinate | null,
  view: ViewSnapshot | null,
): MarkerPosition | null {
  if (!coordinate || !view) return null;

  const { x, y, visible } = complexToScreen(coordinate, view, {
    width: view.pixelWidth,
    height: view.pixelHeight,
  });

  return {
    x,
    y,
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    visible,
  };
}

export function MapMarker({
  kind,
  marker,
  label,
}: {
  kind: "guess" | "answer";
  marker: MarkerPosition | null;
  label?: string;
}) {
  if (!marker?.visible) return null;

  return (
    <div className={`map-marker ${kind}-marker`} style={{ left: marker.left, top: marker.top }} aria-hidden="true">
      <span />
      {label && <b className="result-marker-label">{label}</b>}
    </div>
  );
}

export function QuestionTarget({ marker }: { marker: MarkerPosition | null }) {
  if (!marker?.visible) return null;
  return (
    <div className="question-target" style={{ left: marker.left, top: marker.top }} aria-hidden="true">
      <span />
    </div>
  );
}

"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { UiIcon } from "./UiIcon";
import { useLanguage } from "../i18n/LanguageProvider";
import {
  WINDOW_ASPECT_RATIO,
  constrainWindow,
  initialWindow,
  resizeWindow,
  toggleWindowMinimized,
  visibleWindowWidth,
  windowWidthLimits,
  type ResizeCorner,
  type WindowBounds,
  type WindowLayout,
} from "./floating-window-layout";

type Gesture = {
  kind: "move" | ResizeCorner;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  layout: WindowLayout;
};

type FloatingQuestionWindowProps = {
  containerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  meta?: ReactNode;
  bottomInset?: number;
};

export function FloatingQuestionWindow({
  containerRef,
  children,
  meta,
  bottomInset = 72,
}: FloatingQuestionWindowProps) {
  const { t } = useLanguage();
  const contentId = useId();
  const [layout, setLayout] = useState<WindowLayout>({ x: 0, y: 0, width: 420, minimized: false });
  const [bounds, setBounds] = useState<WindowBounds>({ width: 1200, height: 800, bottomInset });
  const initializedRef = useRef(false);
  const gestureRef = useRef<Gesture | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextBounds = { width: entry.contentRect.width, height: entry.contentRect.height, bottomInset };
      setBounds(nextBounds);
      const firstLayout = !initializedRef.current;
      initializedRef.current = true;
      setLayout(current => firstLayout ? initialWindow(nextBounds) : constrainWindow(current, nextBounds));
      setReady(true);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [bottomInset, containerRef]);

  const currentBounds = (): WindowBounds => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height, bottomInset } : bounds;
  };

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"]) => {
    if (event.button !== 0 || gestureRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { kind, pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, layout };
    setDragging(true);
  };

  const continueGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.pointerX;
    const dy = event.clientY - gesture.pointerY;
    const nextBounds = currentBounds();
    if (gesture.kind === "move") {
      setLayout(constrainWindow({ ...gesture.layout, x: gesture.layout.x + dx, y: gesture.layout.y + dy }, nextBounds));
    } else {
      // Project onto the image diagonal to preserve the target's aspect ratio.
      const delta = (dx + dy / WINDOW_ASPECT_RATIO) / (1 + 1 / WINDOW_ASPECT_RATIO ** 2);
      const width = gesture.layout.width + (gesture.kind === "top-left" ? -delta : delta);
      setLayout(resizeWindow(gesture.layout, width, nextBounds, gesture.kind));
    }
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const corner = event.currentTarget.dataset.corner as ResizeCorner;
    event.currentTarget.focus();
    beginGesture(event, corner);
  };

  const handleResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const corner = event.currentTarget.dataset.corner as ResizeCorner;
    const nextBounds = currentBounds();
    const limits = windowWidthLimits(nextBounds);
    const step = event.shiftKey ? 32 : 8;
    const width = event.key === "Home" ? limits.minimum : event.key === "End" ? limits.maximum
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? layout.width + step
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? layout.width - step : null;
    if (width === null) return;
    event.preventDefault();
    setLayout(current => resizeWindow(current, width, nextBounds, corner));
  };

  const { minimum, maximum } = windowWidthLimits(bounds);
  return (
    <section
      className={`floating-question-window${layout.minimized ? " is-minimized" : ""}${ready ? " is-ready" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ left: layout.x, top: layout.y, width: visibleWindowWidth(layout) }}
      aria-label={t("targetWindow")}
    >
      <header
        className="floating-window-titlebar"
        onPointerDown={event => { if (!(event.target as HTMLElement).closest("button")) beginGesture(event, "move"); }}
        onPointerMove={continueGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        <div className="floating-window-caption">{meta && <strong>{meta}</strong>}</div>
        <button
          type="button"
          onClick={() => setLayout(current => toggleWindowMinimized(current, currentBounds()))}
          aria-label={layout.minimized ? t("restoreTarget") : t("minimizeTarget")}
          title={layout.minimized ? t("restoreTarget") : t("minimizeTarget")}
          aria-expanded={!layout.minimized}
          aria-controls={contentId}
        >
          <UiIcon name={layout.minimized ? "expand" : "minimize"} />
        </button>
      </header>
      <div className="floating-window-content" id={contentId} hidden={layout.minimized}>{children}</div>
      {!layout.minimized && (["top-left", "bottom-right"] as const).map(corner => (
        <div
          key={corner}
          data-corner={corner}
          className={`window-resize-handle resize-${corner}`}
          role="slider"
          tabIndex={0}
          aria-label={t("resizeTarget")}
          aria-valuemin={Math.round(minimum)}
          aria-valuemax={Math.round(maximum)}
          aria-valuenow={Math.round(layout.width)}
          aria-controls={contentId}
          title={t("resizeTarget")}
          onPointerDown={handleResizeStart}
          onPointerMove={continueGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onKeyDown={handleResizeKey}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 13V4h9M4 4l9 9" /></svg></div>
      ))}
    </section>
  );
}

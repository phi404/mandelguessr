"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { UiIcon } from "./UiIcon";
import { useLanguage } from "../i18n/LanguageProvider";

type WindowSize = "normal" | "large";

type WindowLayout = {
  x: number;
  y: number;
  width: number;
  size: WindowSize;
};

type DragState = {
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

const TITLEBAR_HEIGHT = 38;
const ASPECT_RATIO = 8 / 5;
const EDGE_GAP = 12;

function preferredWidth(
  size: WindowSize,
  containerWidth: number,
  containerHeight: number,
  bottomInset: number,
) {
  const compact = containerWidth < 600;
  const ratio = size === "large"
    ? compact ? 0.9 : 0.64
    : compact ? 0.58 : 0.34;
  const cap = size === "large" ? 880 : 470;
  const minimum = Math.min(compact ? 210 : 280, containerWidth - EDGE_GAP * 2);
  const maximumByHeight =
    Math.max(140, containerHeight - bottomInset - TITLEBAR_HEIGHT - EDGE_GAP * 2) *
    ASPECT_RATIO;

  return Math.max(
    Math.min(180, minimum),
    Math.min(
      cap,
      containerWidth - EDGE_GAP * 2,
      maximumByHeight,
      Math.max(minimum, containerWidth * ratio),
    ),
  );
}

function windowHeight(width: number) {
  return TITLEBAR_HEIGHT + width / ASPECT_RATIO;
}

function clampLayout(
  layout: WindowLayout,
  containerWidth: number,
  containerHeight: number,
  bottomInset: number,
): WindowLayout {
  const width = preferredWidth(
    layout.size,
    containerWidth,
    containerHeight,
    bottomInset,
  );
  const height = windowHeight(width);
  const maximumY = Math.max(0, containerHeight - bottomInset - height);

  return {
    ...layout,
    width,
    x: Math.max(0, Math.min(containerWidth - width, layout.x)),
    y: Math.max(0, Math.min(maximumY, layout.y)),
  };
}

export function FloatingQuestionWindow({
  containerRef,
  children,
  meta,
  bottomInset = 72,
}: FloatingQuestionWindowProps) {
  const { t } = useLanguage();
  const [layout, setLayout] = useState<WindowLayout>({
    x: 0,
    y: 0,
    width: 420,
    size: "normal",
  });
  const initializedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const readyFrameRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width: containerWidth, height: containerHeight } =
        entry.contentRect;

      setLayout((current) => {
        if (!initializedRef.current) {
          initializedRef.current = true;
          const width = preferredWidth(
            "normal",
            containerWidth,
            containerHeight,
            bottomInset,
          );
          readyFrameRef.current = window.requestAnimationFrame(() => {
            readyFrameRef.current = null;
            setReady(true);
          });
          return clampLayout(
            {
              x: containerWidth - width - EDGE_GAP,
              y:
                containerHeight -
                bottomInset -
                windowHeight(width) -
                EDGE_GAP,
              width,
              size: "normal",
            },
            containerWidth,
            containerHeight,
            bottomInset,
          );
        }

        return clampLayout(
          current,
          containerWidth,
          containerHeight,
          bottomInset,
        );
      });
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      if (readyFrameRef.current !== null) {
        window.cancelAnimationFrame(readyFrameRef.current);
      }
    };
  }, [bottomInset, containerRef]);

  const beginMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      layout,
    };
    setDragging(true);
  };

  const continueMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;

    const { width, height } = container.getBoundingClientRect();
    setLayout(
      clampLayout(
        {
          ...drag.layout,
          x: drag.layout.x + event.clientX - drag.pointerX,
          y: drag.layout.y + event.clientY - drag.pointerY,
        },
        width,
        height,
        bottomInset,
      ),
    );
  };

  const endMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const toggleSize = () => {
    const container = containerRef.current;
    if (!container) return;
    const { width: containerWidth, height: containerHeight } =
      container.getBoundingClientRect();

    setLayout((current) => {
      const currentWidth = current.width;
      const nextSize: WindowSize = current.size === "normal" ? "large" : "normal";
      const nextWidth = preferredWidth(
        nextSize,
        containerWidth,
        containerHeight,
        bottomInset,
      );

      return clampLayout(
        {
          x: current.x + currentWidth - nextWidth,
          y:
            current.y +
            windowHeight(currentWidth) -
            windowHeight(nextWidth),
          width: nextWidth,
          size: nextSize,
        },
        containerWidth,
        containerHeight,
        bottomInset,
      );
    });
  };

  const expanded = layout.size === "large";

  return (
    <section
      className={`floating-question-window ${expanded ? "is-large" : "is-normal"}${ready ? " is-ready" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ left: layout.x, top: layout.y, width: layout.width }}
      aria-label={t("targetWindow")}
    >
      <header
        className="floating-window-titlebar"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          beginMove(event);
        }}
        onPointerMove={continueMove}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onDoubleClick={toggleSize}
      >
        <div className="floating-window-caption">
          {meta && <strong>{meta}</strong>}
        </div>
        <button
          type="button"
          onClick={toggleSize}
          aria-label={expanded ? t("restoreTarget") : t("expandTarget")}
          title={expanded ? t("restoreSize") : t("expand")}
        >
          <UiIcon name={expanded ? "collapse" : "expand"} />
        </button>
      </header>

      <div className="floating-window-content">{children}</div>
    </section>
  );
}

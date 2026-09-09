import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type PointerMesh = { id: number; x: number; y: number; scale: number };
export type PointerStatus = "None" | "Clicked" | "Click candidate" | "Moving" | "Holding";

const MESH_LIFETIME = 1500;
const MAX_MESHES = 8;
const TRAIL_DISTANCE = 18;
const HOLD_TO_CLICK_MS = 3000;
const MOVE_THRESHOLD = 6;

export function usePointerMeshes(onPointer?: (xPercent: number, yPercent: number) => void, onTap?: () => void) {
  const [meshes, setMeshes] = useState<PointerMesh[]>([]);
  const [latestPointer, setLatestPointer] = useState<PointerMesh | null>(null);
  const [status, setStatus] = useState<PointerStatus>("None");
  const timers = useRef(new Set<number>());
  const statusTimer = useRef<number | null>(null);
  const isPointerDown = useRef(false);
  const startPosition = useRef({ x: 0, y: 0 });
  const lastTrailPosition = useRef({ x: 0, y: 0 });
  const lastPointerPosition = useRef({ x: 0, y: 0 });
  const trailScale = useRef(0.6);
  const touchPointers = useRef(new Set<number>());
  const isDragging = useRef(false);
  const holdClickFired = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const pendingDelta = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);

  const clearStatusTimer = () => {
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
      statusTimer.current = null;
    }
  };

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const addMesh = useCallback((x: number, y: number) => {
    const mesh = {
      id: Date.now() + Math.random(),
      x,
      y,
      scale: trailScale.current,
    };
    trailScale.current = Math.min(trailScale.current + 0.12, 1.5);
    setLatestPointer(mesh);
    setMeshes((current) => [...current, mesh].slice(-MAX_MESHES));

    const timer = window.setTimeout(() => {
      setMeshes((current) => current.filter(({ id }) => id !== mesh.id));
      timers.current.delete(timer);
    }, MESH_LIFETIME);
    timers.current.add(timer);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") touchPointers.current.add(event.pointerId);
      if (event.pointerType === "touch" && touchPointers.current.size > 1) {
        isPointerDown.current = false;
        clearHoldTimer();
        setStatus("None");
        return;
      }
      clearStatusTimer();
      isPointerDown.current = true;
      isDragging.current = false;
      startPosition.current = { x: event.clientX, y: event.clientY };
      lastTrailPosition.current = { x: event.clientX, y: event.clientY };
      lastPointerPosition.current = { x: event.clientX, y: event.clientY };
      trailScale.current = 0.6;
      holdClickFired.current = false;
      setStatus("Click candidate");
      holdTimer.current = window.setTimeout(() => {
        if (isPointerDown.current && !isDragging.current) {
          holdClickFired.current = true;
          setStatus("Clicked");
          onTap?.();
        }
      }, HOLD_TO_CLICK_MS);

      addMesh(event.clientX, event.clientY);
    },
    [addMesh, onTap],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    const moved = Math.hypot(
      event.clientX - startPosition.current.x,
      event.clientY - startPosition.current.y,
    );
    if (!isDragging.current && moved <= MOVE_THRESHOLD) return;
    if (!isDragging.current) {
      isDragging.current = true;
      lastPointerPosition.current = { x: event.clientX, y: event.clientY };
      clearStatusTimer();
      clearHoldTimer();
      setStatus("Moving");
    }
    const deltaX = event.clientX - lastPointerPosition.current.x;
    const deltaY = event.clientY - lastPointerPosition.current.y;
    lastPointerPosition.current = { x: event.clientX, y: event.clientY };
    if (deltaX !== 0 || deltaY !== 0) {
      pendingDelta.current = {
        x: (pendingDelta.current?.x ?? 0) + (deltaX / window.innerWidth) * 100,
        y: (pendingDelta.current?.y ?? 0) + (deltaY / window.innerHeight) * 100,
      };
      if (frame.current === null) {
        frame.current = window.requestAnimationFrame(() => {
          const delta = pendingDelta.current;
          pendingDelta.current = null;
          frame.current = null;
          if (delta) onPointer?.(delta.x, delta.y);
        });
      }

      const trailDistance = Math.hypot(
        event.clientX - lastTrailPosition.current.x,
        event.clientY - lastTrailPosition.current.y,
      );
      if (trailDistance >= TRAIL_DISTANCE) {
        addMesh(event.clientX, event.clientY);
      }
    }
  }, [addMesh, onPointer]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const wasSingleTouch = event.pointerType === "touch" && touchPointers.current.size === 1;
    const dragged = isDragging.current;
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    isPointerDown.current = false;
    isDragging.current = false;
    clearStatusTimer();
    clearHoldTimer();
    setStatus("Clicked");
    statusTimer.current = window.setTimeout(() => setStatus("None"), 800);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (wasSingleTouch && !dragged && !holdClickFired.current) onTap?.();
  }, [onTap]);

  const handlePointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    isPointerDown.current = false;
    isDragging.current = false;
    clearHoldTimer();
    pendingDelta.current = null;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    clearStatusTimer();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  useEffect(() => {
    const timersToClear = timers.current;
    return () => {
      timersToClear.forEach((timer) => window.clearTimeout(timer));
      clearStatusTimer();
      clearHoldTimer();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return {
    meshes,
    latestPointer,
    status,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}

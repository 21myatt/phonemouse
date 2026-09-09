import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type PointerMesh = { id: number; x: number; y: number; scale: number };
export type PointerStatus = "None" | "Clicked" | "Click candidate" | "Moving" | "Holding";

const MESH_LIFETIME = 1500;
const MAX_MESHES = 8;
const TRAIL_DISTANCE = 18;
const HOLD_TO_DRAG_MS = 400;
const MOVE_THRESHOLD = 6;
const DOUBLE_TAP_WINDOW_MS = 320;

export function usePointerMeshes(onPointer?: (xPercent: number, yPercent: number) => void, onTap?: (button: "left" | "right") => void, onScroll?: (dyPercent: number) => void, onButton?: (type: "button-down" | "button-up") => void, onDoubleTap?: () => void) {
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
  const holdReady = useRef(false);
  const hasMoved = useRef(false);
  const holdClickFired = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const pendingDelta = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const tapTimer = useRef<number | null>(null);
  const touchPositions = useRef(new Map<number, { x: number; y: number }>());
  const isScrolling = useRef(false);
  const twoFingerMoved = useRef(false);

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
      if (event.pointerType === "touch") touchPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (event.pointerType === "touch" && touchPointers.current.size > 1) {
        isPointerDown.current = false;
        isScrolling.current = true;
        twoFingerMoved.current = false;
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
      holdReady.current = false;
      hasMoved.current = false;
      setStatus("Click candidate");
      holdTimer.current = window.setTimeout(() => {
        if (isPointerDown.current && !isDragging.current) {
          holdReady.current = true;
          setStatus("Holding");
        }
      }, HOLD_TO_DRAG_MS);

      addMesh(event.clientX, event.clientY);
    },
    [addMesh],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && isScrolling.current) {
      const previous = touchPositions.current.get(event.pointerId);
      if (previous) {
        const delta = event.clientY - previous.y;
        if (Math.abs(delta) > MOVE_THRESHOLD) twoFingerMoved.current = true;
        if (delta !== 0) onScroll?.((delta / window.innerHeight) * 100);
      }
      touchPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }
    if (!isPointerDown.current) return;
    const moved = Math.hypot(
      event.clientX - startPosition.current.x,
      event.clientY - startPosition.current.y,
    );
    if (moved <= MOVE_THRESHOLD) return;
    hasMoved.current = true;
    if (!isDragging.current) {
      if (!holdReady.current) {
        const deltaX = event.clientX - lastPointerPosition.current.x;
        const deltaY = event.clientY - lastPointerPosition.current.y;
        lastPointerPosition.current = { x: event.clientX, y: event.clientY };
        setStatus("Moving");
        if (deltaX !== 0 || deltaY !== 0) onPointer?.((deltaX / window.innerWidth) * 100, (deltaY / window.innerHeight) * 100);
        return;
      }
      isDragging.current = true;
      onButton?.("button-down");
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
  }, [addMesh, onButton, onPointer, onScroll]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const wasSingleTouch = event.pointerType === "touch" && touchPointers.current.size === 1;
    const dragged = isDragging.current;
    if (dragged) onButton?.("button-up");
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    if (event.pointerType === "touch") touchPositions.current.delete(event.pointerId);
    if (event.pointerType === "touch" && touchPointers.current.size === 0) {
      if (!twoFingerMoved.current) onTap?.("right");
      isScrolling.current = false;
    }
    isPointerDown.current = false;
    isDragging.current = false;
    clearStatusTimer();
    clearHoldTimer();
    setStatus("Clicked");
    statusTimer.current = window.setTimeout(() => setStatus("None"), 800);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!isScrolling.current && wasSingleTouch && !dragged && !hasMoved.current && !holdClickFired.current) {
      if (tapTimer.current !== null) { window.clearTimeout(tapTimer.current); tapTimer.current = null; onDoubleTap?.(); }
      else tapTimer.current = window.setTimeout(() => { tapTimer.current = null; onTap?.("left"); }, DOUBLE_TAP_WINDOW_MS);
    }
  }, [onButton, onDoubleTap, onTap]);

  const handlePointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    if (event.pointerType === "touch") touchPositions.current.delete(event.pointerId);
    if (event.pointerType === "touch" && touchPointers.current.size === 0) { isScrolling.current = false; twoFingerMoved.current = false; }
    isPointerDown.current = false;
    isDragging.current = false;
    holdReady.current = false;
    hasMoved.current = false;
    if (event.pointerType === "touch") onButton?.("button-up");
    clearHoldTimer();
    pendingDelta.current = null;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    clearStatusTimer();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [onButton]);

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

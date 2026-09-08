import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type PointerMesh = { id: number; x: number; y: number; scale: number };
export type PointerStatus = "None" | "Clicked" | "Dragging" | "Holding";

const MESH_LIFETIME = 1500;
const MAX_MESHES = 8;
const TRAIL_DISTANCE = 18;

export function usePointerMeshes(onPointer?: (xPercent: number, yPercent: number) => void) {
  const [meshes, setMeshes] = useState<PointerMesh[]>([]);
  const [latestPointer, setLatestPointer] = useState<PointerMesh | null>(null);
  const [status, setStatus] = useState<PointerStatus>("None");
  const timers = useRef(new Set<number>());
  const statusTimer = useRef<number | null>(null);
  const isPointerDown = useRef(false);
  const startPosition = useRef({ x: 0, y: 0 });
  const lastTrailPosition = useRef({ x: 0, y: 0 });
  const trailScale = useRef(0.6);

  const clearStatusTimer = () => {
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
      statusTimer.current = null;
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
      clearStatusTimer();
      isPointerDown.current = true;
      startPosition.current = { x: event.clientX, y: event.clientY };
      lastTrailPosition.current = { x: event.clientX, y: event.clientY };
      trailScale.current = 0.6;
      setStatus("Clicked");
      statusTimer.current = window.setTimeout(() => {
        if (isPointerDown.current) setStatus("Holding");
      }, 500);

      addMesh(event.clientX, event.clientY);
      onPointer?.((event.clientX / window.innerWidth) * 100, (event.clientY / window.innerHeight) * 100);
    },
    [addMesh, onPointer],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    onPointer?.((event.clientX / window.innerWidth) * 100, (event.clientY / window.innerHeight) * 100);
    const moved = Math.hypot(
      event.clientX - startPosition.current.x,
      event.clientY - startPosition.current.y,
    );
    if (moved > 6) {
      clearStatusTimer();
      setStatus("Dragging");

      const trailDistance = Math.hypot(
        event.clientX - lastTrailPosition.current.x,
        event.clientY - lastTrailPosition.current.y,
      );
      if (trailDistance >= TRAIL_DISTANCE) {
        lastTrailPosition.current = { x: event.clientX, y: event.clientY };
        addMesh(event.clientX, event.clientY);
      }
    }
  }, [addMesh, onPointer]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    isPointerDown.current = false;
    clearStatusTimer();
    setStatus("Clicked");
    statusTimer.current = window.setTimeout(() => setStatus("None"), 800);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      clearStatusTimer();
    };
  }, []);

  return {
    meshes,
    latestPointer,
    status,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

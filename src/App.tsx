import "./App.css";
import { usePointerMeshes } from "./hooks/usePointerMeshes";
import { useViewportSize } from "./hooks/useViewportSize";

function App() {
  const viewport = useViewportSize();
  const {
    meshes,
    latestPointer,
    status,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePointerMeshes();
  return (
    <main
      className="canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="mesh-layer" aria-hidden="true">
        {meshes.map((mesh) => (
          <div
            className="mesh"
            key={mesh.id}
            style={{ left: mesh.x, top: mesh.y }}
          >
            <span
              className="mesh-ring"
              style={{ "--ring-scale": mesh.scale } as React.CSSProperties}
            />
          </div>
        ))}
      </div>
      <div className="logger-box" aria-label="Logging">
        <span className="log-label">Viewport:</span>
        <span className="log-value">
          {viewport.width} × {viewport.height}
        </span>

        <span className="log-label">Mouse:</span>
        <span className="log-value" aria-label="Mouse position">
          {latestPointer?.x ?? 0} × {latestPointer?.y ?? 0}
        </span>

        <span className="log-label">Status:</span>
        <span className="log-value" aria-label="Mouse Handle Status">
          {status}
        </span>
      </div>
    </main>
  );
}

export default App;

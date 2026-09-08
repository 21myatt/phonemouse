import { useEffect, useState } from "react";
import "./App.css";
import { usePointerMeshes } from "./hooks/usePointerMeshes";
import { useViewportSize } from "./hooks/useViewportSize";

function App() {
  const [connection, setConnection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("host") && params.has("session")
      ? "Connecting"
      : "Not paired";
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");
    const sessionId = params.get("session");
    if (!host || !sessionId) return;
    if (window.location.protocol === "https:" && host.startsWith("ws://")) {
      setConnection("Blocked: HTTPS cannot use ws://");
      return;
    }
    const socket = new WebSocket(host);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "pair", sessionId }));
    });
    socket.addEventListener("message", (event) => {
      try {
        if (JSON.parse(event.data).type === "paired") setConnection("Paired");
      } catch {
        setConnection("Pairing failed");
      }
    });
    socket.addEventListener("error", () =>
      setConnection("Connection failed (check LAN/WSS)"),
    );
    socket.addEventListener("close", () => setConnection("Disconnected"));
    return () => socket.close();
  }, [retry]);

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
        <span className="log-label">Connection:</span>
        <span className="log-value" aria-label="Connection Status">
          {connection}
        </span>
        {(connection === "Disconnected" || connection.startsWith("Connection failed")) && (
          <button
            className="reconnect-button"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setConnection("Connecting");
              setRetry((value) => value + 1);
            }}
          >
            Reconnect
          </button>
        )}
      </div>
    </main>
  );
}

export default App;

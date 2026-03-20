import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type: "error" | "success" | "";
  onDismiss: () => void;
}

export function Toast({ message, type, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3800);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast toast--${type} ${visible ? "toast--visible" : ""}`} role="alert">
      <span className="toast__icon">{type === "error" ? "✕" : "✓"}</span>
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} aria-label="Dismiss">✕</button>
    </div>
  );
}

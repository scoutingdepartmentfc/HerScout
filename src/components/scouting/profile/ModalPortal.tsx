"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders overlays on document.body, outside the zoomed player-profile canvas,
 * so full-screen modals keep their real size and position on every device.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Render modals on document.body so they sit above dashboard section cards. */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

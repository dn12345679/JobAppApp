import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal/overlay content at the <body> level (outside #root) so a
 * `fixed inset-0` backdrop covers the WHOLE viewport — header included — and
 * isn't clipped by <main>'s `overflow-hidden` or offset by the framer-motion
 * transform on the animated page container. Every full-screen modal should be
 * wrapped in this and use `fixed inset-0 z-50` for its overlay.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

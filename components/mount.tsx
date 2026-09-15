import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';

export function mountApp(
  element: HTMLElement,
  content: ReactNode,
  hot?: { dispose: (callback: () => void) => void },
) {
  const root = createRoot(element);
  root.render(content);
  // Entrypoint modules may re-run during HMR. Dispose effects (including page
  // observers) before a new root is attached to the same DOM container.
  hot?.dispose(() => root.unmount());
  return root;
}

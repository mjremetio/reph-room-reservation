import type { CSSProperties, ReactNode } from 'react';

/** Cards rise 8 px and fade in over 220 ms, staggered 60 ms (docs/spec/06-ui.md, Motion). CSS, so reduced motion applies. */
export function Appear({ index = 0, children }: { index?: number; children: ReactNode }) {
  return (
    <div className="appear" style={{ '--delay': `${index * 60}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

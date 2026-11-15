import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Shows a printed document on screen at its real layout (`width` px wide), scaled down to fit
// a narrower container, the way a PDF viewer shows a page on a phone. Nothing reflows, so the
// screen matches the paper. At full width it renders 1:1.
const ScaledPaper = ({ width, children }: { width: number; children: ReactNode }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / width);
      setBox((b) => (b.scale === scale && b.height === i.offsetHeight ? b : { scale, height: i.offsetHeight }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} style={{ width: "100%", height: box.height ? box.height * box.scale : undefined, overflow: "hidden" }}>
      <div ref={inner} style={{ width, transform: `scale(${box.scale})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </div>
  );
};

export default ScaledPaper;

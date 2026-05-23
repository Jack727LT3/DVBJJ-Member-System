"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

export type SignaturePadHandle = {
  getDataUrl: () => string | null;
};

type SignaturePadProps = {
  label: string;
  disabled?: boolean;
  className?: string;
  /** Shown when disabled (e.g. DOB not entered yet) */
  disabledHint?: string;
  /** Called when empty state changes */
  onEmptyChange?: (empty: boolean) => void;
};

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
{
  label,
  disabled,
  className = "",
  disabledHint,
  onEmptyChange,
},
ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const notifyEmpty = useCallback(
    (empty: boolean) => {
      onEmptyChange?.(empty);
    },
    [onEmptyChange]
  );

  const layoutCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth;
    const h = 144;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#0c0c0e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  useLayoutEffect(() => {
    layoutCanvas();
  }, [layoutCanvas]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }
  };

  const markInk = () => {
    if (!hasInk) {
      setHasInk(true);
      notifyEmpty(false);
    }
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const pt = getPoint(e);
    last.current = pt;
    const canvas = canvasRef.current;
    if (!canvas || !pt) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#0c0c0e";
    ctx.fill();
    markInk();
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const pt = getPoint(e);
    const canvas = canvasRef.current;
    const prev = last.current;
    if (!canvas || !pt || !prev) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    last.current = pt;
    markInk();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    layoutCanvas();
    setHasInk(false);
    notifyEmpty(true);
  };

  useImperativeHandle(ref, () => ({
    getDataUrl: () => {
      if (!hasInk) return null;
      const canvas = canvasRef.current;
      if (!canvas) return null;
      try {
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    },
  }));

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-brand-ink">{label}</label>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="text-sm font-medium text-brand-muted underline decoration-brand-muted/50 underline-offset-2 hover:text-brand-ink disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div
        className={`relative mt-2 overflow-hidden rounded-lg border-2 border-dashed bg-white select-none ${
          disabled ? "border-black/10 bg-neutral-50" : "border-black/20"
        }`}
      >
        <canvas
          ref={canvasRef}
          className={`block h-36 w-full touch-none ${
            disabled ? "pointer-events-none cursor-not-allowed opacity-50" : "cursor-crosshair"
          }`}
          style={{ touchAction: "none" }}
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          aria-label={label}
          aria-disabled={disabled}
        />
        {disabled && disabledHint ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-brand-muted">
            {disabledHint}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-brand-muted">
        {disabled
          ? disabledHint ?? "Complete the fields above to enable signing."
          : "Click and drag with your mouse, trackpad, finger, or stylus."}
      </p>
    </div>
  );
});

export default SignaturePad;

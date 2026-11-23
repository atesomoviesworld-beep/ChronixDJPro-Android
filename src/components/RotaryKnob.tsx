import React, {useRef} from 'react';

interface RotaryKnobProps {
  label: string;
  value: number; // 0..1
  accentColor: string;
  onChange: (val: number) => void;
  onReset?: () => void;
  size?: number;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  accentColor,
  onChange,
  onReset,
  size = 42,
}) => {
  const dragState = useRef<{startY: number; startVal: number} | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {startY: e.clientY, startVal: value};
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dy = dragState.current.startY - e.clientY;
    const next = Math.max(0, Math.min(1, dragState.current.startVal + dy / 120));
    onChange(next);
  };

  const handlePointerUp = () => {
    dragState.current = null;
  };

  // Map 0..1 to -135deg..+135deg
  const angleDeg = -135 + value * 270;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * 0.75;
  const filledLen = arcLen * value;

  return (
    <div className="flex flex-col items-center select-none">
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => (onReset ? onReset() : onChange(0.5))}
        style={{width: size, height: size}}
        className="relative cursor-ns-resize touch-none flex items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
        title={`${label} (drag vertically, double-click to reset)`}
      >
        <svg width={size} height={size} className="overflow-visible">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1C222D"
            strokeWidth={3.5}
            strokeDasharray={`${arcLen} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(135 ${cx} ${cy})`}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={accentColor}
            strokeWidth={3.5}
            strokeDasharray={`${filledLen} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(135 ${cx} ${cy})`}
          />
        </svg>
        <div
          className="absolute rounded-full bg-gradient-to-b from-[#3E4654] via-[#1C2029] to-[#11141A] border border-white/20 shadow-[0_3px_8px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.25)] flex items-center justify-center"
          style={{width: size - 11, height: size - 11}}
        >
          <div
            className="w-full h-full relative"
            style={{transform: `rotate(${angleDeg}deg)`}}
          >
            <span
              className="absolute top-1 left-1/2 -translate-x-1/2 w-[3px] h-2.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
            />
          </div>
        </div>
      </div>
      <span className="mt-0.5 text-[10px] font-bold tracking-wider text-slate-200 leading-none">
        {label}
      </span>
    </div>
  );
};

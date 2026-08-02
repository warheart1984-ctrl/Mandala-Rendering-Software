export type RotationControlsProps = {
  xw: number;
  yw: number;
  zw: number;
  distance4d: number;
  onChange: (next: {
    xw: number;
    yw: number;
    zw: number;
    distance4d: number;
  }) => void;
};

export function RotationControls({
  xw,
  yw,
  zw,
  distance4d,
  onChange,
}: RotationControlsProps) {
  return (
    <div className="controls">
      <label>
        <span>XW</span>
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          value={xw}
          onChange={(e) =>
            onChange({
              xw: Number(e.target.value),
              yw,
              zw,
              distance4d,
            })
          }
        />
        <em>{xw.toFixed(2)}</em>
      </label>
      <label>
        <span>YW</span>
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          value={yw}
          onChange={(e) =>
            onChange({
              xw,
              yw: Number(e.target.value),
              zw,
              distance4d,
            })
          }
        />
        <em>{yw.toFixed(2)}</em>
      </label>
      <label>
        <span>ZW</span>
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          value={zw}
          onChange={(e) =>
            onChange({
              xw,
              yw,
              zw: Number(e.target.value),
              distance4d,
            })
          }
        />
        <em>{zw.toFixed(2)}</em>
      </label>
      <label>
        <span>Proj d₄</span>
        <input
          type="range"
          min={1.2}
          max={10}
          step={0.05}
          value={distance4d}
          onChange={(e) =>
            onChange({
              xw,
              yw,
              zw,
              distance4d: Number(e.target.value),
            })
          }
        />
        <em>{distance4d.toFixed(2)}</em>
      </label>
    </div>
  );
}

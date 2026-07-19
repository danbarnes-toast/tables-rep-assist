type ToastFlameProps = {
  size?: number;
  accent?: string;
};

export function ToastFlame({ size = 24, accent }: ToastFlameProps) {
  const fill = accent ?? 'var(--color-accent, var(--accent, #FF4C00))';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* bread body */}
      <path
        d="M18 50 Q18 42 26 42 L74 42 Q82 42 82 50 L82 80 Q82 86 76 86 L24 86 Q18 86 18 80 Z"
        fill={fill}
        opacity="0.22"
      />
      {/* arch top */}
      <path
        d="M30 42 Q30 22 50 22 Q70 22 70 42"
        stroke={fill}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />
      {/* crust line */}
      <path
        d="M21 44 L79 44"
        stroke={fill}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* flame */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M50 30C50 30 62 44 62 55C62 62 58 68 52 71C53.5 67 52 62 48 60C48 60 51 54.5 46.5 47C46.5 47 45 56 39 61C35 57 35 52 35 52C35 52 30 58 33 66C28 63 26 57 26 52C26 38 38 32 50 30Z"
        fill={fill}
      />
      {/* grill marks */}
      <line x1="31" y1="62" x2="69" y2="62" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
      <line x1="31" y1="73" x2="69" y2="73" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.10" />
    </svg>
  );
}

export default ToastFlame;

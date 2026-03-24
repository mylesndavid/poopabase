import { SVGProps } from "react";

export function OuterbaseIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="50"
        y="75"
        fontSize="80"
        textAnchor="middle"
        dominantBaseline="auto"
      >
        💩
      </text>
    </svg>
  );
}

export function OuterbaseLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 300 40"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <text
        x="5"
        y="28"
        fontSize="24"
        textAnchor="start"
        dominantBaseline="auto"
      >
        💩
      </text>
      <text
        x="35"
        y="28"
        fontSize="22"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="600"
        fill="currentColor"
      >
        poopabase
      </text>
    </svg>
  );
}

export default OuterbaseLogo;

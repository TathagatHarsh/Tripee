"use client";
import { useId } from "react";

/** Decorative SVG only: no canvas, image request, or animation dependency. */
export function CakeCelebration() {
  const id = useId();
  return (
    <svg className="celebration-cake" viewBox="0 0 360 270" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sponge`} x1="105" y1="130" x2="240" y2="225" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DEA58C" /><stop offset=".5" stopColor="#B97059" /><stop offset="1" stopColor="#8B4D3D" />
        </linearGradient>
        <linearGradient id={`${id}-icing`} x1="110" y1="105" x2="250" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF9E9" /><stop offset=".65" stopColor="#F7DEC5" /><stop offset="1" stopColor="#E9BFA3" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}><stop stopColor="#EBCF91" stopOpacity=".4" /><stop offset="1" stopColor="#EBCF91" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-flame`} x1="180" y1="49" x2="180" y2="77" gradientUnits="userSpaceOnUse"><stop stopColor="#E8A448" /><stop offset="1" stopColor="#FFE8A6" /></linearGradient>
      </defs>
      <ellipse cx="180" cy="153" rx="157" ry="112" fill={`url(#${id}-glow)`} />
      <ellipse className="cake-plinth" cx="180" cy="231" rx="106" ry="13" fill="#644531" opacity=".1" />
      <g className="cake-settle">
        <g className="cake-base">
          <ellipse cx="180" cy="221" rx="108" ry="19" fill="#D4B271" />
          <ellipse cx="180" cy="217" rx="108" ry="17" fill="#F6E4BA" />
          <path d="M94 135H266V203C266 222 94 222 94 203Z" fill={`url(#${id}-sponge)`} />
          <path d="M95 169C132 188 228 188 265 169V183C228 201 132 201 95 183Z" fill="#F7DFC5" />
          <path d="M101 204C140 219 220 219 259 204" stroke="#E7BCA0" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="cake-frosting">
          <path d="M94 134C94 105 266 105 266 134V156C266 169 250 170 250 157V153C250 146 239 145 239 153V170C239 184 224 184 224 169V159C224 149 211 149 211 158V163C211 179 194 179 194 162V157C194 149 182 149 182 157V181C182 194 165 194 165 180V156C165 147 151 147 151 156V162C151 174 136 174 136 162V153C136 145 123 145 123 154V164C123 178 107 177 107 164V153C107 145 94 149 94 142Z" fill={`url(#${id}-icing)`} />
          <ellipse cx="180" cy="130" rx="86" ry="23" fill="#FFF5E3" />
          <ellipse cx="180" cy="129" rx="70" ry="16" stroke="#EACDB1" strokeOpacity=".55" />
        </g>
        <g className="cake-decoration">
          <path d="M122 124C110 108 117 103 130 119C123 100 141 103 138 120" fill="#758269" />
          <circle cx="128" cy="122" r="10" fill="#934A47" /><circle cx="128" cy="119" r="4" fill="#B66A61" />
          <circle cx="229" cy="134" r="9" fill="#A65B53" /><circle cx="229" cy="131" r="3" fill="#C98374" />
          <path d="M225 122C227 107 242 111 234 124" fill="#758269" />
          <path d="m146 137 5 2m57-18 4-3m-10 27 5-1m-42-25 3-3" stroke="#CB9C53" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className="cake-candle">
          <rect x="176" y="79" width="9" height="48" rx="3" fill="#D98A72" />
          <path d="m176 88 9-5m-9 18 9-5m-9 18 9-5m-9 18 9-5" stroke="#FCEACF" strokeWidth="3" />
          <path d="M180.5 80V74" stroke="#685344" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="cake-flame">
          <ellipse cx="180" cy="65" rx="23" ry="26" fill={`url(#${id}-glow)`} />
          <path d="M180 49C184 57 189 61 187 68C185 78 173 78 173 68C173 60 178 58 180 49Z" fill={`url(#${id}-flame)`} />
          <path d="M180 62C185 69 183 74 180 74C176 74 177 69 180 62Z" fill="#FFF5D8" />
        </g>
      </g>
      <g className="cake-sparkles" stroke="#C39850" strokeWidth="1.6" strokeLinecap="round">
        <path className="cake-spark cake-spark-early" d="M76 102v12m-6-6h12" />
        <path className="cake-spark cake-spark-early" d="M262 72v10m-5-5h10" />
        <path className="cake-spark" d="M66 158v12m-6-6h12" />
        <path className="cake-spark" d="M286 125v14m-7-7h14" />
        <path className="cake-spark" d="M114 67v8m-4-4h8" />
        <circle className="cake-spark" cx="263" cy="194" r="2" fill="#DCAA85" stroke="none" />
        <circle className="cake-spark" cx="93" cy="192" r="2" fill="#DCAA85" stroke="none" />
      </g>
    </svg>
  );
}

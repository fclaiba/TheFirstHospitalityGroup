// The lion and the THE FIRST wordmark (ADR 0025, docs/brand/logos). One solid mass filled with currentColor, so the
// colour comes from a token class (martini, ink or white only, BRAND.md); the three mane curves, the eye and the
// whisker marks are cut out with a mask, so they read as true negative space on any background. Below 32 px the
// simplified mark (one mane curve, the eye) is used, as in mark-min.svg. Generated from mark-martini.svg.
import { useId } from "react";
import type { SVGProps } from "react";

const HEAD =
  "M336 100 C330 74 314 54 292 44 C276 38 264 40 254 46 C220 34 172 34 132 50 C152 62 162 74 164 88 C124 80 84 94 56 124 C90 128 104 140 110 152 C72 162 44 194 34 236 C66 230 86 238 94 250 C60 274 48 310 52 350 C78 334 100 334 114 340 C98 372 100 410 118 442 C134 418 154 410 172 408 C178 440 198 468 228 486 C236 458 254 444 274 438 C290 462 316 478 348 484 C340 452 346 424 360 404 C374 384 392 368 410 358 C424 350 432 340 434 326 C438 312 446 302 452 292 C460 280 464 266 464 254 C474 250 482 240 480 226 C478 214 468 206 456 200 L376 136 C362 124 348 112 336 100 Z";
const MANE = "M306 92 C270 136 256 190 264 244 C272 296 304 336 356 364 M246 108 C214 150 202 198 208 248 C214 296 240 334 284 364 M188 140 C162 178 152 222 158 268 C162 306 182 338 214 364";
const EYE = "M366 168 C380 154 402 152 420 160 C408 174 384 180 366 168 Z";

/** The lion head in profile. `min` draws the simplified version for small sizes (favicon, under 32 px). */
export function LionMark({ title, min = false, ...props }: SVGProps<SVGSVGElement> & { title?: string; min?: boolean }) {
  const mask = `lion-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="white" />
          <g fill="none" stroke="black" strokeLinecap="round">
            {min ? (
              <path d="M306 92 C270 136 256 190 264 244 C272 296 304 336 356 364" strokeWidth="15" />
            ) : (
              <>
                <path d={MANE} strokeWidth="9" />
                <path d="M360 142 C378 134 400 134 420 142" strokeWidth="7" />
                <path d="M290 58 C306 66 318 82 322 100" strokeWidth="7" />
                <path d="M456 300 C438 308 418 310 400 306" strokeWidth="7" />
                <path d="M470 240 C464 248 458 252 450 254" strokeWidth="5" />
              </>
            )}
          </g>
          <path d={EYE} fill="black" />
          {min ? null : (
            <g fill="black">
              <circle cx="432" cy="272" r="4.5" />
              <circle cx="416" cy="280" r="4.5" />
              <circle cx="434" cy="288" r="4" />
            </g>
          )}
        </mask>
      </defs>
      <path d={HEAD} mask={`url(#${mask})`} />
    </svg>
  );
}

export function Wordmark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 239 52" fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M12.66 38.0V15.42H4.49V11.40H25.24V15.42H17.07V38.0ZM34.97 38.0V11.40H39.37V22.34H52.75V11.40H57.16V38.0H52.75V26.37H39.37V38.0ZM69.55 38.0V11.40H85.92V15.42H73.95V22.49H84.52V26.44H73.95V33.97H86.04V38.0ZM113.28 38.0V11.40H129.81V15.42H117.69V22.87H128.07V26.90H117.69V38.0ZM140.26 38.0V11.40H144.67V38.0ZM157.06 38.0V11.40H166.45Q169.18 11.40 171.27 12.46Q173.36 13.52 174.54 15.40Q175.72 17.29 175.72 19.76Q175.72 22.38 174.27 24.37Q172.83 26.37 170.47 27.32L176.78 38.0H171.80L166.10 28.15Q165.88 28.19 165.63 28.19Q165.38 28.19 165.12 28.19H161.47V38.0ZM161.47 24.13H166.64Q167.93 24.13 168.93 23.56Q169.94 22.99 170.57 22.00Q171.2 21.01 171.2 19.76Q171.2 17.86 169.83 16.64Q168.46 15.42 166.29 15.42H161.47ZM196.09 38.45Q194.0 38.45 192.27 37.96Q190.54 37.46 189.23 36.59Q187.92 35.72 187.06 34.63Q186.21 33.55 185.86 32.37L190.2 31.04Q190.69 32.45 192.13 33.51Q193.58 34.58 195.71 34.61Q198.18 34.61 199.62 33.59Q201.06 32.56 201.06 30.89Q201.06 29.37 199.85 28.40Q198.63 27.43 196.58 26.90L193.31 26.06Q191.45 25.57 189.95 24.62Q188.45 23.67 187.59 22.23Q186.74 20.78 186.74 18.81Q186.74 15.08 189.17 13.01Q191.60 10.94 196.12 10.94Q198.67 10.94 200.59 11.72Q202.51 12.50 203.76 13.85Q205.01 15.2 205.62 16.91L201.37 18.27Q200.80 16.75 199.39 15.77Q197.99 14.78 195.9 14.78Q193.73 14.78 192.49 15.80Q191.26 16.83 191.26 18.65Q191.26 20.14 192.23 20.95Q193.20 21.77 194.87 22.19L198.14 22.99Q201.71 23.86 203.69 25.99Q205.66 28.12 205.66 30.70Q205.66 32.98 204.56 34.73Q203.46 36.48 201.31 37.46Q199.16 38.45 196.09 38.45ZM222.11 38.0V15.42H213.95V11.40H234.69V15.42H226.52V38.0Z" />
    </svg>
  );
}

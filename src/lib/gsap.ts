import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

// ── Plugins (todos gratis desde GSAP 3.13) ──────────────────────────────
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { TextPlugin } from "gsap/TextPlugin";
import { CustomEase } from "gsap/CustomEase";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Observer } from "gsap/Observer";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(
  useGSAP,
  // Scroll & reveal
  ScrollTrigger,
  ScrollToPlugin,
  ScrollSmoother,
  // Texto animado
  SplitText,
  ScrambleTextPlugin,
  TextPlugin,
  CustomEase,
  // Morph SVG
  MorphSVGPlugin,
  // Drag & física
  Draggable,
  InertiaPlugin,
  // Util
  Observer,
  Flip,
);

export { gsap, useGSAP };
export {
  ScrollTrigger,
  ScrollToPlugin,
  ScrollSmoother,
  SplitText,
  ScrambleTextPlugin,
  TextPlugin,
  CustomEase,
  MorphSVGPlugin,
  Draggable,
  InertiaPlugin,
  Observer,
  Flip,
};

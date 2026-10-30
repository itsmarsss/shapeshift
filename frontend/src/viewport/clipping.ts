import * as THREE from "three";
import { useView } from "./view";

// The section cut, shared by every model material. The viewport moves it in
// place, so materials don't need rebuilding while it's dragged.
export const SECTION_PLANE = new THREE.Plane();
const PLANES = [SECTION_PLANE];

export function useClipping() {
    const on = useView((s) => s.section.on);
    return on ? { clippingPlanes: PLANES, side: THREE.DoubleSide } : { clippingPlanes: null, side: THREE.FrontSide };
}

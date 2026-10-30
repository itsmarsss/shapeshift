// How far a hand is from the camera, in meters.
//
// MediaPipe gives two sets of landmarks: where each joint is in the image, and
// where it is in real space (meters, centered on the hand). A palm bone that
// is L meters long across the camera's view and shows up l pixels long sits
// at f * L / l from the camera (a pinhole camera with focal length f). Using
// only the across-the-view part of each bone's real length makes the estimate
// hold up when the hand tilts, and averaging several rigid palm bones, longest
// first, keeps it steady.

// Rigid palm bones: wrist to knuckles and across the knuckles.
const BONES: [number, number][] = [
    [0, 5],
    [0, 9],
    [0, 13],
    [0, 17],
    [5, 9],
    [9, 13],
    [13, 17],
    [5, 17],
];

// Typical webcam horizontal field of view. Absolute distance depends on it,
// but changes in distance (what dragging uses) barely do.
export const WEBCAM_FOV = (63 * Math.PI) / 180;

// Wrist to middle knuckle on an average adult hand, for when there are no
// world landmarks.
const PALM_LENGTH = 0.085;

const at = (l: number[], i: number) => [l[i * 3], l[i * 3 + 1], l[i * 3 + 2]];

/**
 * @param image  21 image landmarks, x and y normalized to 0..1 of the frame
 * @param world  21 world landmarks in meters, if available
 * @param aspect frame width / height
 */
export function handDistance(image: number[], world: number[] | undefined, aspect: number, fov = WEBCAM_FOV): number | null {
    // Image lengths in units of the frame width, so the focal length is a
    // single constant.
    const focal = 1 / (2 * Math.tan(fov / 2));
    const imageLength = (a: number, b: number) => {
        const [ax, ay] = at(image, a);
        const [bx, by] = at(image, b);
        return Math.hypot(bx - ax, (by - ay) / aspect);
    };

    if (!world || world.length < 63) {
        const l = imageLength(0, 9);
        return l > 1e-4 ? (focal * PALM_LENGTH) / l : null;
    }

    // First guess: every joint at the same distance.
    let sum = 0;
    let weight = 0;
    for (const [a, b] of BONES) {
        const l = imageLength(a, b);
        if (l < 1e-4) continue;
        const [ax, ay] = at(world, a);
        const [bx, by] = at(world, b);
        const across = Math.hypot(bx - ax, by - ay);
        if (across < 0.01) continue; // Pointing at the camera: too foreshortened to trust.
        sum += focal * across;
        weight += l;
    }
    if (weight <= 0) return null;
    let distance = sum / weight;

    // Then refine with each joint's own depth from the world landmarks, which
    // corrects the perspective of a tilted hand.
    for (let pass = 0; pass < 4; pass++) {
        let predicted = 0;
        let observed = 0;
        for (const [a, b] of BONES) {
            const [ax, ay, az] = at(world, a);
            const [bx, by, bz] = at(world, b);
            const za = distance + az;
            const zb = distance + bz;
            if (za <= 0.02 || zb <= 0.02) return distance;
            predicted += focal * Math.hypot(bx / zb - ax / za, by / zb - ay / za);
            observed += imageLength(a, b);
        }
        if (observed <= 0 || predicted <= 0) break;
        distance *= predicted / observed;
    }
    return distance;
}

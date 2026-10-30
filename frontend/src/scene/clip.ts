import * as THREE from "three";
import { evaluateTrack } from "./animation";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";

const FPS = 30;

// The scene's animation as a three.js clip, for glTF export. Tracks are
// sampled at 30 fps so eased and stepped keyframes look the same everywhere.
// glTF animates node transforms, so colors and light intensity stay behind.
export function animationClip(doc: SceneDoc): THREE.AnimationClip | null {
    const names = new Map([...doc.objects, ...doc.lights].map((e) => [e.id, e.name]));
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of doc.animation.tracks) {
        const name = names.get(track.target);
        if (!name || !track.keys.length) continue;
        if (track.property !== "position" && track.property !== "rotation" && track.property !== "scale") continue;
        const start = track.keys[0].time;
        const end = track.keys[track.keys.length - 1].time;
        const frames = Math.max(1, Math.round((end - start) * FPS));
        const times: number[] = [];
        const values: number[] = [];
        for (let i = 0; i <= frames; i++) {
            const t = start + ((end - start) * i) / frames;
            const v = evaluateTrack(track, t) as [number, number, number];
            times.push(t);
            if (track.property === "rotation") values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(...v)).toArray());
            else values.push(...v);
        }
        if (track.property === "rotation") tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
        else tracks.push(new THREE.VectorKeyframeTrack(`${name}.${track.property}`, times, values));
    }
    return tracks.length ? new THREE.AnimationClip("Animation", doc.animation.duration, tracks) : null;
}

import { loadCsg } from "../scene/csg";

// The app loads the shape-cutting library on demand; tests use it straight away.
await loadCsg();

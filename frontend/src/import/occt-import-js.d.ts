declare module "occt-import-js" {
    import type { Occt } from "./occt";
    const factory: (options?: { locateFile?: (path: string) => string }) => Promise<Occt>;
    export default factory;
}

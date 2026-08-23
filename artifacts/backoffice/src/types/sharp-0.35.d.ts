// sharp 0.35.0 ships declarations but does not expose them through its package
// exports. Keep this narrow bridge limited to the server-side PDF image chain
// used by Fieldgrid until upstream exports the declarations again.
declare module "sharp" {
  type SharpInputOptions = {
    failOn?: "none" | "truncated" | "error" | "warning";
    limitInputPixels?: number | boolean;
  };

  type ResizeOptions = {
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
    withoutEnlargement?: boolean;
  };

  type FlattenOptions = { background?: string };
  type JpegOptions = { quality?: number; progressive?: boolean };

  interface SharpPipeline {
    rotate(): SharpPipeline;
    resize(options: ResizeOptions): SharpPipeline;
    flatten(options?: FlattenOptions): SharpPipeline;
    jpeg(options?: JpegOptions): SharpPipeline;
    toBuffer(): Promise<Buffer>;
  }

  export default function sharp(
    input: Buffer,
    options?: SharpInputOptions,
  ): SharpPipeline;
}

/**
 * Cuts the reference "motion clip" in the browser with ffmpeg.wasm (lazy, ~30MB
 * on first use) and re-encodes it to a small H.264 MP4 the video model can
 * fetch: ≤720px wide, 30fps, AAC audio kept for pacing.
 */
let ffmpegPromise: Promise<any> | null = null;

function getFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })().catch((e) => {
    ffmpegPromise = null;
    throw e;
  });
  return ffmpegPromise;
}

export async function cutClip(
  source: Blob,
  startSeconds: number,
  lengthSeconds: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFfmpeg();
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on("progress", handler);
  const input = `in-${Date.now()}.mp4`;
  const output = `out-${Date.now()}.mp4`;
  try {
    await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
    await ff.exec([
      "-ss", startSeconds.toFixed(2),
      "-i", input,
      "-t", lengthSeconds.toFixed(2),
      "-vf", "scale='min(720,iw)':-2,fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      output,
    ]);
    const data = (await ff.readFile(output)) as Uint8Array;
    if (!data?.length) throw new Error("The clip came out empty — try different start/end points");
    return new Blob([data as BlobPart], { type: "video/mp4" });
  } finally {
    try { ff.off?.("progress", handler); } catch { /* older builds */ }
    try { await ff.deleteFile(input); } catch { /* ignore */ }
    try { await ff.deleteFile(output); } catch { /* ignore */ }
  }
}

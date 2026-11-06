/**
 * Lazy-loaded ffmpeg.wasm GIF maker.
 * Turns a generated static ad into a short animated GIF (subtle zoom loop)
 * suitable for placements that accept GIFs.
 *
 * Loaded on demand only — the wasm core is ~30MB, shared with the
 * MP4 transcoder via the same CDN base.
 */
let ffmpegPromise: Promise<any> | null = null;

function getFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/[email protected]/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })().catch((e) => { ffmpegPromise = null; throw e; });
  return ffmpegPromise;
}

/**
 * Convert a still image into an animated GIF with a slow push-in zoom.
 * Returns a `image/gif` blob (~3s loop, 480px wide).
 */
export async function imageToAnimatedGif(
  image: Blob,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFfmpeg();
  if (onProgress) {
    ff.on("progress", ({ progress }: { progress: number }) => {
      onProgress(Math.max(0, Math.min(1, progress)));
    });
  }
  const inputName = "in.png";
  const outputName = "out.gif";
  const buf = new Uint8Array(await image.arrayBuffer());
  await ff.writeFile(inputName, buf);
  await ff.exec([
    "-loop", "1",
    "-t", "3",
    "-i", inputName,
    "-vf",
    // Slow push-in zoom, then palette-quantize for a compact GIF.
    "zoompan=z='min(1+0.0012*on,1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'," +
      "scale=480:-2:flags=lanczos," +
      "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4",
    "-r", "20",
    outputName,
  ]);
  const data = (await ff.readFile(outputName)) as Uint8Array;
  try { await ff.deleteFile(inputName); } catch {}
  try { await ff.deleteFile(outputName); } catch {}
  return new Blob([data as BlobPart], { type: "image/gif" });
}

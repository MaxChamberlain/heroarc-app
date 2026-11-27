/** Photos are shrunk in the browser before they're sent: faster uploads, less to store. */

function canvasFor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function draw(file: Blob, max: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = canvasFor(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** A JPEG no larger than `max` px on its longest side. */
export async function downscale(file: Blob, max = 1600): Promise<Blob> {
  const c = await draw(file, max);
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not read that image'))),
      'image/jpeg',
      0.85,
    ),
  );
}

/** A small preview as a data URL (kept with the conversation for the session). */
export async function thumbnail(file: Blob, size = 240): Promise<string> {
  return (await draw(file, size)).toDataURL('image/jpeg', 0.8);
}

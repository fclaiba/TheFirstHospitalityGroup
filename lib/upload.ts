"use client";

// Photo upload (ADR 0005): compress in the browser to ≤ 400 KB JPEG, longest side 1600 px, then upload to Convex
// storage and register the file to its owner. In preview the photo stays in this browser (lib/demo/store.ts).
import { PREVIEW } from "./backend/config";
import { commit, storeBlob } from "./demo/store";

export const MAX_SIDE = 1600;
export const TARGET_BYTES = 400 * 1024;
export const MAX_INPUT_BYTES = 5 * 1024 * 1024 * 4; // phones shoot large HEIC/JPEG; compression brings it down

export type UploadPurpose = "task" | "menu" | "inventory" | "incident" | "warning" | "message" | "count";

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      // Fall through to <img> (some HEIC decoders only work there).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downscales and re-encodes until the JPEG is under TARGET_BYTES (quality 0.82 → 0.5). */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw Object.assign(new Error("FILE_TYPE"), { code: "FILE_TYPE" });
  if (file.size > MAX_INPUT_BYTES) throw Object.assign(new Error("FILE_TOO_LARGE"), { code: "FILE_TOO_LARGE" });
  const img = await loadBitmap(file);
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  for (;;) {
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
    if (blob.size <= TARGET_BYTES || quality <= 0.5) return blob;
    quality -= 0.08;
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** Returns the storage id to pass to the mutation that attaches the photo. */
export async function uploadPhoto(file: File, purpose: UploadPurpose, deps: { generateUploadUrl: () => Promise<string>; register: (a: { storageId: string; purpose: string }) => Promise<unknown> }): Promise<string> {
  const blob = await compressImage(file);
  if (PREVIEW) {
    const id = storeBlob(await toDataUrl(blob), "image/jpeg", blob.size);
    await commit("files:register", { storageId: id, purpose });
    return id;
  }
  const url = await deps.generateUploadUrl();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!res.ok) throw Object.assign(new Error("upload failed"), { code: "UNKNOWN" });
  const { storageId } = (await res.json()) as { storageId: string };
  await deps.register({ storageId, purpose });
  return storageId;
}

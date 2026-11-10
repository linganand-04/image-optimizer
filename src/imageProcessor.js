import heic2any from "heic2any";

export const SUPPORTED_INPUT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
];

export const OUTPUT_FORMATS = [
  { label: "WEBP (Recommended)", mime: "image/webp", ext: "webp" },
  { label: "PNG (Lossless / Transparency)", mime: "image/png", ext: "png" },
  { label: "JPEG (Photographic)", mime: "image/jpeg", ext: "jpg" },
  { label: "BMP", mime: "image/bmp", ext: "bmp" },
];

/**
 * Normalizes input files (including polyfilling HEIC/HEIF via heic2any).
 */
export async function normalizeImageSource(file) {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  if (isHeic) {
    const convertedBlob = await heic2any({
      blob: file,
      toType: "image/png",
      quality: 1,
    });
    return Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
  }
  return file;
}

/**
 * Calculates target bounding dimensions while preserving aspect ratio.
 */
export function calculateAspectRatioFit(
  srcWidth,
  srcHeight,
  maxWidth,
  maxHeight,
) {
  if (!maxWidth && !maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }
  const targetMaxW = maxWidth || srcWidth;
  const targetMaxH = maxHeight || srcHeight;

  const ratio = Math.min(targetMaxW / srcWidth, targetMaxH / srcHeight, 1);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/**
 * Loads a Blob or File into an HTMLImageElement safely.
 */
export function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image into memory: " + err.message));
    };
    img.src = url;
  });
}

/**
 * Performs client-side image conversion and resizing.
 * Handles alpha preservation and solid background fills for formats without alpha channels (e.g. JPEG).
 */
export async function convertAndOptimizeImage(file, options = {}) {
  const {
    outputMime = "image/webp",
    quality = 0.92,
    maxWidth = null,
    maxHeight = null,
    maintainAspectRatio = true,
    customWidth = null,
    customHeight = null,
  } = options;

  const normalizedBlob = await normalizeImageSource(file);
  const img = await loadImageElement(normalizedBlob);

  let finalWidth = img.naturalWidth;
  let finalHeight = img.naturalHeight;

  if (customWidth || customHeight) {
    if (maintainAspectRatio) {
      const fit = calculateAspectRatioFit(
        img.naturalWidth,
        img.naturalHeight,
        customWidth,
        customHeight,
      );
      finalWidth = fit.width;
      finalHeight = fit.height;
    } else {
      finalWidth = customWidth || img.naturalWidth;
      finalHeight = customHeight || img.naturalHeight;
    }
  } else if (maxWidth || maxHeight) {
    const fit = calculateAspectRatioFit(
      img.naturalWidth,
      img.naturalHeight,
      maxWidth,
      maxHeight,
    );
    finalWidth = fit.width;
    finalHeight = fit.height;
  }

  // Use OffscreenCanvas if supported by the browser, fallback to HTMLCanvasElement
  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  let canvas, ctx;

  if (useOffscreen) {
    canvas = new OffscreenCanvas(finalWidth, finalHeight);
    ctx = canvas.getContext("2d", { alpha: true });
  } else {
    canvas = document.createElement("canvas");
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    ctx = canvas.getContext("2d", { alpha: true });
  }

  if (!ctx) {
    throw new Error("Canvas 2D context could not be initialized.");
  }

  // Enable high-quality bicubic image scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill white canvas background if converting to JPEG (which does not support alpha)
  if (outputMime === "image/jpeg") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, finalWidth, finalHeight);
  } else {
    ctx.clearRect(0, 0, finalWidth, finalHeight);
  }

  ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

  let outputBlob;
  if (useOffscreen) {
    outputBlob = await canvas.convertToBlob({
      type: outputMime,
      quality: outputMime === "image/png" ? undefined : quality,
    });
  } else {
    outputBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas toBlob conversion failed."));
        },
        outputMime,
        outputMime === "image/png" ? undefined : quality,
      );
    });
  }

  // Clean up canvas dimensions to free GPU memory
  canvas.width = 0;
  canvas.height = 0;

  return {
    blob: outputBlob,
    width: finalWidth,
    height: finalHeight,
  };
}

export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

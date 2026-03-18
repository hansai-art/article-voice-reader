export interface OcrProgress {
  status: string;
  progress: number;
}

/**
 * Extract text from an image file using Tesseract.js OCR.
 * Tesseract is loaded dynamically to avoid bloating the initial bundle.
 */
export async function parseImageOCR(
  file: File,
  onProgress?: (p: OcrProgress) => void
): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'chi_tra+eng', {
    logger: (m: any) => {
      if (onProgress && m.status && typeof m.progress === 'number') {
        onProgress({ status: m.status, progress: m.progress });
      }
    },
  });

  return result.data.text.trim();
}

export function isImageFile(file: File): boolean {
  return /\.(png|jpe?g|bmp|webp|gif|tiff?)$/i.test(file.name) ||
    file.type.startsWith('image/');
}

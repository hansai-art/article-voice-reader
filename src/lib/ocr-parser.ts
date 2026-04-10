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
  let Tesseract;
  try {
    Tesseract = await import('tesseract.js');
  } catch (err) {
    throw new Error('OCR_LOAD_FAILED');
  }

  try {
    const result = await Tesseract.recognize(file, 'chi_tra+eng', {
      logger: (m: any) => {
        if (onProgress && m.status && typeof m.progress === 'number') {
          onProgress({ status: m.status, progress: m.progress });
        }
      },
    });

    const text = result.data.text.trim();
    if (!text) {
      throw new Error('OCR_NO_TEXT');
    }
    return text;
  } catch (err) {
    if (err instanceof Error && (err.message === 'OCR_NO_TEXT' || err.message === 'OCR_LOAD_FAILED')) {
      throw err;
    }
    throw new Error('OCR_RECOGNIZE_FAILED');
  }
}

export function isImageFile(file: File): boolean {
  return /\.(png|jpe?g|bmp|webp|gif|tiff?)$/i.test(file.name) ||
    file.type.startsWith('image/');
}

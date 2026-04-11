import { toast } from '@/hooks/use-toast';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { t } from './i18n';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function parseFile(file: File): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE) {
    toast({ title: t('fileTooLarge'), variant: 'destructive' });
    return null;
  }

  const ext = file.name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'txt':
    case 'md':
      return file.text();

    case 'pdf':
      return parsePDF(file);

    case 'docx':
      return parseDOCX(file);

    default:
      toast({ title: t('unsupportedFormat'), variant: 'destructive' });
      return null;
  }
}

async function parsePDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const texts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? (item as TextItem).str : ''))
      .join('');
    texts.push(pageText);
  }

  return texts.join('\n\n');
}

async function parseDOCX(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

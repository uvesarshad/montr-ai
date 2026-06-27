type SupportedKnowledgeFile = {
  name: string;
  type: string;
  size: number;
};

type KnowledgeBaseEntryType = 'document' | 'pdf';

interface KnowledgeBaseFileConfig {
  supported: boolean;
  entryType: KnowledgeBaseEntryType;
  canExtractTextInBrowser: boolean;
  extensionLabel: 'PDF' | 'Word' | 'Document';
}

const WORD_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const TEXT_EXTRACTABLE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
]);

export function getKnowledgeBaseFileConfig(file: SupportedKnowledgeFile): KnowledgeBaseFileConfig {
  const lowerName = file.name.toLowerCase();

  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return {
      supported: true,
      entryType: 'pdf',
      canExtractTextInBrowser: false,
      extensionLabel: 'PDF',
    };
  }

  if (
    WORD_MIME_TYPES.has(file.type) ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx')
  ) {
    return {
      supported: true,
      entryType: 'document',
      canExtractTextInBrowser: false,
      extensionLabel: 'Word',
    };
  }

  return {
    supported: true,
    entryType: 'document',
    canExtractTextInBrowser:
      TEXT_EXTRACTABLE_MIME_TYPES.has(file.type) ||
      /\.(txt|md|csv|json|html?)$/i.test(lowerName),
    extensionLabel: 'Document',
  };
}

export function buildKnowledgeBaseFileEntry({
  file,
  extractedText,
}: {
  file: SupportedKnowledgeFile;
  extractedText: string;
}) {
  const config = getKnowledgeBaseFileConfig(file);
  const cleanText = extractedText.trim();

  return {
    type: config.entryType,
    content:
      cleanText ||
      [
        `Uploaded file: ${file.name}`,
        '',
        `${config.extensionLabel} files can be stored here even when the browser cannot extract their text directly.`,
        'Please edit this entry and add a clean summary, transcript, or key excerpts for AI use.',
      ].join('\n'),
    metadata: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || guessMimeType(file.name),
    },
  };
}

function guessMimeType(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (lowerName.endsWith('.doc')) {
    return 'application/msword';
  }

  if (lowerName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return 'application/octet-stream';
}

export interface Chunk {
  heading: string;
  content: string;
  index: number;
}

/**
 * Splits markdown content into meaningful chunks by headings.
 * Each chunk contains a heading + its content, with optional overlap
 * to preserve context across chunk boundaries.
 */
export function chunkMarkdown(text: string, options?: {
  maxChunkSize?: number;
  overlapSentences?: number;
}): Chunk[] {
  const maxSize = options?.maxChunkSize || 1500;
  const overlap = options?.overlapSentences || 2;

  // Split by headings (# through ####)
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  const sections: Array<{ heading: string; content: string; level: number }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    // Capture content before this heading
    if (sections.length > 0) {
      sections[sections.length - 1].content = text.slice(lastIndex, match.index).trim();
    } else if (match.index > 0) {
      // Content before the first heading
      const preamble = text.slice(0, match.index).trim();
      if (preamble.length > 20) {
        sections.push({ heading: 'Introduction', content: preamble, level: 0 });
      }
    }

    sections.push({
      heading: match[2].trim(),
      content: '',
      level: match[1].length,
    });
    lastIndex = match.index + match[0].length;
  }

  // Capture content after last heading
  if (sections.length > 0) {
    sections[sections.length - 1].content = text.slice(lastIndex).trim();
  } else {
    // No headings found — treat entire text as paragraphs
    return chunkByParagraphs(text, maxSize, overlap);
  }

  // Merge small sections into parent or split large ones
  const chunks: Chunk[] = [];
  let idx = 0;

  for (const section of sections) {
    if (!section.content || section.content.length < 20) continue;

    if (section.content.length <= maxSize) {
      chunks.push({
        heading: section.heading,
        content: section.content,
        index: idx++,
      });
    } else {
      // Split large sections by paragraphs
      const subChunks = chunkByParagraphs(section.content, maxSize, overlap);
      for (const sub of subChunks) {
        chunks.push({
          heading: section.heading + (sub.heading ? ` — ${sub.heading}` : ''),
          content: sub.content,
          index: idx++,
        });
      }
    }
  }

  // Add overlap context from previous chunk's last sentences
  if (overlap > 0) {
    for (let i = 1; i < chunks.length; i++) {
      const prevSentences = extractLastSentences(chunks[i - 1].content, overlap);
      if (prevSentences) {
        chunks[i].content = `[...] ${prevSentences}\n\n${chunks[i].content}`;
      }
    }
  }

  return chunks;
}

function chunkByParagraphs(text: string, maxSize: number, overlap: number): Chunk[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
  const chunks: Chunk[] = [];
  let current = '';
  let idx = 0;

  for (const para of paragraphs) {
    if (current.length + para.length > maxSize && current.length > 0) {
      chunks.push({ heading: '', content: current.trim(), index: idx++ });
      // Keep overlap
      const overlapText = extractLastSentences(current, overlap);
      current = overlapText ? `[...] ${overlapText}\n\n${para}` : para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  if (current.trim().length > 20) {
    chunks.push({ heading: '', content: current.trim(), index: idx });
  }

  return chunks;
}

function extractLastSentences(text: string, count: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) return '';
  return sentences.slice(-count).join('').trim();
}

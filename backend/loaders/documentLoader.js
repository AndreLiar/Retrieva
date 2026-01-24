import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { readFile } from 'fs/promises';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

/**
 * Enhancement 2: Extract section headers from text
 * @param {string} text - Text to analyze
 * @returns {string} - Detected section or null
 */
const detectSection = (text) => {
  // Look for common section patterns
  const sectionPatterns = [
    /^#+ (.+)/m, // Markdown headers
    /^([A-Z][A-Za-z\s]+):$/m, // "Section Name:"
    /^\d+\.?\s+([A-Z][A-Za-z\s]+)/m, // "1. Section Name"
    /^([A-Z\s]{3,})$/m, // ALL CAPS HEADERS
  ];

  for (const pattern of sectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
};

/**
 * Load and split PDF document using LangChain PDFLoader
 * Enhancement 2: Add rich metadata (page numbers, sections, chunk index)
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<Array>} Array of document chunks with metadata
 */
export const loadAndSplitPDF = async (filePath) => {
  console.log(`📄 Loading PDF: ${filePath}`);

  const loader = new PDFLoader(filePath);
  const docs = await loader.load();

  console.log(`📊 PDF Info:`);
  console.log(`   Pages: ${docs.length}`);
  console.log(
    `   Total text length: ${docs.reduce((sum, doc) => sum + doc.pageContent.length, 0)} characters`
  );

  // Enhancement 5: Better chunking strategy
  // Smaller chunks for precision, sentence-aware splitting
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600, // Reduced from 1000 for more precise retrieval
    chunkOverlap: 100, // Reduced overlap but maintain context
    separators: [
      '\n\n', // Paragraph boundaries (highest priority)
      '\n', // Line breaks
      '. ', // Sentence endings
      '! ', // Exclamation sentences
      '? ', // Question sentences
      '; ', // Semicolon breaks
      ', ', // Comma breaks
      ' ', // Word boundaries
      '', // Character level (fallback)
    ],
    // Keep sentences together when possible
    keepSeparator: true,
    lengthFunction: (text) => text.length,
  });

  console.log(`✂️  Splitting into chunks...`);
  const splits = await textSplitter.splitDocuments(docs);

  // Enhancement 2: Enrich metadata with page numbers, sections, and chunk index
  const enrichedSplits = splits.map((split, index) => {
    // Extract page number from original metadata
    const pageNumber =
      split.metadata?.loc?.pageNumber ||
      split.metadata?.page ||
      Math.floor(index / (splits.length / docs.length)) + 1;

    // Detect section from content
    const section = detectSection(split.pageContent);

    // Calculate position in document
    const position = (((index + 1) / splits.length) * 100).toFixed(1);

    return {
      ...split,
      metadata: {
        ...split.metadata,
        source: filePath,
        page: pageNumber,
        section: section || 'General',
        chunkIndex: index,
        totalChunks: splits.length,
        positionPercent: `${position}%`,
        chunkSize: split.pageContent.length,
      },
    };
  });

  console.log(`✅ Created ${enrichedSplits.length} chunks with metadata`);
  console.log(
    `   Average chunk size: ${Math.round(enrichedSplits.reduce((sum, doc) => sum + doc.pageContent.length, 0) / enrichedSplits.length)} characters`
  );
  console.log(`   Metadata fields: page, section, chunkIndex, positionPercent`);

  return enrichedSplits;
};

/**
 * Load and split text document
 * @param {string} filePath - Path to text file
 * @returns {Promise<Array>} Array of document chunks
 */
export const loadAndSplitText = async (filePath) => {
  console.log(`📄 Loading text file: ${filePath}`);

  const text = await readFile(filePath, 'utf-8');
  const docs = [{ pageContent: text, metadata: { source: filePath } }];

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splits = await textSplitter.splitDocuments(docs);
  console.log(`✅ Created ${splits.length} chunks from text file`);

  return splits;
};

/**
 * Auto-detect file type and load accordingly
 * @param {string} filePath - Path to file
 * @returns {Promise<Array>} Array of document chunks
 */
export const loadAndSplitDocs = async (filePath) => {
  if (filePath.endsWith('.pdf')) {
    return loadAndSplitPDF(filePath);
  } else {
    return loadAndSplitText(filePath);
  }
};

import { OllamaEmbeddings } from '@langchain/ollama';

// Enhancement 11: Better embedding model configuration
// Current: nomic-embed-text (fast, good quality)
// Upgrade option: mxbai-embed-large (better quality, slower)
//   To upgrade: ollama pull mxbai-embed-large
//   Then change model to 'mxbai-embed-large:latest'
// Production option: text-embedding-3-large via OpenAI (best quality)

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text:latest';

export const embeddings = new OllamaEmbeddings({
  model: EMBEDDING_MODEL,
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
});

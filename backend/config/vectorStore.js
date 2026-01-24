import { QdrantVectorStore } from '@langchain/qdrant';
import { embeddings } from './embeddings.js';
import dotenv from 'dotenv';

dotenv.config();

export const getVectorStore = async (docs) => {
  const vectorStore = await QdrantVectorStore.fromDocuments(docs, embeddings, {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collectionName: process.env.QDRANT_COLLECTION_NAME || 'langchain-rag',
  });
  return vectorStore;
};

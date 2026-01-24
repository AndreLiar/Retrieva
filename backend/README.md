# RAG Backend API

A secure, production-ready REST API for Retrieval-Augmented Generation (RAG) using LangChain, Ollama, and Qdrant.

## 🚀 Features

- **RAG System**: Question-answering with document retrieval
- **Chat History**: Contextual conversations with history-aware retrieval
- **Logging**: Winston + Morgan for comprehensive logging
- **Security**: Helmet, rate limiting, CORS, HPP
- **API Documentation**: Swagger/OpenAPI at `/api-docs`
- **Error Handling**: Centralized error management
- **Validation**: Request validation utilities

## 📁 Project Structure

```
backend/
├── app.js              # Express app configuration
├── index.js            # Server entry point
├── config/             # Configuration files
│   ├── llm.js         # Ollama LLM setup
│   ├── embeddings.js  # Embedding model config
│   ├── vectorStore.js # Qdrant vector store
│   └── logger.js      # Winston logger configuration
├── controllers/        # Request handlers
│   └── ragController.js
├── routes/            # API routes
│   └── ragRoutes.js
├── services/          # Business logic
│   └── rag.js         # RAG service implementation
├── loaders/           # Data loaders
│   └── documentLoader.js
├── prompts/           # LLM prompts
│   └── ragPrompt.js
├── utils/             # Utility functions
│   ├── errorHandler.js      # Error utilities
│   ├── validators.js        # Input validation
│   ├── responseFormatter.js # API responses
│   ├── stringHelpers.js     # String utilities
│   ├── dateHelpers.js       # Date utilities
│   ├── asyncHelpers.js      # Async utilities
│   └── index.js             # Central exports
└── logs/              # Application logs
    ├── combined.log   # All logs
    └── error.log      # Error logs only
```

## 🛠️ Technologies

- **Runtime**: Node.js v23+
- **Framework**: Express 5
- **LLM**: Ollama (Llama 3.2)
- **Vector DB**: Qdrant
- **LangChain**: @langchain/core, @langchain/ollama, @langchain/qdrant
- **Logging**: Winston + Morgan
- **Security**: Helmet, express-rate-limit, HPP

## 📦 Installation

```bash
# Install dependencies
npm install --legacy-peer-deps

# Set up environment variables
cp .env.example .env

# Edit .env with your configuration
```

## ⚙️ Environment Variables

Create a `.env` file:

```env
# Server
PORT=3007
NODE_ENV=development

# Ollama LLM
LLM_TEMPERATURE=0.7
LLM_TOP_P=1
LLM_TOP_K=50

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=langchain-rag

# Logging
LOG_LEVEL=info
```

## 🏃 Running the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server will start at `http://localhost:3007`

## 📡 API Endpoints

### Health Check
```http
GET /
```
Returns: `Hello from a secure app.js!`

### Ask Question (RAG)
```http
POST /api/v1/rag
Content-Type: application/json

{
  "question": "What is this document about?",
  "chat_history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Question answered successfully",
  "data": {
    "answer": "This document is about..."
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "message": "Question is required"
}
```

### API Documentation
```http
GET /api-docs
```
Interactive Swagger UI for API documentation

## 🔒 Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: 100 requests per hour per IP
- **HPP**: HTTP Parameter Pollution prevention
- **Input Validation**: Question and chat history validation
- **Compression**: Response compression

## 📊 Logging System

### Winston Logger
Application-level logging with multiple transports:
- **Console**: Development (colorized)
- **File**: Production (JSON format)
- **Rotation**: 5MB max, 5 files kept

### Morgan
HTTP request logging streamed to Winston

### Log Levels
- `error`: Critical issues
- `warn`: Warning conditions
- `info`: General information
- `debug`: Detailed debugging (set `LOG_LEVEL=debug`)

### Viewing Logs
```bash
# Tail all logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log

# Pretty print JSON
tail -f logs/combined.log | jq '.'
```

## 🛠️ Utils Library

### Error Handling
```javascript
import { catchAsync, AppError } from './utils/index.js';

export const handler = catchAsync(async (req, res) => {
  throw new AppError('Not found', 404);
});
```

### Validators
```javascript
import { validateQuestion, validateChatHistory } from './utils/index.js';

const result = validateQuestion(question);
if (!result.valid) {
  return sendError(res, 400, result.error);
}
```

### Response Formatters
```javascript
import { sendSuccess, sendError } from './utils/index.js';

sendSuccess(res, 200, 'Success', { data });
sendError(res, 404, 'Not found');
```

### Async Helpers
```javascript
import { sleep, retryWithBackoff } from './utils/index.js';

await sleep(1000);
const data = await retryWithBackoff(() => fetch(), 3, 1000);
```

### String Helpers
```javascript
import { truncate, slugify, extractKeywords } from './utils/index.js';

const short = truncate(text, 100);
const slug = slugify('Hello World');
const keywords = extractKeywords(text, 5);
```

### Date Helpers
```javascript
import { formatDate, getTimeAgo } from './utils/index.js';

const readable = formatDate(new Date());
const ago = getTimeAgo(createdAt);
```

## 🔧 Development

### Code Style
- ES6 modules (type: "module")
- Async/await
- JSDoc comments
- Error-first callbacks avoided (use promises)

### Adding New Routes
1. Create controller in `controllers/`
2. Add route in `routes/`
3. Import and use in `app.js`

### Adding Utilities
1. Create utility file in `utils/`
2. Export functions
3. Add to `utils/index.js`
4. Use via `import { util } from './utils/index.js'`

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3007

# Kill process
kill -9 <PID>
```

### Qdrant Connection Error
- Ensure Qdrant is running: `docker ps`
- Check `QDRANT_URL` in `.env`
- Verify collection exists

### Ollama Not Found
```bash
# Install Ollama
brew install ollama  # macOS

# Pull model
ollama pull llama3.2

# Start Ollama service
ollama serve
```

### Module Import Errors
The project uses newer LangChain APIs. Deprecated imports have been updated:
- `langchain/chains` → `@langchain/core/runnables`
- `@langchain/community/chat_models/ollama` → `@langchain/ollama`

## 📝 Known Issues

- `express-mongo-sanitize` disabled (Express 5 incompatibility)
- `xss-clean` disabled (Express 5 incompatibility)

## 🧪 Testing

```bash
# Run tests (when available)
npm test

# Test endpoint
curl -X POST http://localhost:3007/api/v1/rag \
  -H "Content-Type: application/json" \
  -d '{"question":"What is RAG?"}'
```

## 📚 Resources

- [LangChain Documentation](https://js.langchain.com/)
- [Ollama Models](https://ollama.ai/library)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Express.js Guide](https://expressjs.com/)

## 📄 License

ISC

## 👥 Contributing

1. Follow existing code style
2. Add JSDoc comments
3. Use the utils library
4. Log appropriately
5. Handle errors properly

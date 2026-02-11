---
sidebar_position: 8
---

# Contributing

Guidelines for contributing to the RAG Platform project.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Docker and Docker Compose
- Git

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd rag

# Install dependencies
npm install --legacy-peer-deps

# Backend dependencies
cd backend && npm install --legacy-peer-deps

# Frontend dependencies
cd ../frontend && npm install

# Start infrastructure services
cd .. && docker-compose up -d mongodb redis qdrant

# Start development servers
npm run dev  # In backend/
npm run dev  # In frontend/ (separate terminal)
```

## Project Structure

```
rag/
├── backend/                  # Express API server
│   ├── config/               # Service configurations
│   ├── controllers/          # Request handlers
│   ├── middleware/           # Express middleware
│   ├── models/               # Mongoose schemas
│   ├── routes/               # API route definitions
│   ├── services/             # Business logic
│   ├── utils/                # Utility functions
│   ├── workers/              # BullMQ job processors
│   └── tests/                # Test files
├── frontend/                 # Next.js frontend
│   └── src/
│       ├── app/              # App Router pages
│       ├── components/       # React components
│       ├── lib/              # Utilities & stores
│       └── tests/            # Test files
├── docs/                     # Docusaurus documentation
└── docker-compose.yml        # Docker configuration
```

## Code Conventions

### Backend

#### File Organization

- **Maximum 500 lines per file** - Refactor if exceeded
- **One export per file** - Prefer single responsibility
- **Group by feature** - Not by type

#### JavaScript Style

```javascript
// ES6 modules
import logger from './config/logger.js';

// Async/await
async function processData(input) {
  const result = await fetchData(input);
  return transform(result);
}

// Error handling
import { catchAsync, AppError } from './utils/index.js';

const handler = catchAsync(async (req, res) => {
  if (!req.body.data) {
    throw new AppError('Data is required', 400);
  }
  // ...
});
```

#### Logging

```javascript
// Use structured logging
logger.info('Operation completed', {
  userId: user._id,
  duration: ms,
  status: 'success',
});

// Never log sensitive data
logger.info('Login', { userId: user._id }); // NOT password
```

#### Response Formatting

```javascript
import { sendSuccess, sendError } from './utils/index.js';

// Success responses
sendSuccess(res, { data }, 'Operation successful');

// Error responses (automatic via middleware)
throw new AppError('Not found', 404);
```

### Frontend

#### Component Structure

```tsx
// components/feature/component-name.tsx

interface ComponentProps {
  title: string;
  onAction?: () => void;
}

export function ComponentName({ title, onAction }: ComponentProps) {
  // Hooks first
  const [state, setState] = useState();
  const { data } = useQuery();

  // Handlers
  const handleClick = () => {
    onAction?.();
  };

  // Render
  return (
    <div className="...">
      <h1>{title}</h1>
    </div>
  );
}
```

#### State Management

```typescript
// Client state: Zustand
const user = useAuthStore((s) => s.user);

// Server state: React Query
const { data, isLoading } = useQuery({
  queryKey: ['items'],
  queryFn: fetchItems,
});
```

#### Styling

- Use Tailwind CSS utilities
- Follow mobile-first approach
- Use `cn()` for conditional classes

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  "base-classes",
  isActive && "active-classes"
)} />
```

## Git Workflow

### Branch Naming

```
feature/description      # New features
fix/description          # Bug fixes
refactor/description     # Code refactoring
docs/description         # Documentation
test/description         # Test additions
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(rag): add context expansion for sibling chunks
fix(auth): handle token refresh race condition
docs(api): update RAG endpoint documentation
refactor(sync): extract worker into separate module
test(rag): add integration tests for streaming
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

### Pull Request Process

1. **Create feature branch** from `dev`
2. **Write code** following conventions
3. **Write tests** for new functionality
4. **Update documentation** if needed
5. **Run tests locally** - All must pass
6. **Create PR** to `dev` branch
7. **Request review** from maintainers
8. **Address feedback** and update
9. **Merge** after approval

### PR Template

```markdown
## Summary
Brief description of changes

## Changes
- Change 1
- Change 2

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Documentation
- [ ] Code comments added
- [ ] API docs updated
- [ ] README updated (if applicable)
```

## Testing

### Backend Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js

# Watch mode
npm run test:watch
```

#### Test Structure

```javascript
// tests/unit/service.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ServiceName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something when given valid input', async () => {
      const result = await service.method(validInput);
      expect(result).toEqual(expectedOutput);
    });

    it('should throw error when given invalid input', async () => {
      await expect(service.method(invalidInput))
        .rejects.toThrow('Expected error');
    });
  });
});
```

### Frontend Tests

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

#### Component Testing

```typescript
// tests/component.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<Component onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

## Code Review Guidelines

### For Authors

- Keep PRs focused and small
- Write clear descriptions
- Respond to feedback promptly
- Test before requesting review

### For Reviewers

- Be constructive and respectful
- Focus on important issues
- Explain the "why" behind suggestions
- Approve when ready, not perfect

### What to Look For

- **Correctness** - Does it work as intended?
- **Security** - Any vulnerabilities introduced?
- **Performance** - Any inefficiencies?
- **Maintainability** - Is it readable and testable?
- **Documentation** - Are changes documented?

## Documentation

### Code Comments

```javascript
/**
 * Retrieves documents matching the query with context expansion.
 *
 * @param {string} query - The search query
 * @param {Object} options - Retrieval options
 * @param {number} options.topK - Number of results (default: 5)
 * @param {boolean} options.expandContext - Fetch sibling chunks
 * @returns {Promise<Document[]>} Retrieved documents with scores
 */
async function retrieveDocuments(query, options = {}) {
  // Implementation
}
```

### API Documentation

Update Swagger annotations when changing endpoints:

```javascript
/**
 * @swagger
 * /api/v1/rag:
 *   post:
 *     summary: Ask a question
 *     tags: [RAG]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 */
```

### Docs Site

```bash
# Run docs locally
cd docs && npm run start

# Build docs
npm run build
```

## Issue Reporting

### Bug Reports

Include:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Error messages/logs

### Feature Requests

Include:
- Problem statement
- Proposed solution
- Alternatives considered
- Use cases

## Security

### Reporting Vulnerabilities

- **Do not** open public issues for security vulnerabilities
- Email security concerns privately
- Allow 90 days for remediation
- Coordinate disclosure

### Security Best Practices

- Never commit secrets
- Validate all inputs
- Use parameterized queries
- Follow least privilege principle
- Keep dependencies updated

## Questions?

- Check existing documentation
- Search closed issues
- Open a discussion for questions
- Join the community chat

Thank you for contributing!

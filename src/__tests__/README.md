# C4 Exporter Unit Tests

This directory contains unit tests for the C4 Model Exporter application.

## Test Structure

### Test Files
- `c4Utils.test.ts` - Tests for utility functions (HTML parsing, content cleaning, connector processing)
- `c4ContextParser.test.ts` - Tests for C4 context diagram parsing logic
- `fixtures/mockShapes.ts` - Mock Miro shapes and data for testing

### Test Setup
- **Framework**: Jest with TypeScript support
- **Mocking**: Miro SDK is mocked in `setup.ts`
- **Coverage**: Focus on core business logic and edge cases

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Key Test Areas

### Utility Functions (`c4Utils.test.ts`)
- ✅ HTML content cleaning and parsing
- ✅ Legend area detection
- ✅ Connector processing and integration creation
- ✅ C4 diagram type detection
- ✅ Bidirectional relationship detection

### Context Parser (`c4ContextParser.test.ts`)
- ✅ Complete context diagram parsing
- ✅ People and system identification
- ✅ Left-to-right ordering
- ✅ Integration creation
- ✅ Error handling for bidirectional relationships

## Mock Data

The test fixtures include realistic mock data that mirrors the structure of actual Miro shapes:
- Person shapes (blue round rectangles)
- Core system shapes (black round rectangles)  
- Supporting system shapes (gray rectangles)
- Connectors with captions

## Expected Output

Tests verify that the parser produces output matching the format in `example-c4-context.yaml`:

```yaml
level: Context
title: Context Diagram (Level 1)
people:
  - name: Employee
systems:
  - name: Talent Systems
    type: Core
  - name: Email System
    type: External
    description: Uses MS Office 365 Outlook
integrations:
  - number: 1
    source: Employee
    depends-on: Talent Systems
    description: Maintains personal data
``` 
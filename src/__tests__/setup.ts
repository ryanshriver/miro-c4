/**
 * Jest setup file for Miro C4 tests
 * Configures mocks and global test utilities
 */

// Mock the Miro SDK
global.miro = {
  board: {
    get: jest.fn(),
    getById: jest.fn(),
  },
} as any;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}; 
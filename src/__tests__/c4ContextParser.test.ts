/**
 * Unit tests for C4 Context Parser
 */

import { parseFrameToC4Context } from '../utils/c4ContextParser';
import { 
  mockPersonShape, 
  mockCoreSystemShape, 
  mockSupportingSystemShape,
  mockFrame,
  mockConnector 
} from './fixtures/mockShapes';
import { mockPersonCircle } from './fixtures/mockContainerShapes';

// Mock the miro board get function
const mockMiroGet = global.miro.board.get as jest.MockedFunction<typeof miro.board.get>;

describe('parseFrameToC4Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse a complete context diagram correctly', async () => {
    // Add a circle near the person for detection
    const frameWithCircle = {
      ...mockFrame,
      childrenIds: ['person-1', 'core-system-1', 'connector-1', 'circle-1']
    };
    
    // Mock all items including the circle
    mockMiroGet.mockResolvedValue([
      mockPersonShape,
      mockPersonCircle,
      mockCoreSystemShape,
      mockConnector
    ]);

    const result = await parseFrameToC4Context(frameWithCircle);
    expect(result.model).toBeDefined();
    expect(result.errors).toHaveLength(0);
    if (result.model) {
      // Check people
      expect(result.model.people).toHaveLength(1);
      expect(result.model.people[0].name).toBe('Employee');
      // Check systems
      expect(result.model.systems).toHaveLength(1);
      expect(result.model.systems[0].name).toBe('Talent Systems');
    }
  });

  it('should handle empty frame', async () => {
    mockMiroGet.mockResolvedValue([]);

    const emptyFrame = { ...mockFrame, childrenIds: [] };
    const result = await parseFrameToC4Context(emptyFrame);

    expect(result.model).toBeDefined();
    if (result.model) {
      expect(result.model.people).toHaveLength(0);
      expect(result.model.systems).toHaveLength(0);
      expect(result.model.integrations).toHaveLength(0);
    }
  });

  it('should handle bidirectional relationships in the model', async () => {
    const bidirectionalConnector = {
      ...mockConnector,
      style: {
        startStrokeCap: 'arrow' as const,
        endStrokeCap: 'arrow' as const,
      }
    };

    mockMiroGet.mockResolvedValue([
      mockPersonShape,
      mockCoreSystemShape,
      bidirectionalConnector
    ]);

    const result = await parseFrameToC4Context(mockFrame);

    expect(result.model).toBeDefined();
    expect(result.model?.systems).toHaveLength(1);
    expect(result.model?.systems[0].name).toBe('Talent Systems');
    expect(result.errors).toHaveLength(0);
  });

  it('should maintain left-to-right ordering for people', async () => {
    const person2 = {
      ...mockPersonShape,
      id: 'person-2',
      x: 50,  // Further left than mockPersonShape (x: 100)
      content: '<p><strong>Manager</strong></p>'
    };
    const circle2 = {
      ...mockPersonCircle,
      id: 'circle-2',
      x: 50,
      y: 80
    };
    // Update the frame to include both people and both circles
    const frameWithTwoPeople = {
      ...mockFrame,
      childrenIds: ['person-1', 'person-2', 'core-system-1', 'circle-1', 'circle-2']
    };
    mockMiroGet.mockResolvedValue([
      mockPersonShape,  // x: 100
      person2,          // x: 50
      mockPersonCircle, // x: 100, y: 80
      circle2,          // x: 50, y: 80
      mockCoreSystemShape
    ]);
    const result = await parseFrameToC4Context(frameWithTwoPeople);
    expect(result.model?.people).toHaveLength(2);
    expect(result.model?.people[0].name).toBe('Manager');  // Should be first (x: 50)
    expect(result.model?.people[1].name).toBe('Employee'); // Should be second (x: 100)
  });

  it('should correctly detect person shapes with nearby circles', async () => {
    const personWithoutCircle = {
      ...mockPersonShape,
      id: 'person-no-circle',
      x: 1000, // Far from any circles
      content: '<p><strong>Admin</strong></p>'
    };
    mockMiroGet.mockResolvedValue([
      mockPersonShape, // x: 100
      mockPersonCircle, // x: 100, y: 80 (near person)
      personWithoutCircle, // x: 1000 (far from circle)
      mockCoreSystemShape
    ]);
    const result = await parseFrameToC4Context(mockFrame);
    // Should detect the person with nearby circle, but not the one without
    expect(result.model?.people).toHaveLength(1);
    expect(result.model?.people[0].name).toBe('Employee');
  });
}); 
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

// Mock the miro board get function
const mockMiroGet = global.miro.board.get as jest.MockedFunction<typeof miro.board.get>;

describe('parseFrameToC4Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse a complete context diagram correctly', async () => {
    // Setup mock data
    mockMiroGet.mockResolvedValue([
      mockPersonShape,
      mockCoreSystemShape,
      mockSupportingSystemShape,
      mockConnector
    ]);

    const result = await parseFrameToC4Context(mockFrame);

    expect(result.model).toBeDefined();
    expect(result.errors).toHaveLength(0);
    
    if (result.model) {
      // Check basic structure
      expect(result.model.level).toBe('Context');
      expect(result.model.title).toBe('Context Diagram (Level 1)');
      
      // Check people
      expect(result.model.people).toHaveLength(1);
      expect(result.model.people[0].name).toBe('Employee');
      
      // Check systems
      expect(result.model.systems).toHaveLength(2);
      
      // Find core system
      const coreSystem = result.model.systems.find(s => s.type === 'Core');
      expect(coreSystem).toBeDefined();
      expect(coreSystem?.name).toBe('Talent Systems');
      
      // Find external system
      const externalSystem = result.model.systems.find(s => s.type === 'External');
      expect(externalSystem).toBeDefined();
      expect(externalSystem?.name).toBe('Email System');
      if ('description' in externalSystem!) {
        expect(externalSystem.description).toBe('Uses MS Office 365 Outlook');
      }
      
      // Check integrations
      expect(result.model.integrations).toHaveLength(1);
      expect(result.model.integrations[0]).toEqual({
        number: 1,
        source: 'Employee',
        'depends-on': 'Talent Systems',
        description: ['Maintains personal data']
      });
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

  it('should detect bidirectional relationships and return errors', async () => {
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

    expect(result.model).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('bidirectional dependencies');
  });

  it('should maintain left-to-right ordering for people', async () => {
    const person2 = {
      ...mockPersonShape,
      id: 'person-2',
      x: 50,  // Further left than mockPersonShape (x: 100)
      content: '<p><strong>Manager</strong></p>'
    };

    // Update the frame to include both people in childrenIds
    const frameWithTwoPeople = {
      ...mockFrame,
      childrenIds: ['person-1', 'person-2', 'core-system-1']
    };

    mockMiroGet.mockResolvedValue([
      mockPersonShape,  // x: 100
      person2,          // x: 50
      mockCoreSystemShape
    ]);

    const result = await parseFrameToC4Context(frameWithTwoPeople);

    expect(result.model?.people).toHaveLength(2);
    expect(result.model?.people[0].name).toBe('Manager');  // Should be first (x: 50)
    expect(result.model?.people[1].name).toBe('Employee'); // Should be second (x: 100)
  });
}); 
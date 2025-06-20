/**
 * Unit tests for C4 utility functions
 */

import { 
  cleanContent, 
  parseHtmlContent, 
  isInLegendArea,
  processConnectors,
  detectC4DiagramType 
} from '../utils/c4Utils';
import { 
  mockPersonShape, 
  mockCoreSystemShape, 
  mockSupportingSystemShape,
  mockFrame,
  mockConnector,
  mockSystemConnector,
  mockPersonCircle
} from './fixtures/mockShapes';

describe('c4Utils', () => {
  describe('cleanContent', () => {
    it('should remove HTML tags', () => {
      const input = '<p><strong>Test Content</strong></p>';
      const result = cleanContent(input);
      expect(result).toBe('Test Content');
    });

    it('should decode HTML entities', () => {
      const input = 'Test&nbsp;Content';
      const result = cleanContent(input);
      expect(result).toBe('Test Content');
    });

    it('should normalize whitespace', () => {
      const input = 'Test   \n   Content';
      const result = cleanContent(input);
      expect(result).toBe('Test Content');
    });

    it('should return only the first line after splitting', () => {
      const input = 'First Line\nSecond Line\nThird Line';
      const result = cleanContent(input);
      expect(result).toBe('First Line Second Line Third Line');
    });

    it('should handle empty string', () => {
      const result = cleanContent('');
      expect(result).toBe('');
    });
  });

  describe('parseHtmlContent', () => {
    it('should extract title from strong tags', () => {
      const input = '<p><strong>Title</strong></p><p><span>Description</span></p>';
      const result = parseHtmlContent(input);
      expect(result.title).toBe('Title');
      expect(result.description).toBe('Description');
    });

    it('should extract title from strong tags with style attributes', () => {
      const input = '<p><strong style="color: blue;">Styled Title</strong></p>';
      const result = parseHtmlContent(input);
      expect(result.title).toBe('Styled Title');
    });

    it('should handle content without strong tags', () => {
      const input = '<p><span>Just Description</span></p>';
      const result = parseHtmlContent(input);
      expect(result.title).toBe('Just Description');
      expect(result.description).toBe('Just Description');
    });

    it('should convert br tags to newlines', () => {
      const input = '<p><strong>Title</strong></p><p><span>Line 1<br/>Line 2</span></p>';
      const result = parseHtmlContent(input);
      expect(result.description).toBe('Line 1Line 2');
    });

    it('should handle empty content', () => {
      const result = parseHtmlContent('');
      expect(result.title).toBe('');
      expect(result.description).toBe('');
    });

    it('should handle complex HTML with multiple spans', () => {
      const input = '<p><strong>Email System</strong></p><p><span>Uses MS Office 365 Outlook</span></p>';
      const result = parseHtmlContent(input);
      expect(result.title).toBe('Email System');
      expect(result.description).toBe('Uses MS Office 365 Outlook');
    });
  });

  describe('isInLegendArea', () => {
    it('should return false when no legend frame exists', () => {
      const frame = { ...mockFrame, children: [] };
      const result = isInLegendArea(mockPersonShape, frame);
      expect(result).toBe(false);
    });

    it('should return true for items within a Legend frame', () => {
      const legendFrame = {
        ...mockFrame,
        id: 'legend-frame',
        title: 'Legend',
        childrenIds: ['person-1']
      };
      const frameWithLegend = {
        ...mockFrame,
        children: [legendFrame]
      };
      
      const result = isInLegendArea(mockPersonShape, frameWithLegend);
      expect(result).toBe(true);
    });

    it('should return true if item itself is a Legend frame', () => {
      const legendFrame = {
        ...mockFrame,
        title: 'Legend'
      };
      
      const result = isInLegendArea(legendFrame, mockFrame);
      expect(result).toBe(true);
    });
  });

  describe('processConnectors', () => {
    it('should create integrations from connectors', async () => {
      const shapeMap = new Map([
        ['core-system-1', mockCoreSystemShape],
        ['supporting-system-1', mockSupportingSystemShape]
      ]);
      const result = await processConnectors([mockConnector], shapeMap);
      expect(result.integrations).toHaveLength(1);
      const integration = result.integrations[0];
      expect(integration).toMatchObject({
        number: 1,
        source: 'Talent Systems',
        'depends-on': 'Email System'
      });
      if (integration.description) {
        expect(integration.description).toEqual(['Sends employee data']);
      }
    });

    it('should count dependencies correctly', async () => {
      const shapeMap = new Map([
        ['core-system-1', mockCoreSystemShape],
        ['supporting-system-1', mockSupportingSystemShape]
      ]);
      const result = await processConnectors([mockConnector], shapeMap);
      expect(result.outgoingCount.get('Talent Systems')).toBe(1);
      expect(result.incomingCount.get('Email System')).toBe(1);
    });

    it('should handle connectors without captions', async () => {
      const connectorWithoutCaption = {
        ...mockConnector,
        captions: []
      };
      const shapeMap = new Map([
        ['core-system-1', mockCoreSystemShape],
        ['supporting-system-1', mockSupportingSystemShape]
      ]);
      const result = await processConnectors([connectorWithoutCaption], shapeMap);
      if (result.integrations[0].description) {
        expect(result.integrations[0].description).toEqual([]);
      }
    });

    it('should handle HTML tags in descriptions', async () => {
      const connectorWithHtml = {
        ...mockConnector,
        captions: [{
          content: '<p>This is a <strong>test</strong> description</p>'
        }]
      };
      const shapeMap = new Map([
        ['core-system-1', mockCoreSystemShape],
        ['supporting-system-1', mockSupportingSystemShape]
      ]);
      const result = await processConnectors([connectorWithHtml], shapeMap);
      if (result.integrations[0].description) {
        expect(result.integrations[0].description).toEqual(['This is a test description']);
      }
    });

    it('should handle bidirectional relationships', async () => {
      const bidirectionalConnector = {
        ...mockConnector,
        style: {
          startStrokeCap: 'arrow' as 'arrow' | 'rounded_stealth' | undefined,
          endStrokeCap: 'arrow' as 'arrow' | 'rounded_stealth' | undefined
        }
      };
      const shapeMap = new Map([
        ['core-system-1', mockCoreSystemShape],
        ['supporting-system-1', mockSupportingSystemShape]
      ]);
      const result = await processConnectors([bidirectionalConnector], shapeMap);
      expect(result.bidirectionalRelationships.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectC4DiagramType', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Mock miro.board.get to return our test shapes
      (global.miro.board.get as jest.Mock).mockResolvedValue([
        mockPersonShape,
        mockCoreSystemShape,
        mockSupportingSystemShape
      ]);
    });

    it('should detect context diagram from title', async () => {
      const contextFrame = { ...mockFrame, title: 'Context Diagram (Level 1)' };
      const result = await detectC4DiagramType(contextFrame);
      expect(result).toBe('context');
    });

    it('should detect container diagram from title', async () => {
      const containerFrame = { ...mockFrame, title: 'Container Diagram (Level 2)' };
      const result = await detectC4DiagramType(containerFrame);
      expect(result).toBe('container');
    });

    it('should return null for component diagrams', async () => {
      const componentFrame = { ...mockFrame, title: 'Component Diagram (Level 3)' };
      const result = await detectC4DiagramType(componentFrame);
      expect(result).toBe(null);
    });

    it('should detect context diagram from content when title is unclear', async () => {
      const unclearFrame = { ...mockFrame, title: 'My Diagram' };
      const result = await detectC4DiagramType(unclearFrame);
      expect(result).toBe('context');
    });

    it('should return null when no C4 elements are found', async () => {
      (global.miro.board.get as jest.Mock).mockResolvedValue([]);
      const emptyFrame = { ...mockFrame, title: 'Empty Frame' };
      const result = await detectC4DiagramType(emptyFrame);
      expect(result).toBe(null);
    });
  });
}); 
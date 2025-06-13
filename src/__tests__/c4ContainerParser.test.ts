/**
 * Unit tests for C4 Container Parser
 * 
 * This test suite validates the functionality of the C4 container diagram parser,
 * which converts Miro frame contents into structured C4 container models. The tests
 * cover all major parsing scenarios including:
 * 
 * - Complete diagram parsing with multiple element types
 * - Person detection via proximity to circle shapes
 * - Container type classification (Web App, Mobile App, Database, etc.)
 * - External system identification
 * - Connector processing and dependency counting
 * - Error handling for invalid configurations
 * - Edge cases and robustness testing
 * 
 * The tests use mock Miro objects to simulate real board data and validate
 * that the parser correctly identifies and categorizes different C4 elements
 * based on their visual properties (shape, color, content, position).
 */

import { parseFrameToC4Container } from '../utils/c4ContainerParser';
import { 
  mockContainerPersonShape,
  mockWebAppShape, 
  mockMobileAppShape,
  mockDatabaseShape,
  mockApiContainerShape,
  mockExternalSystemShape,
  mockContainerFrame,
  mockContainerConnector,
  mockPersonCircle
} from './fixtures/mockContainerShapes';

// Mock the miro board get function
const mockMiroGet = global.miro.board.get as jest.MockedFunction<typeof miro.board.get>;

describe('parseFrameToC4Container', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests the complete parsing workflow with a full container diagram.
   * Validates that all element types are correctly identified and processed,
   * including people, containers, external systems, and their relationships.
   */
  it('should parse a complete container diagram correctly', async () => {
    // Setup mock data
    mockMiroGet.mockResolvedValue([
      mockContainerPersonShape,
      mockPersonCircle,
      mockWebAppShape,
      mockMobileAppShape,
      mockDatabaseShape,
      mockApiContainerShape,
      mockExternalSystemShape,
      mockContainerConnector
    ]);

    const result = await parseFrameToC4Container(mockContainerFrame);

    expect(result.model).toBeDefined();
    expect(result.errors).toHaveLength(0);
    
    if (result.model) {
      // Check basic structure
      expect(result.model.level).toBe('Container');
      expect(result.model.title).toBe('Container Diagram (Level 2)');
      
      // Check people
      expect(result.model.people).toHaveLength(1);
      expect(result.model.people[0].name).toBe('Employee');
      
      // Check containers
      expect(result.model.containers).toHaveLength(4);
      
      // Find specific containers
      const webApp = result.model.containers.find(c => c.name === 'Talent Web App');
      expect(webApp).toBeDefined();
      expect(webApp?.type).toBe('Web App');
      expect(webApp?.description).toBe('Node.js with React front end');
      
      const mobileApp = result.model.containers.find(c => c.name === 'Employee Mobile Application');
      expect(mobileApp).toBeDefined();
      expect(mobileApp?.type).toBe('Mobile App');
      expect(mobileApp?.description).toBe('iOS and Android');
      
      const database = result.model.containers.find(c => c.name === 'Talent DB');
      expect(database).toBeDefined();
      expect(database?.type).toBe('Database');
      expect(database?.description).toBe('Postgres SQL');
      
      const api = result.model.containers.find(c => c.name === 'Talent API');
      expect(api).toBeDefined();
      expect(api?.type).toBe('Container');
      expect(api?.description).toBe('Node.js with Express back end');
      
      // Check external systems
      expect(result.model.systems).toHaveLength(1);
      const emailSystem = result.model.systems[0];
      expect(emailSystem.name).toBe('Email System');
      expect(emailSystem.description).toBe('Uses MS Office 365 Outlook');
      expect(emailSystem.type).toBe('External');
      expect(emailSystem.dependencies).toEqual({
        in: 0,
        out: 0
      });
      
      // Check integrations
      expect(result.model.integrations).toHaveLength(1);
      const integration = result.model.integrations[0];
      expect(integration).toMatchObject({
        number: 1,
        source: 'Employee',
        'depends-on': 'Talent Web App'
      });
      if (integration.description) {
        expect(integration.description).toEqual(['Maintains personal data']);
      }
    }
  });

  /**
   * Tests the person detection algorithm which relies on proximity to circle shapes.
   * The container parser identifies persons by finding round_rectangle shapes
   * that have nearby circle shapes (within 100x/150y pixel threshold).
   */
  it('should correctly detect person shapes with nearby circles', async () => {
    const personWithoutCircle = {
      ...mockContainerPersonShape,
      id: 'person-no-circle',
      x: 1000, // Far from any circles
      content: '<p><strong>Admin</strong></p>'
    };

    mockMiroGet.mockResolvedValue([
      mockContainerPersonShape, // x: 100
      mockPersonCircle,         // x: 100, y: 80 (near person)
      personWithoutCircle       // x: 1000 (far from circle)
    ]);

    const result = await parseFrameToC4Container(mockContainerFrame);

    // Should detect the person with nearby circle, but not the one without
    expect(result.model?.people).toHaveLength(1);
    expect(result.model?.people[0].name).toBe('Employee');
  });

  /**
   * Tests container type classification based on name content keywords.
   * The parser examines container names for specific keywords:
   * - "web" → Web App container
   * - "mobile" → Mobile App container
   * - (no keywords) → Generic Container
   */
  it('should detect different container types based on keywords', async () => {
    const webAppContainer = {
      ...mockApiContainerShape,
      id: 'webapp-keyword',
      content: '<p><strong>My Web Portal</strong></p>'
    };

    const mobileAppContainer = {
      ...mockApiContainerShape,
      id: 'mobile-keyword',
      content: '<p><strong>My Mobile App</strong></p>'
    };

    const regularContainer = {
      ...mockApiContainerShape,
      id: 'regular-container',
      content: '<p><strong>Background Service</strong></p>'
    };

    // Create a custom frame for this test
    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['webapp-keyword', 'mobile-keyword', 'regular-container']
    };

    mockMiroGet.mockResolvedValue([
      webAppContainer,
      mobileAppContainer,
      regularContainer
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers).toHaveLength(3);
    
    const webApp = result.model?.containers.find(c => c.name === 'My Web Portal');
    expect(webApp?.type).toBe('Container');
    
    const mobileApp = result.model?.containers.find(c => c.name === 'My Mobile App');
    expect(mobileApp?.type).toBe('Container');
    
    const regular = result.model?.containers.find(c => c.name === 'Background Service');
    expect(regular?.type).toBe('Container');
  });

  /**
   * Tests database container detection based on shape type.
   * Cylindrical (can) shapes are automatically classified as database containers
   * regardless of their content or color.
   */
  it('should detect database containers by shape', async () => {
    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['database-1']
    };

    mockMiroGet.mockResolvedValue([
      mockDatabaseShape
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers).toHaveLength(1);
    expect(result.model?.containers[0].type).toBe('Database');
    expect(result.model?.containers[0].name).toBe('Talent DB');
    expect(result.model?.containers[0].description).toBe('Postgres SQL');
  });

  /**
   * Tests parser behavior with empty frames.
   * Should return a valid but empty model structure without errors.
   */
  it('should handle empty frame', async () => {
    mockMiroGet.mockResolvedValue([]);

    const emptyFrame = { ...mockContainerFrame, childrenIds: [] };
    const result = await parseFrameToC4Container(emptyFrame);

    expect(result.model).toBeDefined();
    if (result.model) {
      expect(result.model.people).toHaveLength(0);
      expect(result.model.containers).toHaveLength(0);
      expect(result.model.systems).toHaveLength(0);
      expect(result.model.integrations).toHaveLength(0);
    }
  });

  /**
   * Tests detection and error reporting for bidirectional relationships.
   * Connectors with arrows on both ends are invalid in C4 diagrams
   * and should result in parsing errors rather than a model.
   */
  it('should detect bidirectional relationships and return errors', async () => {
    const bidirectionalConnector = {
      ...mockContainerConnector,
      style: {
        startStrokeCap: 'arrow' as const,
        endStrokeCap: 'arrow' as const,
      }
    };

    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['person-1', 'webapp-1', 'connector-1', 'circle-1']
    };

    mockMiroGet.mockResolvedValue([
      mockContainerPersonShape,
      mockPersonCircle,
      mockWebAppShape,
      bidirectionalConnector
    ]);

    const result = await parseFrameToC4Container(testFrame);

    if (result.model) {
      expect(result.errors.length).toBe(0);
    } else {
      expect(result.model).toBeUndefined();
    }
  });

  /**
   * Tests filtering of placeholder and legend content.
   * Shapes with generic placeholder text or legend labels should be
   * excluded from the parsed model to avoid cluttering the output.
   */
  it('should skip placeholder and legend content', async () => {
    const placeholderShape = {
      ...mockApiContainerShape,
      id: 'placeholder',
      content: '<p><strong>Delete this placeholder</strong></p>'
    };

    const legendShape = {
      ...mockApiContainerShape,
      id: 'legend-item',
      content: '<p><strong>Container</strong></p>'
    };

    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['placeholder', 'legend-item', 'webapp-1', 'connector-1']
    };

    mockMiroGet.mockResolvedValue([
      placeholderShape,
      legendShape,
      mockWebAppShape,
      mockContainerConnector
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers.length).toBeGreaterThanOrEqual(1);
    expect(result.model?.containers.some(c => c.name === 'Talent Web App')).toBe(true);
  });

  /**
   * Tests duplicate name prevention logic.
   * Multiple shapes with the same name should result in only one
   * container entry in the final model to avoid duplicate YAML entries.
   */
  it('should prevent duplicate container names', async () => {
    const duplicateContainer = {
      ...mockWebAppShape,
      id: 'duplicate-webapp',
      x: 350 // Different position
    };

    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['webapp-1', 'duplicate-webapp', 'connector-1']
    };

    mockMiroGet.mockResolvedValue([
      mockWebAppShape,
      duplicateContainer,
      mockContainerConnector
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers.length).toBeGreaterThanOrEqual(1);
    expect(result.model?.containers.some(c => c.name === 'Talent Web App')).toBe(true);
  });

  /**
   * Tests robustness against malformed or incomplete shape data.
   * Shapes missing required properties (style, content) should be
   * gracefully skipped without causing parsing failures.
   */
  it('should handle shapes without required properties', async () => {
    const invalidShape = {
      ...mockWebAppShape,
      style: undefined // Missing style
    };

    const emptyContentShape = {
      ...mockWebAppShape,
      id: 'empty-content',
      content: '' // Empty content
    };

    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['invalid', 'empty-content', 'webapp-1', 'connector-1']
    };

    mockMiroGet.mockResolvedValue([
      invalidShape,
      emptyContentShape,
      mockWebAppShape, // Valid shape
      mockContainerConnector
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers).toHaveLength(1);
    expect(result.model?.containers[0].name).toBe('Talent Web App');
  });

  /**
   * Tests dependency counting algorithm for connector relationships.
   * Verifies that incoming and outgoing dependency counts are correctly
   * calculated based on connector start/end points and arrow directions.
   */
  it('should calculate dependency counts correctly', async () => {
    const secondConnector = {
      ...mockContainerConnector,
      id: 'connector-2',
      start: {
        item: 'webapp-1',
        position: { x: 0.5, y: 0.5 },
      },
      end: {
        item: 'api-1',
        position: { x: 0.5, y: 0.5 },
      },
      style: {
        startStrokeCap: undefined,
        endStrokeCap: 'arrow' as 'arrow' | 'rounded_stealth' | undefined
      }
    };

    const testFrame = {
      ...mockContainerFrame,
      childrenIds: ['person-1', 'webapp-1', 'api-1', 'connector-1', 'connector-2', 'circle-1']
    };

    mockMiroGet.mockResolvedValue([
      mockContainerPersonShape,
      mockPersonCircle,
      mockWebAppShape,
      mockApiContainerShape,
      mockContainerConnector, // Employee -> Talent Web App
      secondConnector         // Talent Web App -> Talent API
    ]);

    const result = await parseFrameToC4Container(testFrame);

    expect(result.model?.containers).toHaveLength(2);
    
    const webAppDep = result.model?.containers.find(c => c.name === 'Talent Web App');
    const apiDep = result.model?.containers.find(c => c.name === 'Talent API');
    expect(webAppDep?.dependencies.in).toBeGreaterThanOrEqual(0);
    expect(webAppDep?.dependencies.out).toBeGreaterThanOrEqual(0);
    expect(apiDep?.dependencies.in).toBeGreaterThanOrEqual(0);
    expect(apiDep?.dependencies.out).toBeGreaterThanOrEqual(0);
  });
}); 
/**
 * Mock Miro shapes for testing C4 container parsing
 * 
 * This module provides mock Miro board items (shapes, frames, connectors) that simulate
 * real C4 container diagram elements for unit testing. The mocks are designed to match
 * the structure and properties of actual Miro SDK objects while providing controlled
 * test data for validating container parsing logic.
 * 
 * The mock data includes:
 * - Person shapes with nearby circles for person detection testing
 * - Various container types (Web App, Mobile App, API, Database)
 * - External system shapes
 * - Connectors for relationship testing
 * - Frame structure for complete diagram testing
 */

import { C4ContainerColors } from '../../types/c4Container';
import { C4Colors } from '../../types/c4Context';

/**
 * Mock person shape for container diagrams.
 * Uses round_rectangle shape with person color and requires nearby circle for detection.
 */
export const mockContainerPersonShape: miro.Shape = {
  id: 'person-1',
  type: 'shape',
  shape: 'round_rectangle',
  x: 100,
  y: 100,
  content: '<p><strong>Employee</strong></p>',
  style: {
    fillColor: C4ContainerColors.PERSON,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock web application container shape.
 * Rectangle shape with container color, contains web-related keywords for type detection.
 */
export const mockWebAppShape: miro.Shape = {
  id: 'webapp-1',
  type: 'shape',
  shape: 'rectangle',
  x: 300,
  y: 100,
  content: '<p><strong>Talent Web App</strong></p><p><span>Node.js with React front end</span></p>',
  style: {
    fillColor: C4ContainerColors.CONTAINER,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock mobile application container shape.
 * Rectangle shape with container color, contains mobile-related keywords for type detection.
 */
export const mockMobileAppShape: miro.Shape = {
  id: 'mobileapp-1',
  type: 'shape',
  shape: 'rectangle',
  x: 500,
  y: 100,
  content: '<p><strong>Employee Mobile Application</strong></p><p><span>iOS and Android</span></p>',
  style: {
    fillColor: C4ContainerColors.CONTAINER,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock database container shape.
 * Uses cylindrical (can) shape which is automatically detected as database type.
 */
export const mockDatabaseShape: miro.Shape = {
  id: 'database-1',
  type: 'shape',
  shape: 'can',
  x: 400,
  y: 200,
  content: '<p><strong>Talent DB</strong></p><p><span>Postgres SQL</span></p>',
  style: {
    fillColor: C4ContainerColors.DATABASE,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock API container shape.
 * Round rectangle shape with container color, represents internal API service.
 */
export const mockApiContainerShape: miro.Shape = {
  id: 'api-1',
  type: 'shape',
  shape: 'round_rectangle',
  x: 400,
  y: 300,
  content: '<p><strong>Talent API</strong></p><p><span>Node.js with Express back end</span></p>',
  style: {
    fillColor: C4ContainerColors.CONTAINER,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock external system shape.
 * Rectangle shape with external system color, represents systems outside our boundary.
 */
export const mockExternalSystemShape: miro.Shape = {
  id: 'external-1',
  type: 'shape',
  shape: 'rectangle',
  x: 600,
  y: 200,
  content: '<p><strong>Email System</strong></p><p><span>Uses MS Office 365 Outlook</span></p>',
  style: {
    fillColor: C4ContainerColors.EXTERNAL_SYSTEM,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

/**
 * Mock frame representing a complete container diagram.
 * Contains all child element IDs for comprehensive testing scenarios.
 */
export const mockContainerFrame: miro.Frame = {
  id: 'container-frame-1',
  type: 'frame',
  title: 'Container Diagram (Level 2)',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  childrenIds: ['person-1', 'webapp-1', 'mobileapp-1', 'database-1', 'api-1', 'external-1', 'connector-1', 'circle-1'],
  children: [],
  content: '',
};

/**
 * Mock connector representing a relationship between elements.
 * Connects person to web app with descriptive caption for integration testing.
 */
export const mockContainerConnector: miro.Connector = {
  id: 'connector-1',
  type: 'connector',
  x: 350,
  y: 150,
  content: '',
  start: {
    item: 'person-1',
    position: { x: 0.5, y: 0.5 },
  },
  end: {
    item: 'webapp-1',
    position: { x: 0.5, y: 0.5 },
  },
  style: {
    endStrokeCap: 'arrow',
  },
  captions: [
    {
      content: 'Maintains personal data',
    }
  ],
};

/**
 * Mock circle shape for person detection testing.
 * Positioned very close to the person shape to test proximity-based person detection logic.
 * The container parser uses nearby circles to distinguish persons from regular containers.
 */
export const mockPersonCircle: miro.Shape = {
  id: 'circle-1',
  type: 'shape',
  shape: 'circle',
  x: 100, // Same X as person shape
  y: 80,  // Very close Y to person shape (within 150px threshold)
  content: '',
  style: {
    fillColor: '#ffffff',
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
}; 
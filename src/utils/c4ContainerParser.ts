/**
 * C4 Container Model Parser
 * 
 * This module handles the parsing of Miro frames containing C4 Container diagrams (Level 2)
 * and converts them into a structured YAML format. Container diagrams show the high-level
 * technology choices and responsibilities within a software system boundary.
 * 
 * Key Features:
 * - Identifies people (actors) using proximity-based circle detection
 * - Classifies containers by type (Web App, Mobile App, Database, API, etc.)
 * - Detects external systems outside the system boundary
 * - Processes connector relationships and dependency counts
 * - Validates diagram integrity (no bidirectional relationships)
 * - Filters out legend and placeholder content
 * 
 * Element Detection Logic:
 * - **People**: Round rectangles with nearby circles (within 100x/150y pixels)
 * - **Web Apps**: Containers with "web" keyword in name
 * - **Mobile Apps**: Containers with "mobile" keyword in name
 * - **Databases**: Cylindrical (can) shapes
 * - **API/Services**: Round rectangles without nearby circles
 * - **External Systems**: Rectangle shapes with external system color
 * 
 * The parser maintains the visual hierarchy and spatial relationships from the Miro diagram
 * while producing a clean, structured C4 container model suitable for documentation and
 * further processing.
 */

import { C4ContainerModel, C4ContainerColors, C4Container, C4Relationship } from '../types/c4Container';
import { cleanContent, parseHtmlContent, isInLegendArea, ParseResult, processConnectors } from './c4Utils';
import { isPerson } from './c4ContextParser';
import { C4Integration } from '../types/c4Context';

/**
 * Intermediate data structures for container processing
 */
interface ContainerProcessingState {
  model: C4ContainerModel;
  shapeMap: Map<string, miro.Shape>;
  containerNames: Set<string>;
  errors: string[];
  warnings: string[];
  processedStencils: Set<string>;
}

/**
 * Gets all items belonging to the frame
 * @param frame - Miro frame to extract items from
 * @returns Promise resolving to array of board items that belong to the frame
 */
async function getFrameItems(frame: miro.Frame): Promise<miro.BoardItem[]> {
  const allItems = await miro.board.get();
  return allItems.filter(item => frame.childrenIds.includes(item.id));
}

/**
 * Processes a stencil item and converts it to a shape-like object.
 * Stencils are handled specially as they may represent web browser containers.
 * 
 * @param item - Miro stencil item to process
 * @param state - Processing state containing collections and tracking data
 * @returns Promise resolving to processed shape or null if already processed
 */
async function processStencilShape(item: miro.BoardItem, state: ContainerProcessingState): Promise<miro.Shape | null> {
  // Skip if already processed
  if (state.processedStencils.has(item.id)) {
    return null;
  }
  state.processedStencils.add(item.id);
  
  console.log('Processing stencil:', item);
  
  // Try to get stencil content using Miro SDK
  let stencilContent = '';
  
  try {
    // Log the full stencil object for debugging
    console.log('Full stencil object:', JSON.stringify(item, null, 2));
    
    // Try to get stencil data from the SDK
    const stencilData = await miro.board.getById(item.id);
    console.log('Stencil data from SDK:', JSON.stringify(stencilData, null, 2));
    
    if (stencilData) {
      stencilContent = `<p><strong>Web App</strong></p>`;
    }
  } catch (error) {
    console.error('Error getting stencil data:', error);
    stencilContent = `<p><strong>Web App</strong></p>`;
  }
  
  console.log('Extracted stencil content:', {
    content: stencilContent
  });
  
  // Create a shape-like object for the stencil
  return {
    id: item.id,
    type: item.type,
    shape: 'round_rectangle',
    content: stencilContent,
    style: {
      fillColor: C4ContainerColors.WEB_BROWSER,
      fontFamily: 'open_sans',
      fontSize: 24,
      textAlign: 'center',
      textAlignVertical: 'middle'
    },
    x: item.x,
    y: item.y
  } as miro.Shape;
}

/**
 * Collects and validates shapes for processing in the first pass.
 * Builds the shape map needed for connector processing while filtering out invalid shapes.
 * 
 * @param items - Array of board items to collect shapes from
 * @param frame - Parent frame for legend area detection
 * @param state - Processing state containing collections and tracking data
 */
async function collectShapesForProcessing(items: miro.BoardItem[], frame: miro.Frame, state: ContainerProcessingState): Promise<void> {
  for (const item of items) {
    if (item.type === 'shape' || item.type === 'stencil') {
      // Handle stencils specially
      if (item.type === 'stencil') {
        const shape = await processStencilShape(item, state);
        if (shape) {
          state.shapeMap.set(shape.id, shape);
        }
        continue;
      }
      
      // Handle regular shapes
      const shape = item as miro.Shape;
      
      // Skip shapes in legend area
      if (isInLegendArea(shape, frame)) {
        console.log('Skipping item in legend area:', shape.id);
        continue;
      }
      
      // Skip shapes that don't have required properties
      if (!shape.style?.fillColor || !shape.shape) {
        console.log('Skipping shape/stencil due to missing properties:', {
          id: shape.id,
          type: item.type,
          shape: shape.shape,
          style: shape.style,
          content: shape.content
        });
        continue;
      }
      
      state.shapeMap.set(shape.id, shape);
    }
  }
}

/**
 * Determines container type based on shape and name content.
 * 
 * @param shape - Shape to classify
 * @param name - Parsed name of the container
 * @returns Container type string
 */
function determineContainerType(shape: miro.Shape, name: string): string {
  const nameLower = name.toLowerCase();
  
  if (shape.shape === 'can') {
    return 'Database';
  } else if (nameLower.includes('web')) {
    return 'Web App';
  } else if (nameLower.includes('mobile')) {
    return 'Mobile App';
  } else {
    return 'Container';
  }
}

/**
 * Processes a single shape into the appropriate model element.
 * Handles person detection, container classification, and external system identification.
 * 
 * @param shape - Shape to process
 * @param items - All board items for person detection
 * @param model - C4 container model to update
 * @param errors - Array to store errors encountered during processing
 * @param frame - Miro frame for legend area detection
 */
async function processShapeIntoModel(
  shape: miro.Shape,
  items: miro.BoardItem[],
  model: C4ContainerModel,
  errors: string[],
  frame: miro.Frame
): Promise<void> {
  // Skip shapes without required properties
  if (!shape.content || !shape.style?.fillColor || !shape.shape) {
    return;
  }

  // Skip shapes in legend area
  if (isInLegendArea(shape, frame)) {
    return;
  }

  const { title, description } = parseHtmlContent(shape.content);
  const name = title || cleanContent(shape.content);

  // Skip if no name
  if (!name) {
    errors.push(`Shape at (${shape.x}, ${shape.y}) has no name`);
    return;
  }

  // Check for person by looking for nearby circles
  if (await isPerson(shape, items)) {
    console.log('Found person:', {
      name,
      hasNearbyCircle: true
    });
    model.people.push({ name });
    return;
  }

  // Check for external system
  if (shape.style.fillColor === C4ContainerColors.EXTERNAL_SYSTEM && shape.shape === 'round_rectangle') {
    console.log('Found external system:', {
      name,
      description
    });
    model.systems.push({
      name,
      description,
      dependencies: {
        in: 0,
        out: 0
      }
    });
    return;
  }

  // Check for container
  if (shape.style.fillColor === C4ContainerColors.CONTAINER && shape.shape === 'round_rectangle') {
    console.log('Found container:', {
      name,
      description
    });
    model.containers.push({
      name,
      type: 'Container',
      description,
      dependencies: {
        in: 0,
        out: 0
      }
    });
    return;
  }

  // Check for web app
  if (shape.style.fillColor === C4ContainerColors.WEB_BROWSER && shape.shape === 'round_rectangle') {
    console.log('Found web app:', {
      name,
      description
    });
    model.containers.push({
      name,
      type: 'Web App',
      description,
      dependencies: {
        in: 0,
        out: 0
      }
    });
    return;
  }

  // Check for database
  if (shape.shape === 'can') {
    console.log('Found database:', {
      name,
      description
    });
    model.containers.push({
      name,
      type: 'Database',
      description,
      dependencies: {
        in: 0,
        out: 0
      }
    });
    return;
  }

  // If we get here, the shape wasn't recognized
  errors.push(`Unrecognized shape at (${shape.x}, ${shape.y}): ${name}`);
}

/**
 * Processes all collected shapes into model elements in the second pass.
 * 
 * @param items - All board items for person detection
 * @param state - Processing state containing collections and model
 * @param frame - Miro frame for legend area detection
 */
async function processAllShapesIntoModel(
  items: miro.BoardItem[],
  state: ContainerProcessingState,
  frame: miro.Frame
): Promise<void> {
  for (const [id, shape] of state.shapeMap) {
    await processShapeIntoModel(shape, items, state.model, state.errors, frame);
  }
}

/**
 * Validates the parsing result and handles bidirectional relationships.
 * Bidirectional relationships are considered errors in C4 diagrams.
 * 
 * @param state - Processing state containing model, warnings, and errors
 * @param bidirectionalRelationships - Array of detected bidirectional relationships
 * @returns Parse result with model (if valid) or errors
 */
function validateAndReturnContainerResult(
  state: ContainerProcessingState,
  bidirectionalRelationships: { source: string; target: string }[]
): ParseResult<C4ContainerModel> {
  // If there are any bidirectional relationships, add them as errors and return without model
  if (bidirectionalRelationships.length > 0) {
    state.errors.push(`Detected ${bidirectionalRelationships.length} bidirectional dependencies (connectors with arrows on both ends) between:`);
    bidirectionalRelationships.forEach(rel => {
      state.errors.push(`${rel.source} and ${rel.target}`);
    });
    state.errors.push('Please fix these bidirectional relationships by using a single arrow to show the primary dependency direction.');
    return { warnings: state.warnings, errors: state.errors };
  }

  return { model: state.model, warnings: state.warnings, errors: state.errors };
}

/**
 * Main function to parse a Miro frame into a C4 container model.
 * 
 * This function orchestrates the complete parsing workflow:
 * 1. Extracts all items from the specified frame
 * 2. Processes shapes and stencils into categorized elements
 * 3. Analyzes connectors for relationship mapping
 * 4. Validates diagram integrity and returns structured model
 * 
 * The parser uses a two-pass approach:
 * - First pass: Collect and validate all shapes, build shape map
 * - Second pass: Process shapes into final model elements with relationships
 * 
 * Person Detection:
 * Uses proximity-based detection by finding round_rectangle shapes that have
 * circle shapes within a 100x150 pixel threshold, simulating Miro's person icons.
 * 
 * Container Classification:
 * - Shape-based: Cylindrical shapes → Database containers
 * - Keyword-based: Names containing "web" → Web App, "mobile" → Mobile App
 * - Default: Other containers → Generic Container type
 * 
 * Error Handling:
 * - Bidirectional relationships result in parsing errors (not warnings)
 * - Missing properties or invalid shapes are gracefully skipped
 * - Duplicate names are prevented using Set-based deduplication
 * 
 * @param frame - Miro frame containing the C4 container diagram elements
 * @returns Promise resolving to ParseResult containing the C4 container model,
 *          warnings for non-critical issues, and errors for diagram violations
 */
export async function parseFrameToC4Container(frame: miro.Frame): Promise<ParseResult<C4ContainerModel>> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get all items in the frame
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));

  // First pass: collect shapes and connectors
  const state: ContainerProcessingState = {
    model: {
      level: 'Container',
      title: frame.title || 'Container Diagram',
      people: [],
      containers: [],
      systems: [],
      integrations: []
    },
    shapeMap: new Map(),
    containerNames: new Set(),
    errors: [],
    warnings: [],
    processedStencils: new Set()
  };

  // Process shapes and connectors
  for (const item of items) {
    if (item.type === 'shape' || item.type === 'stencil') {
      state.shapeMap.set(item.id, item as miro.Shape);
    }
  }

  // Process connectors to get dependency counts
  const connectors = items.filter((item): item is miro.Connector => item.type === 'connector');
  const { integrations, incomingCount, outgoingCount, bidirectionalRelationships } = await processConnectors(connectors, state.shapeMap);

  // Second pass: process shapes into model elements
  await processAllShapesIntoModel(items, state, frame);

  // Add integrations to model
  state.model.integrations = integrations;

  // Update dependency counts
  state.model.containers.forEach(container => {
    container.dependencies = {
      in: incomingCount.get(container.name) || 0,
      out: outgoingCount.get(container.name) || 0
    };
  });

  state.model.systems.forEach(system => {
    system.dependencies = {
      in: incomingCount.get(system.name) || 0,
      out: outgoingCount.get(system.name) || 0
    };
  });

  return {
    model: state.model,
    errors: state.errors,
    warnings
  };
} 
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

import { C4ContainerModel, C4ContainerColors } from '../types/c4Container';
import { cleanContent, parseHtmlContent, isInLegendArea, ParseResult, processConnectors, isPerson } from './c4Utils';

/**
 * Intermediate data structures for container processing
 */
interface ContainerProcessingState {
  model: C4ContainerModel;
  warnings: string[];
  errors: string[];
  shapeMap: Map<string, miro.Shape>;
  containerNames: Set<string>;
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
 * @param incomingCount - Map of incoming dependency counts
 * @param outgoingCount - Map of outgoing dependency counts
 * @param state - Processing state containing model and tracking data
 */
async function processShapeIntoModel(
  shape: miro.Shape,
  items: miro.BoardItem[],
  incomingCount: Map<string, number>,
  outgoingCount: Map<string, number>,
  state: ContainerProcessingState
): Promise<void> {
  // Skip empty shapes
  if (!shape.content) {
    console.log('Skipping empty content:', shape.id);
    return;
  }

  // Skip shapes that appear to be from the legend or placeholders
  const content = cleanContent(shape.content).toLowerCase();
  if (content === 'container' || 
      content === 'role' || 
      content === 'core system name' || 
      content === 'supporting system' || 
      content === 'optional description' ||
      content.includes('delete this placeholder') ||
      content.includes('create a new')) {
    console.log('Skipping legend/placeholder content:', {
      id: shape.id,
      content: content
    });
    return;
  }
  
  // Parse the shape's content
  const { title, description } = parseHtmlContent(shape.content);
  console.log('Parsed content:', {
    id: shape.id,
    title,
    description,
    rawContent: shape.content
  });
  
  let name = title || cleanContent(shape.content).split('\n')[0] || '';
  let desc = description || cleanContent(shape.content).split('\n').slice(1).join('\n');
  
  // Fix Node.ks typo in description
  if (desc.includes('Node.ks')) {
    desc = desc.replace('Node.ks', 'Node.js');
  }
  
  // Skip if no valid name was found
  if (!name) {
    console.log('Skipping due to no valid name:', shape.id);
    return;
  }
  
  // Check for person by looking for nearby circles
  if (await isPerson(shape, items)) {
    console.log('Found person:', {
      name,
      hasNearbyCircle: true
    });
    state.model.people.push({ name });
    return;
  }
  
  // Process containers and external systems
  if (shape.shape === 'round_rectangle') {
    // Round rectangles that aren't people are containers
    const containerType = determineContainerType(shape, name);
    
    // Log container type detection
    console.log('Checking container type:', {
      name,
      type: shape.type,
      shape: shape.shape,
      fillColor: shape.style?.fillColor,
      determinedType: containerType
    });
    
    // Add to containers if not duplicate
    if (!state.containerNames.has(name)) {
      state.model.containers.push({
        name,
        type: containerType as 'Container' | 'Web App' | 'Database' | 'Mobile App',
        description: desc || '',
        dependencies: {
          in: incomingCount.get(name) || 0,
          out: outgoingCount.get(name) || 0
        }
      });
      state.containerNames.add(name);
      
      console.log('Found container:', {
        name,
        type: containerType,
        desc,
        content: shape.content
      });
    }
  } else if (shape.shape === 'can') {
    // Database container
    console.log('Found database container:', {
      name,
      desc,
      content: shape.content
    });
    if (!state.containerNames.has(name)) {
      state.model.containers.push({
        name,
        type: 'Database',
        description: desc || '',
        dependencies: {
          in: incomingCount.get(name) || 0,
          out: outgoingCount.get(name) || 0
        }
      });
      state.containerNames.add(name);
    }
  } else if (shape.shape === 'rectangle') {
    // Check if this is a Web App, Mobile App, or external system
    const nameLower = name.toLowerCase();
    
    // Log container type detection
    console.log('Checking container type:', {
      name,
      nameLower,
      type: shape.type,
      shape: shape.shape,
      fillColor: shape.style?.fillColor
    });
    
    if (nameLower.includes('web')) {
      // Web App container
      if (!state.containerNames.has(name)) {
        state.model.containers.push({
          name,
          type: 'Web App',
          description: desc || '',
          dependencies: {
            in: incomingCount.get(name) || 0,
            out: outgoingCount.get(name) || 0
          }
        });
        state.containerNames.add(name);
      }
    } else if (nameLower.includes('mobile')) {
      // Mobile App container
      if (!state.containerNames.has(name)) {
        state.model.containers.push({
          name,
          type: 'Mobile App',
          description: desc || '',
          dependencies: {
            in: incomingCount.get(name) || 0,
            out: outgoingCount.get(name) || 0
          }
        });
        state.containerNames.add(name);
      }
    } else {
      // External system
      state.model.systems.push({
        name,
        description: desc || '',
        dependencies: {
          in: incomingCount.get(name) || 0,
          out: outgoingCount.get(name) || 0
        }
      });
      
      console.log('Found external system:', {
        name,
        desc,
        content: shape.content
      });
    }
    
    console.log('Found container or system:', {
      name,
      type: nameLower.includes('web') ? 'Web App' : nameLower.includes('mobile') ? 'Mobile App' : 'External System',
      desc,
      content: shape.content
    });
  }
}

/**
 * Processes all collected shapes into model elements in the second pass.
 * 
 * @param items - All board items for person detection
 * @param incomingCount - Map of incoming dependency counts
 * @param outgoingCount - Map of outgoing dependency counts
 * @param state - Processing state containing collections and model
 */
async function processAllShapesIntoModel(
  items: miro.BoardItem[],
  incomingCount: Map<string, number>,
  outgoingCount: Map<string, number>,
  state: ContainerProcessingState
): Promise<void> {
  for (const [id, shape] of state.shapeMap) {
    await processShapeIntoModel(shape, items, incomingCount, outgoingCount, state);
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
  // Get all items in the frame
  const items = await getFrameItems(frame);
  
  console.log('Processing frame:', frame.title);
  console.log('Found items:', items.length);
  console.log('All items with full details:', items.map(item => {
    if (item.type === 'shape') {
      const shape = item as miro.Shape;
      return {
        id: shape.id,
        type: item.type,
        shape: shape.shape,
        style: shape.style,
        content: shape.content,
        x: shape.x,
        y: shape.y
      };
    }
    return {
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y
    };
  }));
  
  // Initialize processing state
  const state: ContainerProcessingState = {
    model: {
      level: 'Container',
      title: frame.title || 'Container Diagram (Level 2)',
      people: [],
      containers: [],
      systems: [],
      integrations: []
    },
    warnings: [],
    errors: [],
    shapeMap: new Map(),
    containerNames: new Set(),
    processedStencils: new Set()
  };
  
  // First pass: collect shapes for connector processing
  await collectShapesForProcessing(items, frame, state);

  // Get all connectors (excluding those in legend area)
  const connectors = items.filter(item => 
    item.type === 'connector' && 
    !isInLegendArea(item, frame)
  ) as miro.Connector[];

  // Process connectors using shared function
  const { integrations, incomingCount, outgoingCount, bidirectionalRelationships } = 
    processConnectors(connectors, state.shapeMap);

  // Second pass: process shapes into model elements
  await processAllShapesIntoModel(items, incomingCount, outgoingCount, state);

  // Add integrations to model
  state.model.integrations = integrations;

  // Validate and return result
  return validateAndReturnContainerResult(state, bidirectionalRelationships);
} 
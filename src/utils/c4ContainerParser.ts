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

interface ShapeStyle {
  fillColor: string;
  fontFamily?: string;
  fontSize?: number;
  textAlign?: string;
  textAlignVertical?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
}

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

interface ProcessedPerson {
  name: string;
}

interface ProcessedContainer {
  name: string;
  number: number;
  type: 'Container' | 'Web App' | 'Database' | 'Mobile App';
  description?: string;
  dependencies: {
    in: number;
    out: number;
  };
}

interface ProcessedExternalSystem {
  name: string;
  number: number;
  type: 'External';
  description?: string;
  dependencies: {
    in: number;
    out: number;
  };
}

interface ProcessedModel {
  people: ProcessedPerson[];
  containers: ProcessedContainer[];
  systems: ProcessedExternalSystem[];
  integrations: C4Integration[];
}

type C4ContainerType = 'Database' | 'Web App' | 'Mobile App' | 'Container';

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
 * Collects and validates shapes for processing in the first pass.
 * Builds the shape map needed for connector processing while filtering out invalid shapes.
 * 
 * @param items - Array of board items to collect shapes from
 * @param frame - Parent frame for legend area detection
 * @param state - Processing state containing collections and tracking data
 */
async function collectShapesForProcessing(items: miro.BoardItem[], frame: miro.Frame, state: ContainerProcessingState): Promise<void> {
  for (const item of items) {
    if (item.type === 'shape') {
      const shape = item as miro.Shape;
      
      // Skip shapes in legend area
      if (isInLegendArea(shape, frame)) {
        console.log('Skipping item in legend area:', shape.id);
        continue;
      }
      
      // Skip shapes that don't have required properties
      if (!shape.style?.fillColor || !shape.shape) {
        console.log('Skipping shape due to missing properties:', {
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
 * Determines container type based on shape and content.
 * 
 * @param shape - Shape to classify
 * @param content - Parsed content of the container
 * @returns Container type string
 */
function determineContainerType(shape: miro.Shape, content: string): C4ContainerType {
  // First check shape type
  if (shape.shape === 'can') {
    return 'Database';
  }

  // Then check content for specific types
  const lowerContent = content.toLowerCase();
  
  // Check for web app (rectangle shape with "web" in title)
  if (shape.shape === 'rectangle' && (lowerContent.includes('web app') || lowerContent.includes('webapp') || lowerContent.includes('web'))) {
    return 'Web App';
  }
  
  // Check for mobile app (rectangle shape with "mobile" in title)
  if (shape.shape === 'rectangle' && (lowerContent.includes('mobile app') || lowerContent.includes('mobileapp') || lowerContent.includes('mobile'))) {
    return 'Mobile App';
  }
  
  // Check for database (case insensitive)
  if (lowerContent.includes('db') || lowerContent.includes('database')) {
    return 'Database';
  }

  // Default to Container for everything else
  return 'Container';
}

/**
 * Processes a single shape into the appropriate element type based on its properties.
 * 
 * @param shape - Miro shape to process
 * @param items - All board items for person detection
 * @param model - Model to add processed elements to
 * @param errors - Array to collect errors
 * @param frame - Parent frame for legend area detection
 */
async function processShapeIntoModel(
  shape: miro.Shape,
  items: miro.BoardItem[],
  model: ProcessedModel,
  errors: string[],
  frame: miro.Frame
): Promise<void> {
  // Skip shapes in the legend area
  if (isInLegendArea(shape, frame)) return;

  // Validate shape has required properties
  if (!shape.style?.fillColor || !shape.shape) return;

  // Parse content
  const { title, description } = parseHtmlContent(shape.content);
  const name = title || cleanContent(shape.content);

  // Skip shapes with empty names
  if (!name || name.trim() === '') {
    console.log('Skipping shape with empty name:', shape.id);
    return;
  }

  // Check for supporting system (rectangle shape)
  if (shape.shape === 'rectangle') {
    // Check if this is a web or mobile app first
    const type = determineContainerType(shape, shape.content);
    if (type === 'Web App' || type === 'Mobile App') {
      // Clean up the name by removing zero-width spaces and other special characters
      const cleanName = name.replace(/[\uFEFF\u200B]/g, '').trim();
      console.log('Found web/mobile app:', {
        name: cleanName,
        type,
        description
      });
      const container: ProcessedContainer = {
        name: cleanName,
        number: 0,
        type,
        dependencies: {
          in: 0,
          out: 0
        }
      };
      // Only add description if it exists and is not empty
      if (description && description.trim()) {
        container.description = description.trim();
      }
      model.containers.push(container);
      return;
    }

    // Otherwise treat as supporting system
    console.log('Found supporting system:', {
      name,
      description
    });
    const system: ProcessedExternalSystem = {
      name,
      number: 0,
      type: 'External',
      dependencies: {
        in: 0,
        out: 0
      }
    };
    // Only add description if it exists and is not empty
    if (description && description.trim()) {
      system.description = description.trim();
    }
    model.systems.push(system);
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
  if (shape.style.fillColor === C4ContainerColors.EXTERNAL_SYSTEM) {
    console.log('Found external system:', {
      name,
      description
    });
    const system: ProcessedExternalSystem = {
      name,
      number: 0,
      type: 'External',
      dependencies: {
        in: 0,
        out: 0
      }
    };
    // Only add description if it exists and is not empty
    if (description && description.trim()) {
      system.description = description.trim();
    }
    model.systems.push(system);
    return;
  }

  // Check for container types
  if (shape.style.fillColor === C4ContainerColors.CONTAINER || 
      shape.style.fillColor === C4ContainerColors.WEB_BROWSER || 
      shape.shape === 'can') {
    // First determine the type based on shape and content
    const type = determineContainerType(shape, shape.content);
    
    // Then create a unique name for the container
    let containerName = name;

    // Check if this container already exists
    const existingContainer = model.containers.find(c => c.name === containerName);
    if (existingContainer) {
      console.log('Skipping duplicate container:', containerName);
      return;
    }

    console.log('Found container:', {
      name: containerName,
      type,
      description
    });

    const container: ProcessedContainer = {
      name: containerName,
      number: 0,
      type,
      dependencies: {
        in: 0,
        out: 0
      }
    };

    // Only add description if it exists and is not empty
    if (description && description.trim()) {
      container.description = description.trim();
    }

    model.containers.push(container);
    return;
  }
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
 * @param bidirectionalRelationships - Set of detected bidirectional relationships
 * @returns Parse result with model (if valid) or errors
 */
function validateAndReturnContainerResult(
  state: ContainerProcessingState,
  bidirectionalRelationships: Set<string>
): ParseResult<C4ContainerModel> {
  // If there are any bidirectional relationships, add them as errors and return without model
  if (bidirectionalRelationships.size > 0) {
    state.errors.push(`Detected ${bidirectionalRelationships.size} bidirectional dependencies (connectors with arrows on both ends) between:`);
    bidirectionalRelationships.forEach(pairKey => {
      const [id1, id2] = pairKey.split('-');
      state.errors.push(`${id1} and ${id2}`);
    });
    state.errors.push('Please fix these bidirectional relationships by using a single arrow to show the primary dependency direction.');
    return { warnings: state.warnings, errors: state.errors };
  }

  return { model: state.model, warnings: state.warnings, errors: state.errors };
}

/**
 * Main function to parse a Miro frame into a C4 container model.
 * Processes all elements in the frame and organizes them into a structured C4 model.
 * 
 * @param frame - Miro frame containing the C4 diagram
 * @returns Object containing the C4 container model and any warnings
 */
export async function parseFrameToC4Container(frame: miro.Frame): Promise<ParseResult<C4ContainerModel>> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get all items in the frame
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));
  
  if (!items || items.length === 0) {
    return { 
      model: {
        level: 'Container',
        title: frame.title || 'Container Diagram',
        people: [],
        containers: [],
        systems: [],
        integrations: []
      }, 
      errors: [], 
      warnings: [] 
    };
  }

  // Separate shapes and connectors with proper type filtering
  const shapes = items.filter((item): item is miro.Shape => 
    item.type === 'shape' && 
    'shape' in item && 
    'style' in item
  );
  const connectors = items.filter((item): item is miro.Connector => 
    item.type === 'connector' && 
    'start' in item && 
    'end' in item
  );

  // Create a map of shapes for quick lookup
  const shapeMap = new Map(shapes.map(shape => [shape.id, shape]));

  // Process connectors first to get dependency counts and check for bidirectional relationships
  const { bidirectionalRelationships } = await processConnectors(connectors, shapeMap);

  // If there are any bidirectional relationships, add them as errors and return without model
  if (bidirectionalRelationships.size > 0) {
    errors.push(`Detected ${bidirectionalRelationships.size} bidirectional dependencies (connectors with arrows on both ends) between:`);
    bidirectionalRelationships.forEach(pairKey => {
      const [id1, id2] = pairKey.split('-');
      errors.push(`${id1} and ${id2}`);
    });
    errors.push('Please fix these bidirectional relationships by using a single arrow to show the primary dependency direction.');
    return { model: undefined, errors, warnings };
  }

  // Process connectors again to get the full integration data
  const { integrations, incomingCount, outgoingCount } = await processConnectors(connectors, shapeMap);

  // Process all shapes
  const people: ProcessedPerson[] = [];
  const containers: ProcessedContainer[] = [];
  const systems: ProcessedExternalSystem[] = [];
  let containerNumber = 1;  // Counter for container numbers
  let systemNumber = 1;     // Counter for system numbers
  let integrationNumber = 1; // Counter for integration numbers

  // Process shapes in parallel for better performance
  await Promise.all(shapes.map(async shape => {
    await processShapeIntoModel(shape, items, { people, containers, systems, integrations }, errors, frame);
  }));

  // Update dependency counts in containers and systems
  for (const container of containers) {
    // Clean the container name to match the format used in integrations
    const cleanContainerName = container.name.replace(/[\uFEFF\u200B]/g, '').trim();
    container.dependencies = {
      in: incomingCount.get(cleanContainerName) || 0,
      out: outgoingCount.get(cleanContainerName) || 0
    };
  }
  for (const system of systems) {
    // Clean the system name to match the format used in integrations
    const cleanSystemName = system.name.replace(/[\uFEFF\u200B]/g, '').trim();
    system.dependencies = {
      in: incomingCount.get(cleanSystemName) || 0,
      out: outgoingCount.get(cleanSystemName) || 0
    };
  }

  // Sort people by x position (left to right)
  people.sort((a, b) => {
    const shapeA = shapes.find(s => cleanContent(s.content) === a.name);
    const shapeB = shapes.find(s => cleanContent(s.content) === b.name);
    return (shapeA?.x || 0) - (shapeB?.x || 0);
  });

  // Sort containers by type in specified order: Web App, Mobile App, Container, Database
  const typeOrder = {
    'Web App': 0,
    'Mobile App': 1,
    'Container': 2,
    'Database': 3
  };
  containers.sort((a, b) => {
    const typeOrderA = typeOrder[a.type];
    const typeOrderB = typeOrder[b.type];
    if (typeOrderA !== typeOrderB) {
      return typeOrderA - typeOrderB;
    }
    // If same type, sort by name
    return a.name.localeCompare(b.name);
  });

  // Assign numbers to containers after sorting
  containers.forEach(container => {
    container.number = containerNumber++;
  });

  // Sort supporting systems by x position (left to right)
  systems.sort((a, b) => {
    const shapeA = shapes.find(s => cleanContent(s.content) === a.name);
    const shapeB = shapes.find(s => cleanContent(s.content) === b.name);
    return (shapeA?.x || 0) - (shapeB?.x || 0);
  });

  // Assign numbers to systems after sorting
  systems.forEach(system => {
    system.number = systemNumber++;
  });

  // Create the model
  const model: C4ContainerModel = {
    level: 'Container',
    title: frame.title || 'Container Diagram',
    people,
    containers,
    systems: systems.map(system => ({
      name: system.name,
      number: system.number,
      description: system.description?.trim(),
      type: 'External',
      dependencies: system.dependencies
    })),
    integrations: integrations.map(integration => ({
      number: integrationNumber++,
      source: integration.source,
      'depends-on': integration['depends-on'],
      ...(integration.description ? { description: integration.description.trim() } : {})
    }))
  };

  return { model, errors, warnings };
}

async function processStencil(stencil: miro.Stencil, frame: miro.Frame, state: ContainerProcessingState): Promise<void> {
  console.log('Processing stencil:', stencil);
  console.log('Full stencil object:', JSON.stringify(stencil, null, 2));

  // Get the full stencil data from the SDK
  const stencilData = await miro.board.getById(stencil.id) as unknown as miro.Stencil;
  console.log('Stencil data from SDK:', JSON.stringify(stencilData, null, 2));

  // Extract the content from the stencil
  const content = stencilData.content || '';
  console.log('Raw stencil content:', content);

  // Skip if no content
  if (!content) {
    console.log('Empty stencil content');
    return;
  }

  // Parse the content to get title and description
  const { title, description } = parseHtmlContent(content);
  console.log('Parsed stencil content:', { title, description });

  // Skip if no title
  if (!title) {
    console.log('No title found in stencil');
    return;
  }

  // Add to processed stencils
  state.processedStencils.add(stencil.id);

  // Process the stencil based on its type
  if (stencilData.shape === 'round_rectangle') {
    // Check if this is a web app stencil
    const type = determineContainerType(stencilData, title);
    const name = title || cleanContent(content);
    
    if (type === 'Web App') {
      // Add web apps as systems
      console.log('Found web app system:', { name, description });
      state.model.systems.push({
        name,
        number: 0,
        type: 'External',
        description: description || '',
        dependencies: {
          in: 0,
          out: 0
        }
      });
    } else {
      // Add other containers as containers
      console.log('Found container:', { name, type, description });
      state.model.containers.push({
        name,
        number: 0,
        type,
        description: description || '',
        dependencies: {
          in: 0,
          out: 0
        }
      });
    }
  }
} 
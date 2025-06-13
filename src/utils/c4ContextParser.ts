/**
 * C4 Context Model Parser
 * 
 * This module is responsible for parsing Miro frames containing C4 Context diagrams and converting them
 * into a structured YAML format. It identifies different C4 elements (people, systems, integrations)
 * based on their visual properties in Miro (shape, color, position) and maintains their relationships.
 * 
 * Key responsibilities:
 * - Parsing Miro shapes into C4 model elements
 * - Maintaining spatial relationships and ordering
 * - Processing connections between elements
 * - Handling text content and descriptions
 */

import { C4Colors } from '../types/c4Context';
import { C4ContextModel, C4Person, C4System, C4Integration } from '../types/c4Context';
import { cleanContent, parseHtmlContent, isInLegendArea, processConnectors, ParseResult } from './c4Utils';
export { parseFrameToC4Container } from './c4ContainerParser';

/**
 * Intermediate data structures for processing
 */
interface ProcessedPerson {
  name: string;
}

interface ProcessedCoreSystem {
  name: string;
  description: string;
  dependencies: {
    in: number;
    out: number;
  };
}

interface ProcessedSupportingSystem {
  name: string;
  description: string;
  dependencies: {
    in: number;
    out: number;
  };
}

interface ProcessedElements {
  people: ProcessedPerson[];
  coreSystems: ProcessedCoreSystem[];
  supportingSystems: ProcessedSupportingSystem[];
  shapeMap: Map<string, miro.Shape>;
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
 * Processes a single shape into the appropriate element type based on color and shape properties.
 * This function serves as the main classifier that determines whether a shape represents
 * a person, core system, or supporting system based on C4 visual conventions.
 * 
 * @param shape - Miro shape to process
 * @param frame - Parent frame for legend area detection
 * @param elements - Collection to add processed elements to
 * @param items - All board items for person detection
 */
async function processShape(
  shape: miro.Shape, 
  frame: miro.Frame,
  elements: ProcessedElements,
  items: miro.BoardItem[]
): Promise<void> {
  // Skip shapes in the legend area
  if (isInLegendArea(shape, frame)) return;

  // Validate shape has required properties
  if (!shape.style?.fillColor || !shape.shape) return;

  // Add to shape map for connector processing later
  elements.shapeMap.set(shape.id, shape);
  
  // Check if it's a person first
  if (await isPerson(shape, items)) {
    processPerson(shape, elements);
    return;
  }
  
  // Then check other types
  if (shape.style.fillColor === C4Colors.CORE_SYSTEM && shape.shape === 'round_rectangle') {
    processCoreSystem(shape, elements);
  } else if (shape.style.fillColor === C4Colors.SUPPORTING_SYSTEM && shape.shape === 'rectangle') {
    processSupportingSystem(shape, elements);
  }
}

/**
 * Processes a person shape and extracts the person's name.
 * Persons are represented by round rectangles with person color.
 * 
 * @param shape - Miro shape representing a person
 * @param elements - Collection to add the processed person to
 */
function processPerson(shape: miro.Shape, elements: ProcessedElements): void {
  const { title } = parseHtmlContent(shape.content);
  const name = title || cleanContent(shape.content);
  elements.people.push({ name });
}

/**
 * Processes a core system shape and extracts the system name.
 * Core systems are the main focus of the C4 context diagram and are
 * represented by round rectangles with core system color.
 * 
 * @param shape - Miro shape representing a core system
 * @param elements - Collection to add the processed core system to
 */
function processCoreSystem(shape: miro.Shape, elements: ProcessedElements): void {
  const { title, description } = parseHtmlContent(shape.content);
  const name = title || cleanContent(shape.content).split('\n')[0] || 'Unnamed System';
  elements.coreSystems.push({
    name,
    description: '',
    dependencies: {
      in: 0,
      out: 0
    }
  });
}

/**
 * Processes a supporting system shape and extracts name and description.
 * Supporting systems are external dependencies represented by rectangles
 * with supporting system color. Their position is preserved for spatial ordering.
 * 
 * @param shape - Miro shape representing a supporting system
 * @param elements - Collection to add the processed supporting system to
 */
function processSupportingSystem(shape: miro.Shape, elements: ProcessedElements): void {
  const { title, description } = parseHtmlContent(shape.content);
  console.log('Processing supporting system:', {
    content: shape.content,
    parsedTitle: title,
    parsedDescription: description
  });
  const name = title || cleanContent(shape.content).split('\n')[0] || 'Unnamed System';
  const desc = description || cleanContent(shape.content).split('\n').slice(1).join('\n') || '';
  elements.supportingSystems.push({
    name,
    description: desc,
    dependencies: {
      in: 0,
      out: 0
    }
  });
}

/**
 * Processes all shapes in the frame into categorized elements.
 * Iterates through all board items and delegates shape processing to appropriate handlers.
 * 
 * @param items - Array of board items to process
 * @param frame - Parent frame for context
 * @returns Categorized elements with shape map for connector processing
 */
async function processAllShapes(items: miro.BoardItem[], frame: miro.Frame): Promise<ProcessedElements> {
  const elements: ProcessedElements = {
    people: [],
    coreSystems: [],
    supportingSystems: [],
    shapeMap: new Map()
  };

  for (const item of items) {
    if (item.type === 'shape') {
      const shape = item as miro.Shape;
      await processShape(shape, frame, elements, items);
    }
  }

  return elements;
}

/**
 * Builds the final systems array with dependency counts.
 * Combines core systems and external systems in the proper order,
 * with core systems appearing first in the final model.
 * 
 * @param elements - Processed elements containing core and supporting systems
 * @param incomingCount - Map of incoming dependency counts by element name
 * @param outgoingCount - Map of outgoing dependency counts by element name
 * @returns Array of C4 systems with dependency information
 */
function buildSystemsArray(
  elements: ProcessedElements,
  incomingCount: Map<string, number>,
  outgoingCount: Map<string, number>
): C4System[] {
  let systemNumber = 1;  // Counter for system numbers

  const coreSystems = elements.coreSystems.map(s => ({
    name: s.name,
    number: systemNumber++,
    type: 'Core' as const,
    dependencies: {
      in: incomingCount.get(s.name) || 0,
      out: outgoingCount.get(s.name) || 0
    }
  }));

  const externalSystems = elements.supportingSystems
    .sort((a, b) => {
      const shapeA = elements.shapeMap.get(a.name);
      const shapeB = elements.shapeMap.get(b.name);
      return (shapeA?.x || 0) - (shapeB?.x || 0);
    })
    .map(s => ({
      name: s.name,
      number: systemNumber++,
      type: 'External' as const,
      description: s.description,
      dependencies: {
        in: incomingCount.get(s.name) || 0,
        out: outgoingCount.get(s.name) || 0
      }
    }));

  return [...coreSystems, ...externalSystems];
}

/**
 * Validates the parsing result and handles bidirectional relationships.
 * Bidirectional relationships are considered errors in C4 diagrams as they
 * indicate unclear dependency direction.
 * 
 * @param model - Parsed C4 context model
 * @param warnings - Array of warning messages
 * @param errors - Array of error messages
 * @param bidirectionalRelationships - Set of detected bidirectional relationships
 * @returns Parse result with model (if valid) or errors
 */
function validateAndReturnResult(
  model: C4ContextModel,
  warnings: string[],
  errors: string[],
  bidirectionalRelationships: Set<string>
): ParseResult<C4ContextModel> {
  // If there are any bidirectional relationships, add them as errors and return without model
  if (bidirectionalRelationships.size > 0) {
    errors.push(`Detected ${bidirectionalRelationships.size} bidirectional dependencies (connectors with arrows on both ends) between:`);
    bidirectionalRelationships.forEach(pairKey => {
      const [id1, id2] = pairKey.split('-');
      errors.push(`${id1} and ${id2}`);
    });
    errors.push('Please fix these bidirectional relationships by using a single arrow to show the primary dependency direction.');
    return { warnings, errors };
  }

  console.log('Final warnings:', warnings);
  console.log('Final errors:', errors);
  return { model, warnings, errors };
}

/**
 * Main function to parse a Miro frame into a C4 context model.
 * Processes all elements in the frame and organizes them into a structured C4 model.
 * 
 * Key features:
 * - Maintains left-to-right ordering for people and supporting systems
 * - Places core systems first in the systems list
 * - Processes connections between elements as integrations
 * - Returns both the model and any warnings generated during parsing
 * 
 * @param frame - Miro frame containing the C4 diagram
 * @returns Object containing the C4 context model and any warnings
 */
export async function parseFrameToC4Context(frame: miro.Frame): Promise<ParseResult<C4ContextModel>> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get all items in the frame
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));
  
  if (!items || items.length === 0) {
    return { 
      model: {
        level: 'Context',
        title: frame.title || 'Context Diagram',
        people: [],
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
  const coreSystems: ProcessedCoreSystem[] = [];
  const supportingSystems: ProcessedSupportingSystem[] = [];

  // Process shapes in parallel for better performance
  await Promise.all(shapes.map(async shape => {
    // Check for person first
    const isPersonShape = await isPerson(shape, items);
    if (isPersonShape) {
      const { title } = parseHtmlContent(shape.content);
      const name = title || cleanContent(shape.content);
      people.push({ name });
      return;
    }

    // Check for core system
    if (isCoreSystem(shape)) {
      const { title, description } = parseHtmlContent(shape.content);
      const name = title || cleanContent(shape.content);
      coreSystems.push({
        name,
        description: description || '',
        dependencies: {
          in: incomingCount.get(name) || 0,
          out: outgoingCount.get(name) || 0
        }
      });
      return;
    }

    // Check for supporting system
    if (isSupportingSystem(shape)) {
      const { title, description } = parseHtmlContent(shape.content);
      const name = title || cleanContent(shape.content);
      supportingSystems.push({
        name,
        description: description || '',
        dependencies: {
          in: incomingCount.get(name) || 0,
          out: outgoingCount.get(name) || 0
        }
      });
    }
  }));

  // Sort people by x position (left to right)
  people.sort((a, b) => {
    const shapeA = shapes.find(s => cleanContent(s.content) === a.name);
    const shapeB = shapes.find(s => cleanContent(s.content) === b.name);
    return (shapeA?.x || 0) - (shapeB?.x || 0);
  });

  // Sort supporting systems by x position (left to right)
  const sortedSupportingSystems = [...supportingSystems].sort((a, b) => {
    const shapeA = shapes.find(s => cleanContent(s.content) === a.name);
    const shapeB = shapes.find(s => cleanContent(s.content) === b.name);
    return (shapeA?.x || 0) - (shapeB?.x || 0);
  });

  // Create the model
  const model: C4ContextModel = {
    level: 'Context',
    title: frame.title || 'Context Diagram',
    people,
    systems: [
      ...coreSystems.map((s, index) => ({
        name: s.name,
        number: index + 1,
        type: 'Core' as const,
        ...(s.description && s.description.trim() ? { description: s.description.trim() } : {}),
        dependencies: s.dependencies
      })),
      ...sortedSupportingSystems.map((s, index) => ({
        name: s.name,
        number: coreSystems.length + index + 1,
        type: 'External' as const,
        ...(s.description && s.description.trim() ? { description: s.description.trim() } : {}),
        dependencies: s.dependencies
      }))
    ],
    integrations
  };

  return { model, errors, warnings };
}

function isCoreSystem(shape: miro.Shape): boolean {
  return shape.shape === 'round_rectangle' && 
         shape.style?.fillColor === C4Colors.CORE_SYSTEM;
}

function isSupportingSystem(shape: miro.Shape): boolean {
  return shape.shape === 'rectangle';
}

/**
 * Determines if a shape represents a person based on proximity to circles.
 * Used by both Context and Container parsers to ensure consistent handling.
 */
export async function isPerson(shape: miro.Shape, items: miro.BoardItem[]): Promise<boolean> {
  // Early return if not a round rectangle
  if (shape.shape !== 'round_rectangle') return false;

  // Early return if no items to check
  if (!items.length) return false;

  // Find the closest circle within threshold
  const thresholdX = 100;
  const thresholdY = 150;
  
  // Filter for circles first to reduce iterations
  const circles = items.filter((item): item is miro.Shape => 
    item.type === 'shape' && 
    'shape' in item && 
    item.shape === 'circle'
  );
  if (!circles.length) return false;

  // Check if any circle is within threshold
  return circles.some(circle => 
    Math.abs(circle.x - shape.x) < thresholdX && 
    Math.abs(circle.y - shape.y) < thresholdY
  );
} 
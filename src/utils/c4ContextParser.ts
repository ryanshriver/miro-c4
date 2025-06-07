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

import { C4ContextModel, C4Colors, C4System } from '../types/c4Context';
import { cleanContent, parseHtmlContent, isInLegendArea, ParseResult, processConnectors } from './c4Utils';
export { parseFrameToC4Container } from './c4ContainerParser';

/**
 * Intermediate data structures for processing
 */
interface ProcessedPerson {
  name: string;
  x: number;
}

interface ProcessedCoreSystem {
  name: string;
}

interface ProcessedSupportingSystem {
  name: string;
  description: string;
  x: number;
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
 */
function processShape(
  shape: miro.Shape, 
  frame: miro.Frame,
  elements: ProcessedElements
): void {
  // Skip shapes in the legend area
  if (isInLegendArea(shape, frame)) return;

  // Validate shape has required properties
  if (!shape.style?.fillColor || !shape.shape) return;

  // Add to shape map for connector processing later
  elements.shapeMap.set(shape.id, shape);
  
  // Check both shape type and color
  if (shape.style.fillColor === C4Colors.PERSON && shape.shape === 'round_rectangle') {
    processPerson(shape, elements);
  } else if (shape.style.fillColor === C4Colors.CORE_SYSTEM && shape.shape === 'round_rectangle') {
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
  const name = title || cleanContent(shape.content) || 'Unnamed Person';
  elements.people.push({
    name,
    x: shape.x
  });
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
    name
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
    x: shape.x
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
function processAllShapes(items: miro.BoardItem[], frame: miro.Frame): ProcessedElements {
  const elements: ProcessedElements = {
    people: [],
    coreSystems: [],
    supportingSystems: [],
    shapeMap: new Map()
  };

  for (const item of items) {
    if (item.type === 'shape') {
      const shape = item as miro.Shape;
      processShape(shape, frame, elements);
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
  const coreSystems = elements.coreSystems.map(s => ({
    name: s.name,
    type: 'Core' as const,
    dependencies: {
      in: incomingCount.get(s.name) || 0,
      out: outgoingCount.get(s.name) || 0
    }
  }));

  const externalSystems = elements.supportingSystems
    .sort((a, b) => a.x - b.x)
    .map(s => ({
      name: s.name,
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
 * @param bidirectionalRelationships - Array of detected bidirectional relationships
 * @returns Parse result with model (if valid) or errors
 */
function validateAndReturnResult(
  model: C4ContextModel,
  warnings: string[],
  errors: string[],
  bidirectionalRelationships: { source: string; target: string }[]
): ParseResult<C4ContextModel> {
  // If there are any bidirectional relationships, add them as errors and return without model
  if (bidirectionalRelationships.length > 0) {
    errors.push(`Detected ${bidirectionalRelationships.length} bidirectional dependencies (connectors with arrows on both ends) between:`);
    bidirectionalRelationships.forEach(rel => {
      errors.push(`${rel.source} and ${rel.target}`);
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
  // Get all items in the frame
  const items = await getFrameItems(frame);
  
  // Initialize the model
  const model: C4ContextModel = {
    level: 'Context',
    title: frame.title || 'C4 Context Diagram',
    people: [],
    systems: [],
    integrations: []
  };

  // Track warnings and errors
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Process all shapes into categorized elements
  const elements = processAllShapes(items, frame);

  // Sort people by x coordinate (left to right) and add to model
  model.people = elements.people
    .sort((a, b) => a.x - b.x)
    .map(p => ({ name: p.name }));
  
  // Get all connectors (excluding those in legend area)
  const connectors = items.filter(item => 
    item.type === 'connector' && 
    !isInLegendArea(item, frame)
  ) as miro.Connector[];

  // Process connectors using shared function
  const { integrations, incomingCount, outgoingCount, bidirectionalRelationships } = 
    processConnectors(connectors, elements.shapeMap);

  // Build the systems array with dependency counts
  model.systems = buildSystemsArray(elements, incomingCount, outgoingCount);

  // Add integrations to model
  model.integrations = integrations;

  // Validate result and handle any errors
  return validateAndReturnResult(model, warnings, errors, bidirectionalRelationships);
} 
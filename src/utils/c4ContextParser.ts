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

import { C4ContextModel, C4Colors } from '../types/c4Context';
import { cleanContent, parseHtmlContent, isInLegendArea, ParseResult, processConnectors } from './c4Utils';
export { parseFrameToC4Container } from './c4ContainerParser';

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
  // Get all items in the frame using frame's children property
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));
  
  // Initialize the model
  const model = {
    level: 'Context',
    title: frame.title || 'C4 Context Diagram',
    people: [],
    systems: [],
    integrations: []
  } as C4ContextModel;

  // Track warnings and errors
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Arrays to store items before sorting
  const people: { name: string; x: number }[] = [];
  const coreSystems: { name: string }[] = [];
  const supportingSystems: { name: string; description: string; x: number }[] = [];
  
  // Parse shapes into people and systems
  const shapeMap = new Map<string, miro.Shape>();
  
  for (const item of items) {
    if (item.type === 'shape') {
      const shape = item as miro.Shape;
      
      // Skip shapes in the legend area
      if (isInLegendArea(shape, frame)) continue;

      // Validate shape has required properties
      if (!shape.style?.fillColor || !shape.shape) continue;

      // Add to shape map for connector processing later
      shapeMap.set(shape.id, shape);
      
      // Check both shape type and color
      if (shape.style.fillColor === C4Colors.PERSON && shape.shape === 'round_rectangle') {
        const { title } = parseHtmlContent(shape.content);
        const name = title || cleanContent(shape.content) || 'Unnamed Person';
        people.push({
          name,
          x: shape.x
        });
      } else if (shape.style.fillColor === C4Colors.CORE_SYSTEM && shape.shape === 'round_rectangle') {
        const { title, description } = parseHtmlContent(shape.content);
        const name = title || cleanContent(shape.content).split('\n')[0] || 'Unnamed System';
        coreSystems.push({
          name
        });
      } else if (shape.style.fillColor === C4Colors.SUPPORTING_SYSTEM && shape.shape === 'rectangle') {
        const { title, description } = parseHtmlContent(shape.content);
        console.log('Processing supporting system:', {
          content: shape.content,
          parsedTitle: title,
          parsedDescription: description
        });
        const name = title || cleanContent(shape.content).split('\n')[0] || 'Unnamed System';
        const desc = description || cleanContent(shape.content).split('\n').slice(1).join('\n') || '';
        supportingSystems.push({
          name,
          description: desc,
          x: shape.x
        });
      }
    }
  }

  // Sort people and supporting systems by x coordinate (left to right)
  model.people = people.sort((a, b) => a.x - b.x).map(p => ({ name: p.name }));
  
  // Get all connectors (excluding those in legend area)
  const connectors = items.filter(item => 
    item.type === 'connector' && 
    !isInLegendArea(item, frame)
  ) as miro.Connector[];

  // Process connectors using shared function
  const { integrations, incomingCount, outgoingCount, bidirectionalRelationships } = processConnectors(connectors, shapeMap);

  // Add core systems first, then supporting systems sorted left to right
  model.systems = [
    ...coreSystems.map(s => ({
      name: s.name,
      type: 'Core' as const,
      dependencies: {
        in: incomingCount.get(s.name) || 0,
        out: outgoingCount.get(s.name) || 0
      }
    })),
    ...supportingSystems.sort((a, b) => a.x - b.x).map(s => ({
      name: s.name,
      type: 'External' as const,
      description: s.description,
      dependencies: {
        in: incomingCount.get(s.name) || 0,
        out: outgoingCount.get(s.name) || 0
      }
    }))
  ];

  // Add integrations to model
  model.integrations = integrations;

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
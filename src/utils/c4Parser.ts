/**
 * C4 Model Parser Module
 * 
 * This module is responsible for parsing Miro frames containing C4 diagrams and converting them
 * into a structured YAML format. It identifies different C4 elements (people, systems, integrations)
 * based on their visual properties in Miro (shape, color, position) and maintains their relationships.
 * 
 * Key responsibilities:
 * - Parsing Miro shapes into C4 model elements
 * - Maintaining spatial relationships and ordering
 * - Processing connections between elements
 * - Handling text content and descriptions
 */

import { C4ContextModel, C4Colors } from '../types/c4';

/**
 * Cleans HTML content from Miro text elements.
 * Removes HTML tags, decodes entities, and normalizes whitespace.
 * For system names, only the first line is returned.
 * 
 * @param content - Raw HTML content from Miro
 * @returns Cleaned text content
 */
function cleanContent(content: string): string {
  const cleaned = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();                 // Trim extra spaces

  return cleaned.split('\n')[0];
}

/**
 * Extracts description text from multi-line content.
 * Used primarily for supporting systems where description is on subsequent lines.
 * 
 * @param content - Raw HTML content from Miro
 * @returns Description text from lines after the first line
 */
function getDescription(content: string): string {
  const lines = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split('\n');
  
  return lines.length > 1 ? lines.slice(1).join(' ').trim() : '';
}

/**
 * Parses HTML content to extract title and description.
 * Specifically handles Miro's text formatting where:
 * - Title is typically in <strong> tags
 * - Description is in regular <span> tags
 * 
 * @param content - Raw HTML content from Miro
 * @returns Object containing title and description
 */
function parseHtmlContent(content: string): { title: string; description: string } {
  const strongMatch = content.match(/<strong[^>]*>(.*?)<\/strong>/);
  const spanMatch = content.match(/<span[^>]*>(.*?)<\/span>/);
  
  return {
    title: strongMatch ? cleanContent(strongMatch[1]) : '',
    description: spanMatch ? cleanContent(spanMatch[1]) : ''
  };
}

/**
 * Result type for parseFrameToC4Context including both model and errors
 */
interface ParseResult {
  model?: C4ContextModel;
  warnings: string[];
  errors: string[];
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
export async function parseFrameToC4Context(frame: miro.Frame): Promise<ParseResult> {
  // Get all items in the frame
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds?.includes(item.id));
  
  // Initialize the model
  const model = {
    level: 'context',
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
  
  // Track bidirectional relationships
  const bidirectionalRelationships: { source: string; target: string }[] = [];
  
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
        people.push({
          name: cleanContent(shape.content) || 'Unnamed Person',
          x: shape.x
        });
      } else if (shape.style.fillColor === C4Colors.CORE_SYSTEM && shape.shape === 'round_rectangle') {
        coreSystems.push({
          name: cleanContent(shape.content) || 'Unnamed System'
        });
      } else if (shape.style.fillColor === C4Colors.SUPPORTING_SYSTEM && shape.shape === 'rectangle') {
        const { title, description } = parseHtmlContent(shape.content);
        supportingSystems.push({
          name: title || cleanContent(shape.content) || 'Unnamed System',
          description: description || '',
          x: shape.x
        });
      }
    }
  }

  // Sort people and supporting systems by x coordinate (left to right)
  model.people = people.sort((a, b) => a.x - b.x).map(p => ({ name: p.name }));
  
  // Add core systems first, then supporting systems sorted left to right
  model.systems = [
    ...coreSystems.map(s => ({ name: s.name, type: 'Core' as const })),
    ...supportingSystems.sort((a, b) => a.x - b.x).map(s => ({
      name: s.name,
      type: 'External' as const,
      description: s.description
    }))
  ];

  // Parse connectors into integrations
  let integrationNumber = 1;
  const connectors = items.filter(item => 
    item.type === 'connector' && 
    !isInLegendArea(item, frame)
  ) as miro.Connector[];

  console.log('Found connectors:', connectors.map(c => ({
    id: c.id,
    style: c.style,
    startItem: c.start?.item,
    endItem: c.end?.item
  })));

  for (const connector of connectors) {
    if (!connector.start?.item || !connector.end?.item) continue;

    const startShape = shapeMap.get(connector.start.item);
    const endShape = shapeMap.get(connector.end.item);
    
    if (!startShape || !endShape) continue;

    // Check if this connector has arrows on both ends
    // In Miro, arrows can be either 'arrow' or 'rounded_stealth'
    const hasStartArrow = connector.style?.startStrokeCap === 'arrow' || 
                         connector.style?.startStrokeCap === 'rounded_stealth';
    const hasEndArrow = connector.style?.endStrokeCap === 'arrow' || 
                       connector.style?.endStrokeCap === 'rounded_stealth';
    
    console.log('Checking connector styles:', {
      id: connector.id,
      style: connector.style,
      hasStartArrow,
      hasEndArrow,
      startShape: cleanContent(startShape.content),
      endShape: cleanContent(endShape.content)
    });
    
    if (hasStartArrow && hasEndArrow) {
      const startName = startShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM 
        ? parseHtmlContent(startShape.content).title || cleanContent(startShape.content)
        : cleanContent(startShape.content);

      const endName = endShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM
        ? parseHtmlContent(endShape.content).title || cleanContent(endShape.content)
        : cleanContent(endShape.content);

      bidirectionalRelationships.push({
        source: startName,
        target: endName
      });
      continue; // Skip processing this connector as an integration
    }

    // Only process connections between valid shapes
    const isValidConnection = 
      (startShape.style.fillColor === C4Colors.PERSON && 
       (endShape.style.fillColor === C4Colors.CORE_SYSTEM || endShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM)) ||
      ((startShape.style.fillColor === C4Colors.CORE_SYSTEM || startShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM) && 
       (endShape.style.fillColor === C4Colors.CORE_SYSTEM || endShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM));

    if (isValidConnection) {
      // Try to get connector text from various possible properties
      let description = '';
      
      if ('captions' in connector && Array.isArray(connector.captions)) {
        const captionText = connector.captions
          .map(c => c?.content ? cleanContent(c.content) : '')
          .filter(text => text.length > 0)
          .join(' ');
        if (captionText) description = captionText;
      }
      
      if (!description && 'text' in connector) {
        const text = connector.text;
        if (typeof text === 'string') {
          description = cleanContent(text);
        }
      }
      
      if (!description && 'title' in connector) {
        const title = connector.title;
        if (typeof title === 'string') {
          description = cleanContent(title);
        }
      }

      model.integrations.push({
        number: integrationNumber++,
        source: startShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM 
          ? parseHtmlContent(startShape.content).title || cleanContent(startShape.content)
          : cleanContent(startShape.content),
        'depends-on': endShape.style.fillColor === C4Colors.SUPPORTING_SYSTEM
          ? parseHtmlContent(endShape.content).title || cleanContent(endShape.content)
          : cleanContent(endShape.content),
        description
      });
    }
  }

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
 * Finds metadata text elements in a frame.
 * Looks for specific prefixes like "title:" and "version:" to extract metadata.
 * 
 * @param items - Array of Miro board items
 * @returns Object containing found title and version
 */
async function findMetadata(items: miro.BoardItem[]): Promise<{ title?: string; version?: string }> {
  const metadata: { title?: string; version?: string } = {};
  
  for (const item of items) {
    if (item.type === 'text') {
      const text = (item.content || '').toLowerCase();
      if (text.startsWith('title:')) {
        metadata.title = item.content.substring(6).trim();
      } else if (text.startsWith('version:')) {
        metadata.version = item.content.substring(8).trim();
      }
    }
  }
  
  return metadata;
}

/**
 * Finds description text near a shape.
 * Searches for sticky notes or text elements in proximity to the shape.
 * 
 * @param shape - Miro shape to find description for
 * @param items - Array of all board items
 * @returns Description text if found
 */
async function findShapeDescription(shape: miro.Shape, items: miro.BoardItem[]): Promise<string | undefined> {
  // Find sticky notes or text near the shape that might contain its description
  const nearbyItems = items.filter(item => 
    (item.type === 'sticky_note' || item.type === 'text') &&
    isNearShape(item, shape)
  );
  
  return nearbyItems[0]?.content;
}

/**
 * Determines if an item is near a shape.
 * Uses simple distance calculation to check proximity.
 * 
 * @param item - Miro board item to check
 * @param shape - Shape to check proximity to
 * @returns True if item is within proximity threshold
 */
function isNearShape(item: miro.BoardItem, shape: miro.Shape): boolean {
  // Simple proximity check
  const maxDistance = 100; // pixels
  const dx = item.x - shape.x;
  const dy = item.y - shape.y;
  return Math.sqrt(dx * dx + dy * dy) <= maxDistance;
}

/**
 * Checks if text content appears to be documentation.
 * Used to filter out legend and documentation text from processing.
 * 
 * @param content - Text content to check
 * @returns True if content appears to be documentation
 */
function isDocumentationText(content: string): boolean {
  const cleanedContent = cleanContent(content).toLowerCase();
  return cleanedContent.includes('legend:') ||
         cleanedContent.includes('core system:') ||
         cleanedContent.includes('person:') ||
         cleanedContent.includes('there are multiple') ||
         cleanedContent.includes('sticky notes') ||
         cleanedContent.includes('dependencies:') ||
         cleanedContent.includes('question:');
}

/**
 * Determines if an item is near a connector.
 * Uses vector math to check if text is positioned along the connector.
 * 
 * @param item - Miro board item to check
 * @param connector - Connector to check proximity to
 * @param frame - Frame containing the elements
 * @returns True if item is near the connector
 */
function isNearConnector(item: miro.BoardItem, connector: miro.Connector, frame: miro.Frame): boolean {
  // Convert normalized coordinates to absolute coordinates using frame dimensions
  const startX = frame.x - (frame.width / 2) + (connector.start.position.x * frame.width);
  const startY = frame.y - (frame.height / 2) + (connector.start.position.y * frame.height);
  const endX = frame.x - (frame.width / 2) + (connector.end.position.x * frame.width);
  const endY = frame.y - (frame.height / 2) + (connector.end.position.y * frame.height);
  
  // Calculate midpoint and vector of the connector
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const connectorVectorX = endX - startX;
  const connectorVectorY = endY - startY;
  const connectorLength = Math.sqrt(connectorVectorX * connectorVectorX + connectorVectorY * connectorVectorY);
  
  // Calculate perpendicular vector (rotated 90 degrees)
  const perpVectorX = -connectorVectorY / connectorLength;
  const perpVectorY = connectorVectorX / connectorLength;
  
  // Calculate text position relative to connector
  const textToMidX = item.x - midX;
  const textToMidY = item.y - midY;
  
  // Project text position onto perpendicular vector to get offset from connector line
  const perpendicularDistance = Math.abs(textToMidX * perpVectorX + textToMidY * perpVectorY);
  
  // Project text position onto connector vector to get position along connector
  const alongConnectorDistance = Math.abs(textToMidX * (connectorVectorX / connectorLength) + 
                                        textToMidY * (connectorVectorY / connectorLength));
  
  // Increase distance thresholds
  const maxPerpendicularDistance = 300; // pixels, increased from 150
  const maxAlongDistance = connectorLength * 0.5; // 50% of connector length, increased from 30%
  
  const isNearEnough = perpendicularDistance <= maxPerpendicularDistance && 
                      alongConnectorDistance <= maxAlongDistance;
  
  console.log('Text position analysis:', {
    text: 'content' in item ? cleanContent(item.content) : 'no content',
    type: item.type,
    distances: {
      perpendicular: perpendicularDistance,
      alongConnector: alongConnectorDistance,
      maxPerpendicular: maxPerpendicularDistance,
      maxAlong: maxAlongDistance
    },
    isNearEnough,
    position: {
      text: { x: item.x, y: item.y },
      connector: {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        mid: { x: midX, y: midY }
      }
    }
  });
  
  return isNearEnough;
}

/**
 * Calculates distance between an item and a connector.
 * Used for determining which text elements belong to which connectors.
 * 
 * @param item - Miro board item
 * @param connector - Connector to measure distance to
 * @param frame - Frame containing the elements
 * @returns Distance in pixels
 */
function getDistanceToConnector(item: miro.BoardItem, connector: miro.Connector, frame: miro.Frame): number {
  // Convert normalized coordinates to absolute coordinates
  const startX = frame.x - (frame.width / 2) + (connector.start.position.x * frame.width);
  const startY = frame.y - (frame.height / 2) + (connector.start.position.y * frame.height);
  const endX = frame.x - (frame.width / 2) + (connector.end.position.x * frame.width);
  const endY = frame.y - (frame.height / 2) + (connector.end.position.y * frame.height);
  
  // Calculate midpoint
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  
  // Calculate distance to midpoint
  const dx = item.x - midX;
  const dy = item.y - midY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Determines if an item is in the legend area of the frame.
 * Legend area is defined as the middle portion (40-60%) of the frame width.
 * 
 * @param item - Miro board item to check
 * @param frame - Frame containing the item
 * @returns True if item is in the legend area
 */
function isInLegendArea(item: miro.BoardItem, frame: miro.Frame): boolean {
  // Calculate frame boundaries
  const frameLeftEdge = frame.x - (frame.width / 2);
  
  // Calculate where in the frame the item is (0 to 1)
  const normalizedPosition = (item.x - frameLeftEdge) / frame.width;
  
  // Item is in legend if it's in the middle portion of the frame (40-60%)
  return normalizedPosition >= 0.4 && normalizedPosition <= 0.6;
} 
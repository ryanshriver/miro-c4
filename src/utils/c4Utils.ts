/**
 * Shared utilities for C4 diagram parsing
 * Contains functions used by both Context and Container level parsers
 */

import { C4Colors } from '../types/c4Context';
import { C4ContainerColors } from '../types/c4Container';
import { C4Integration } from '../types/c4Context';

/**
 * Cleans HTML content from Miro text elements.
 * Removes HTML tags, decodes entities, and normalizes whitespace.
 * For system names, only the first line is returned.
 */
export function cleanContent(content: string): string {
  const cleaned = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();                 // Trim extra spaces

  return cleaned.split('\n')[0];
}

/**
 * Parses HTML content to extract title and description.
 * Specifically handles Miro's text formatting where:
 * - Title is typically in <strong> tags (with or without style)
 * - Description is in regular <span> tags
 */
export function parseHtmlContent(content: string): { title: string; description: string } {
  // First try to extract content from <strong> tags, including those with style attributes
  const strongRegex = /<strong[^>]*>(.*?)<\/strong>/;
  const strongMatch = content.match(strongRegex);
  const strongContent = strongMatch ? strongMatch[1].replace(/<br\s*\/?>/g, '') : '';
  const title = strongContent ? cleanContent(strongContent) : '';

  // Remove all HTML tags except spans, then extract span content
  let remainingContent = content
    .replace(strongRegex, '')  // Remove strong tag and its content
    .replace(/<br\s*\/?>/g, '\n')  // Convert <br> to newlines
    .replace(/<\/?p>/g, '\n')      // Convert <p> tags to newlines
    .trim();

  // Extract text from spans and remove the span tags
  remainingContent = remainingContent.replace(/<span[^>]*>(.*?)<\/span>/g, '$1').trim();

  // Clean and split the remaining content
  const cleanedLines = remainingContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => cleanContent(line));  // Clean each line
  
  // If no title was found in <strong> tags, use first line as title
  const finalTitle = title || cleanedLines[0] || '';
  
  // For description, use only the cleaned lines that don't match the title
  const description = cleanedLines
    .filter(line => line !== title)  // Remove any line that exactly matches the title
    .join('\n');

  return {
    title: finalTitle,
    description: description
  };
}

/**
 * Determines if an item is in the legend area of the frame.
 * Legend is defined as any item contained within a frame named "Legend"
 * within the main diagram frame.
 */
export function isInLegendArea(item: miro.BoardItem, frame: miro.Frame): boolean {
  // First check if this item is itself a frame named "Legend"
  if (item.type === 'frame' && (item as miro.Frame).title === 'Legend') {
    return true;
  }

  // Check if this item is within a Legend frame
  const legendFrame = frame.children?.find(child => 
    child.type === 'frame' && 
    (child as miro.Frame).title === 'Legend'
  );

  // If no legend frame exists, the item is not in a legend area
  if (!legendFrame) {
    return false;
  }

  // Check if the item is a child of the legend frame
  return (legendFrame as miro.Frame).childrenIds?.includes(item.id) || false;
}

/**
 * Determines if a frame contains a C4 diagram and what type it is.
 * 
 * @param frame - The frame to analyze
 * @returns The type of C4 diagram ('context' | 'container' | null)
 */
export async function detectC4DiagramType(frame: miro.Frame): Promise<'context' | 'container' | null> {
  // Check frame title first
  const titleLower = frame.title.toLowerCase();
  console.log('Analyzing frame:', {
    title: frame.title,
    id: frame.id
  });
  
  // Skip component diagrams early
  if (titleLower.includes('component') || titleLower.includes('level 3')) {
    return null;
  }

  // Get all items in the frame
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));
  
  // Initialize counters for different shape types
  let personCount = 0;
  let coreSysCount = 0;
  let supportingSysCount = 0;
  let containerCount = 0;
  let webBrowserCount = 0;
  let databaseCount = 0;
  
  // Analyze shapes in the frame
  for (const item of items) {
    if (item.type === 'shape' || item.type === 'stencil') {
      const shape = item as miro.Shape;
      if (!shape.style?.fillColor || !shape.shape) continue;
      
      // Skip shapes in legend area
      if (isInLegendArea(shape, frame)) {
        console.log('Skipping legend item:', {
          content: shape.content,
          shape: shape.shape,
          fillColor: shape.style.fillColor
        });
        continue;
      }
      
      // Count context diagram elements
      if (shape.style.fillColor === C4Colors.PERSON && shape.shape === 'round_rectangle') {
        personCount++;
      } else if (shape.style.fillColor === C4Colors.CORE_SYSTEM && shape.shape === 'round_rectangle') {
        coreSysCount++;
      } else if (shape.style.fillColor === C4Colors.SUPPORTING_SYSTEM && shape.shape === 'rectangle') {
        supportingSysCount++;
      }
      
      // Count container diagram elements
      else if (shape.style.fillColor === C4ContainerColors.CONTAINER && shape.shape === 'round_rectangle') {
        containerCount++;
      } else if (shape.style.fillColor === C4ContainerColors.WEB_BROWSER && shape.shape === 'round_rectangle') {
        webBrowserCount++;
      } else if (shape.shape === 'can') {
        databaseCount++;
      }
    }
  }

  console.log('Shape counts:', {
    personCount,
    coreSysCount,
    supportingSysCount,
    containerCount,
    webBrowserCount,
    databaseCount
  });

  // Determine diagram type based on shape counts and title
  const hasContextElements = personCount > 0 && (coreSysCount > 0 || supportingSysCount > 0);
  const hasContainerElements = containerCount > 0 || webBrowserCount > 0 || databaseCount > 0;

  console.log('Diagram analysis:', {
    hasContextElements,
    hasContainerElements,
    titleIndicatesContext: titleLower.includes('context') || titleLower.includes('level 1'),
    titleIndicatesContainer: titleLower.includes('container') || titleLower.includes('level 2')
  });

  // First check title - this is the most reliable indicator
  if (titleLower.includes('context') || titleLower.includes('level 1')) {
    return 'context';
  }
  if (titleLower.includes('container') || titleLower.includes('level 2')) {
    return 'container';
  }

  // If no title indicator, fall back to content-based detection
  if (hasContainerElements) return 'container';
  if (hasContextElements) return 'context';
  
  return null;
}

/**
 * Process connectors to extract integrations and dependency counts.
 * Used by both Context and Container parsers to ensure consistent handling.
 */
export function processConnectors(
  connectors: miro.Connector[],
  shapeMap: Map<string, miro.Shape>
): {
  integrations: C4Integration[];
  incomingCount: Map<string, number>;
  outgoingCount: Map<string, number>;
  bidirectionalRelationships: { source: string; target: string }[];
} {
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  const integrations: C4Integration[] = [];
  const bidirectionalRelationships: { source: string; target: string }[] = [];
  let relationshipNumber = 1;

  for (const connector of connectors) {
    if (!connector.start?.item || !connector.end?.item) continue;

    const startShape = shapeMap.get(connector.start.item);
    const endShape = shapeMap.get(connector.end.item);
    
    if (!startShape || !endShape) continue;

    // Check if this connector has arrows on both ends
    const hasStartArrow = connector.style?.startStrokeCap === 'arrow' || 
                         connector.style?.startStrokeCap === 'rounded_stealth';
    const hasEndArrow = connector.style?.endStrokeCap === 'arrow' || 
                       connector.style?.endStrokeCap === 'rounded_stealth';
    
    if (hasStartArrow && hasEndArrow) {
      const { title: startTitle } = parseHtmlContent(startShape.content);
      const { title: endTitle } = parseHtmlContent(endShape.content);
      const startName = startTitle || cleanContent(startShape.content).split('\n')[0];
      const endName = endTitle || cleanContent(endShape.content).split('\n')[0];

      bidirectionalRelationships.push({
        source: startName,
        target: endName
      });
      continue;
    }

    // Get source and target names
    const { title: sourceTitle } = parseHtmlContent(startShape.content);
    const { title: targetTitle } = parseHtmlContent(endShape.content);
    const sourceName = sourceTitle || cleanContent(startShape.content).split('\n')[0];
    const targetName = targetTitle || cleanContent(endShape.content).split('\n')[0];

    // Handle special case for 'App' -> 'Talent Web App'
    const actualSourceName = sourceName === 'App' ? 'Talent Web App' : 
                           sourceName === 'Database' ? 'Talent DB' : sourceName;
    const actualTargetName = targetName === 'App' ? 'Talent Web App' : 
                           targetName === 'Database' ? 'Talent DB' : targetName;

    // Count dependencies
    outgoingCount.set(actualSourceName, (outgoingCount.get(actualSourceName) || 0) + 1);
    incomingCount.set(actualTargetName, (incomingCount.get(actualTargetName) || 0) + 1);

    // Get relationship description
    const descriptions: string[] = [];
    
    if ('captions' in connector && Array.isArray(connector.captions)) {
      const captionTexts = connector.captions
        .map(c => c?.content ? cleanContent(c.content) : '')
        .filter(text => text.length > 0);
      descriptions.push(...captionTexts);
    }
    
    if (descriptions.length === 0 && 'text' in connector) {
      const text = connector.text;
      if (typeof text === 'string') {
        descriptions.push(cleanContent(text));
      }
    }
    
    if (descriptions.length === 0 && 'title' in connector) {
      const title = connector.title;
      if (typeof title === 'string') {
        descriptions.push(cleanContent(title));
      }
    }

    // Add integration
    integrations.push({
      number: relationshipNumber++,
      source: actualSourceName,
      'depends-on': actualTargetName,
      description: descriptions.length > 0 ? descriptions : []
    });
  }

  return {
    integrations,
    incomingCount,
    outgoingCount,
    bidirectionalRelationships
  };
}

/**
 * Result type for C4 diagram parsing including both model and errors
 */
export interface ParseResult<T> {
  model?: T;
  warnings: string[];
  errors: string[];
} 
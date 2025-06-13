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
  console.log('Parsing HTML content:', content);
  
  // Extract content from strong tags, including those with style attributes
  const strongRegex = /<strong[^>]*>(.*?)<\/strong>/g;
  const strongMatches = content.match(strongRegex);
  let title = '';
  
  if (strongMatches && strongMatches.length > 0) {
    // Get the first strong tag content
    const firstStrong = strongMatches[0];
    title = firstStrong.replace(/<[^>]+>/g, '').trim();
    console.log('Found title in strong tag:', title);
  } else {
    // If no strong tags, try to get the first line
    const lines = content.split(/<br\s*\/?>/).map(line => line.replace(/<[^>]+>/g, '').trim());
    console.log('Split lines:', lines);
    title = lines[0] || '';
  }

  // Get description from remaining content
  let description = content
    .replace(/<strong[^>]*>.*?<\/strong>/g, '') // Remove strong tags
    .replace(/<[^>]+>/g, '') // Remove other HTML tags
    .replace(/&amp;/g, '&') // Decode HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  // If description is empty and we have multiple lines, use the second line
  if (!description && content.includes('<br')) {
    const lines = content.split(/<br\s*\/?>/).map(line => line.replace(/<[^>]+>/g, '').trim());
    if (lines.length > 1) {
      description = lines[1];
    }
  }

  console.log('Final parsed result:', { title, description });
  return { title, description };
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
 * Strips HTML tags from a string, preserving the text content.
 * Also handles common HTML entities and ensures proper spacing between words.
 */
function stripHtmlTags(html: string): string {
  // First decode common HTML entities
  const decoded = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Then strip HTML tags and ensure proper spacing
  return decoded
    .replace(/<[^>]*>/g, ' ')  // Replace tags with a space
    .replace(/\s+/g, ' ')      // Replace multiple spaces with a single space
    .trim();                   // Remove leading/trailing spaces
}

/**
 * Processes connectors to create integrations and count dependencies.
 * Used by both Context and Container parsers to ensure consistent handling.
 */
export async function processConnectors(
  connectors: miro.Connector[],
  shapeMap: Map<string, miro.Shape>
): Promise<{
  integrations: C4Integration[];
  incomingCount: Map<string, number>;
  outgoingCount: Map<string, number>;
  bidirectionalRelationships: Set<string>;
}> {
  const integrations: C4Integration[] = [];
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  const bidirectionalRelationships = new Set<string>();
  const processedPairs = new Set<string>();
  let integrationNumber = 1;

  // Helper to get shape name
  const getShapeName = (shapeId: string): string => {
    const shape = shapeMap.get(shapeId);
    if (!shape) return '';
    const { title } = parseHtmlContent(shape.content);
    const name = Array.isArray(title) ? title[0] : title;
    // Clean the name by removing zero-width spaces and trimming
    return name.replace(/[\uFEFF\u200B]/g, '').trim();
  };

  // Helper to create a unique key for a pair of shapes
  const getPairKey = (id1: string, id2: string): string => {
    return [id1, id2].sort().join('-');
  };

  for (const connector of connectors) {
    const startShape = shapeMap.get(connector.start.item);
    const endShape = shapeMap.get(connector.end.item);
    
    if (!startShape || !endShape) continue;

    const startName = getShapeName(connector.start.item);
    const endName = getShapeName(connector.end.item);
    
    if (!startName || !endName) continue;

    // Update dependency counts
    outgoingCount.set(startName, (outgoingCount.get(startName) || 0) + 1);
    incomingCount.set(endName, (incomingCount.get(endName) || 0) + 1);

    // Check for bidirectional relationships
    const pairKey = getPairKey(connector.start.item, connector.end.item);
    if (processedPairs.has(pairKey)) {
      bidirectionalRelationships.add(pairKey);
    }
    processedPairs.add(pairKey);

    // Add integration
    integrations.push({
      number: integrationNumber++,
      source: startName,
      'depends-on': endName,
      ...(connector.content ? { description: connector.content } : {})
    });
  }

  return { integrations, incomingCount, outgoingCount, bidirectionalRelationships };
}

/**
 * Result type for C4 diagram parsing including both model and errors
 */
export interface ParseResult<T> {
  model?: T;
  warnings: string[];
  errors: string[];
} 
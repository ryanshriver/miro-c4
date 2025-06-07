/**
 * C4 Container Model Parser
 * 
 * Parses Miro frames containing C4 Container diagrams (Level 2) and converts them
 * into a structured YAML format. Identifies containers, external systems, and their
 * relationships based on visual properties in Miro.
 */

import { C4ContainerModel, C4ContainerColors } from '../types/c4Container';
import { cleanContent, parseHtmlContent, isInLegendArea, ParseResult, processConnectors } from './c4Utils';

/**
 * Main function to parse a Miro frame into a C4 container model.
 */
export async function parseFrameToC4Container(frame: miro.Frame): Promise<ParseResult<C4ContainerModel>> {
  // Get all items in the frame using frame's children property
  const allItems = await miro.board.get();
  const items = allItems.filter(item => frame.childrenIds.includes(item.id));
  
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
  
  // Initialize the model
  const model: C4ContainerModel = {
    level: 'Container',
    title: frame.title || 'Container Diagram (Level 2)',
    people: [],
    containers: [],
    systems: [],
    integrations: []
  };

  // Track warnings and errors
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Map to store shapes for relationship processing
  const shapeMap = new Map<string, miro.Shape>();
  
  // Set to track unique container names to prevent duplicates
  const containerNames = new Set<string>();
  
  // Set to track processed stencils
  const processedStencils = new Set<string>();
  
  // First pass: collect shapes for connector processing
  for (const item of items) {
    if (item.type === 'shape' || item.type === 'stencil') {
      // For stencils, create a shape-like object
      if (item.type === 'stencil') {
        // Skip if already processed
        if (processedStencils.has(item.id)) {
          continue;
        }
        processedStencils.add(item.id);
        
        console.log('Processing stencil:', item);
        
        // Try to get stencil content using Miro SDK
        let stencilContent = '';
        let stencilDescription = '';
        
        try {
          // Log the full stencil object for debugging
          console.log('Full stencil object:', JSON.stringify(item, null, 2));
          
          // Try to get stencil content from the SDK
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
          content: stencilContent,
          description: stencilDescription
        });
        
        // Create a shape-like object for the stencil
        const shape = {
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
        
        shapeMap.set(shape.id, shape);
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
      
      shapeMap.set(shape.id, shape);
    }
  }

  // Get all connectors (excluding those in legend area)
  const connectors = items.filter(item => 
    item.type === 'connector' && 
    !isInLegendArea(item, frame)
  ) as miro.Connector[];

  // Process connectors using shared function
  const { integrations, incomingCount, outgoingCount, bidirectionalRelationships } = processConnectors(connectors, shapeMap);

  // Second pass: process shapes into model elements
  for (const [id, shape] of shapeMap) {
    // Skip empty shapes
    if (!shape.content) {
      console.log('Skipping empty content:', id);
      continue;
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
        id,
        content: content
      });
      continue;
    }
    
    // Parse the shape's content
    const { title, description } = parseHtmlContent(shape.content);
    console.log('Parsed content:', {
      id,
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
      console.log('Skipping due to no valid name:', id);
      continue;
    }
    
    // Check for person by looking for nearby circles
    if (shape.shape === 'round_rectangle') {
      // Get all circles, including those in groups
      const circles = items.filter(item => {
        if (item.type === 'shape' && (item as miro.Shape).shape === 'circle') {
          return true;
        }
        return false;
      });
      
      console.log('Checking for person:', {
        name,
        shape: {
          x: shape.x,
          y: shape.y
        },
        circles: circles.map(circle => ({
          x: circle.x,
          y: circle.y,
          distance: {
            x: Math.abs(circle.x - shape.x),
            y: Math.abs(circle.y - shape.y)
          }
        }))
      });
      
      // Check if any circle is near this round_rectangle
      const nearbyCircle = circles.some(circle => {
        const xDist = Math.abs(circle.x - shape.x);
        const yDist = Math.abs(circle.y - shape.y);
        // Increased thresholds to better match Miro's person icon dimensions
        const isNearby = xDist < 100 && yDist < 150;
        
        console.log('Circle distance check:', {
          xDist,
          yDist,
          isNearby
        });
        
        return isNearby;
      });
      
      if (nearbyCircle) {
        console.log('Found person:', {
          name,
          hasNearbyCircle: nearbyCircle
        });
        model.people.push({ name });
        continue;
      }
      
      // If it's a round_rectangle but not a person, treat it as a container
      const nameLower = name.toLowerCase();
      
      // Log container type detection
      console.log('Checking container type:', {
        name,
        nameLower,
        type: shape.type,
        shape: shape.shape,
        fillColor: shape.style.fillColor
      });
      
      if (nameLower.includes('web')) {
        // Web App container
        if (!containerNames.has(name)) {
          model.containers.push({
            name,
            type: 'Web App',
            description: desc || '',
            dependencies: {
              in: incomingCount.get(name) || 0,
              out: outgoingCount.get(name) || 0
            }
          });
          containerNames.add(name);
        }
      } else if (nameLower.includes('mobile')) {
        // Mobile App container
        if (!containerNames.has(name)) {
          model.containers.push({
            name,
            type: 'Mobile App',
            description: desc || '',
            dependencies: {
              in: incomingCount.get(name) || 0,
              out: outgoingCount.get(name) || 0
            }
          });
          containerNames.add(name);
        }
      } else {
        // Regular container
        if (!containerNames.has(name)) {
          model.containers.push({
            name,
            type: 'Container',
            description: desc || '',
            dependencies: {
              in: incomingCount.get(name) || 0,
              out: outgoingCount.get(name) || 0
            }
          });
          containerNames.add(name);
        }
      }
      
      console.log('Found container:', {
        name,
        type: nameLower.includes('web') ? 'Web App' : nameLower.includes('mobile') ? 'Mobile App' : 'Container',
        desc,
        content: shape.content
      });
      continue;
    }
    
    // Log all potential container shapes
    if (shape.shape === 'can' || shape.shape === 'rectangle') {
      console.log('Found potential container shape:', {
        id,
        type: shape.type,
        shape: shape.shape,
        content: shape.content,
        cleanContent: content,
        name,
        desc
      });
    }
    
    // Determine container type based on shape and name
    if (shape.shape === 'can') {
      // Database container
      console.log('Found database container:', {
        name,
        desc,
        content: shape.content
      });
      if (!containerNames.has(name)) {
        model.containers.push({
          name,
          type: 'Database',
          description: desc || '',
          dependencies: {
            in: incomingCount.get(name) || 0,
            out: outgoingCount.get(name) || 0
          }
        });
        containerNames.add(name);
      }
    }
    else if (shape.shape === 'rectangle') {
      // Check if this is a Web App, Mobile App, or supporting system
      const nameLower = name.toLowerCase();
      
      // Log container type detection
      console.log('Checking container type:', {
        name,
        nameLower,
        type: shape.type,
        shape: shape.shape,
        fillColor: shape.style.fillColor
      });
      
      if (nameLower.includes('web')) {
        // Web App container
        if (!containerNames.has(name)) {
          model.containers.push({
            name,
            type: 'Web App',
            description: desc || '',
            dependencies: {
              in: incomingCount.get(name) || 0,
              out: outgoingCount.get(name) || 0
            }
          });
          containerNames.add(name);
        }
      } else if (nameLower.includes('mobile')) {
        // Mobile App container
        if (!containerNames.has(name)) {
          model.containers.push({
            name,
            type: 'Mobile App',
            description: desc || '',
            dependencies: {
              in: incomingCount.get(name) || 0,
              out: outgoingCount.get(name) || 0
            }
          });
          containerNames.add(name);
        }
      } else {
        // Supporting system
        model.systems.push({
          name,
          description: desc || '',
          dependencies: {
            in: incomingCount.get(name) || 0,
            out: outgoingCount.get(name) || 0
          }
        });
      }
      
      console.log('Found container:', {
        name,
        type: nameLower.includes('web') ? 'Web App' : nameLower.includes('mobile') ? 'Mobile App' : 'Supporting System',
        desc,
        content: shape.content
      });
    }
  }

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

  return { model, warnings, errors };
} 
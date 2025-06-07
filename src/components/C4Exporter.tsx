/**
 * C4 Model Exporter Component
 * 
 * This component provides the main user interface for the C4 Model Exporter Miro app.
 * It allows users to select a frame from their Miro board and export its contents
 * as a YAML file following the C4 model format.
 * 
 * Features:
 * - Frame selection dropdown
 * - Export button with loading state
 * - Error handling for export process
 * - Automatic YAML file download
 * 
 * The component integrates with the C4Parser utility to convert Miro frames
 * into structured C4 model data.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { parseFrameToC4Context, parseFrameToC4Container } from '../utils/c4ContextParser';
import { detectC4DiagramType } from '../utils/c4Utils';
import yaml from 'js-yaml';

interface C4ExporterProps {
  onWarnings: (warnings: string[]) => void;
  onErrors?: (errors: string[]) => void;
}

interface C4Frame extends miro.Frame {
  diagramType: 'context' | 'container' | null;
}

export function C4Exporter({ onWarnings, onErrors }: C4ExporterProps) {
  const [frames, setFrames] = useState<C4Frame[]>([]);
  const [selectedContextFrameId, setSelectedContextFrameId] = useState<string>('');
  const [selectedContainerFrameId, setSelectedContainerFrameId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Loads all frames from the Miro board when the component mounts.
   * Filters for frame-type items and stores them in state.
   */
  useEffect(() => {
    loadFrames();
  }, []);

  /**
   * Fetches all frames from the current Miro board.
   * Updates the frames state with the retrieved frames.
   */
  async function loadFrames() {
    try {
      const items = await miro.board.get({ type: 'frame' });
      console.log('All frames:', items);
      
      // Filter for frames and analyze their contents
      const frames = items
        .filter((item): item is miro.Frame => item.type === 'frame')
        // Exclude frames titled "Legend"
        .filter(frame => frame.title !== 'Legend');
      
      const analyzedFrames: C4Frame[] = [];
      
      for (const frame of frames) {
        const diagramType = await detectC4DiagramType(frame);
        if (diagramType) { // Only add frames that are valid C4 diagrams
          analyzedFrames.push({
            ...frame,
            diagramType
          });
        }
      }
      
      setFrames(analyzedFrames);
    } catch (error) {
      console.error('Error loading frames:', error);
    }
  }

  // Filter frames by diagram type
  const contextFrames = frames.filter(frame => frame.diagramType === 'context');
  const containerFrames = frames.filter(frame => frame.diagramType === 'container');

  /**
   * Handles the export process when the export button is clicked.
   * 
   * Process:
   * 1. Validates frame selection
   * 2. Retrieves all items in the selected frame
   * 3. Parses frame contents into C4 model format
   * 4. Converts model to YAML
   * 5. Triggers file download
   * 
   * Error handling is included for each step of the process.
   */
  async function handleExport(type: 'context' | 'container') {
    const selectedFrameId = type === 'context' ? selectedContextFrameId : selectedContainerFrameId;
    
    if (!selectedFrameId) {
      console.warn('Please select a frame first');
      return;
    }

    setIsLoading(true);
    onWarnings([]); // Clear previous warnings
    onErrors?.([]); // Clear previous errors

    try {
      const selectedFrame = frames.find(frame => frame.id === selectedFrameId);
      console.log('Selected frame:', selectedFrame);

      if (!selectedFrame) {
        throw new Error('Selected frame not found');
      }

      // Parse frame contents into C4 model based on type
      const { model, warnings, errors } = type === 'context' 
        ? await parseFrameToC4Context(selectedFrame)
        : await parseFrameToC4Container(selectedFrame);
      
      if (warnings.length > 0) {
        console.log('Received warnings from parser:', warnings);
        onWarnings(warnings);
      } else {
        console.log('No warnings received from parser');
      }

      if (errors.length > 0) {
        console.log('Received errors from parser:', errors);
        onErrors?.(errors);
        return;
      }

      if (!model) {
        console.error('No model returned from parser');
        return;
      }

      console.log('Generated C4 model:', model);

      // Convert to YAML with schema validation
      const yamlContent = yaml.dump(model, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        schema: yaml.DEFAULT_SCHEMA,
        styles: {
          '!!null': 'empty'
        },
        sortKeys: false
      });

      console.log('Generated YAML:', yamlContent);

      // Create and trigger download with appropriate filename
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedFrame.title || `c4-${type}`}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('YAML file exported successfully');
    } catch (error) {
      console.error('Error exporting YAML:', error);
      onErrors?.([`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ 
      width: '320px',
      padding: '0 24px',
      boxSizing: 'border-box',
      backgroundColor: '#ffffff'  // Add white background to see container bounds
    }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Context Diagram (Level 1)</h3>
        <div style={{ 
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <div style={{ width: '200px' }}>
            <select 
              className="select select-large"
              value={selectedContextFrameId}
              onChange={(e) => setSelectedContextFrameId(e.target.value)}
              disabled={isLoading}
              style={{ width: '100%' }}
            >
              <option value="">Select a frame...</option>
              {contextFrames.map(frame => (
                <option key={frame.id} value={frame.id}>
                  {frame.title || 'Untitled Frame'}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button button-primary button-large"
            onClick={() => handleExport('context')}
            disabled={!selectedContextFrameId || isLoading}
          >
            {isLoading ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Container Diagram (Level 2)</h3>
        <div style={{ 
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <div style={{ width: '200px' }}>
            <select 
              className="select select-large"
              value={selectedContainerFrameId}
              onChange={(e) => setSelectedContainerFrameId(e.target.value)}
              disabled={isLoading}
              style={{ width: '100%' }}
            >
              <option value="">Select a frame...</option>
              {containerFrames.map(frame => (
                <option key={frame.id} value={frame.id}>
                  {frame.title || 'Untitled Frame'}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button button-primary button-large"
            onClick={() => handleExport('container')}
            disabled={!selectedContainerFrameId || isLoading}
          >
            {isLoading ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
} 
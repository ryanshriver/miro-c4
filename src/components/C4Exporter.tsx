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
import { parseFrameToC4Context } from '../utils/c4Parser';
import yaml from 'js-yaml';

interface C4ExporterProps {
  onWarnings: (warnings: string[]) => void;
  onErrors?: (errors: string[]) => void;
}

export function C4Exporter({ onWarnings, onErrors }: C4ExporterProps) {
  const [frames, setFrames] = useState<miro.Frame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string>('');
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
      const frames = items.filter((item): item is miro.Frame => item.type === 'frame');
      setFrames(frames);
    } catch (error) {
      console.error('Error loading frames:', error);
    }
  }

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
  async function handleExport() {
    if (!selectedFrameId) {
      console.warn('Please select a frame first');
      return;
    }

    setIsLoading(true);
    onWarnings([]); // Clear previous warnings
    onErrors?.([]); // Clear previous errors
    try {
      // Get all items on the board
      const allItems = await miro.board.get();
      console.log('All board items:', allItems);

      // Find selected frame
      const selectedFrame = allItems.find(item => item.id === selectedFrameId && item.type === 'frame') as miro.Frame;
      console.log('Selected frame:', selectedFrame);

      if (!selectedFrame) {
        throw new Error('Selected frame not found');
      }

      // Get only the items that belong to this frame using childrenIds
      const frameItems = allItems.filter(item => 
        selectedFrame.childrenIds?.includes(item.id)
      );
      console.log('Frame items:', frameItems);

      // Parse frame contents into C4 model
      const { model, warnings, errors } = await parseFrameToC4Context(selectedFrame);
      
      // Handle warnings
      if (warnings.length > 0) {
        console.log('Received warnings from parser:', warnings);
        onWarnings(warnings);
      } else {
        console.log('No warnings received from parser');
      }

      // Handle errors - these block export
      if (errors.length > 0) {
        console.log('Received errors from parser:', errors);
        onErrors?.(errors);
        return; // Don't proceed with export
      }

      // If no model was returned with errors, don't proceed
      if (!model) {
        console.error('No model returned from parser');
        return;
      }

      console.log('Generated C4 model:', model);
      
      // Validate C4 model structure
      if (!model || typeof model !== 'object') {
        throw new Error('Invalid C4 model generated');
      }

      if (!Array.isArray(model.people) || !Array.isArray(model.systems) || !Array.isArray(model.integrations)) {
        throw new Error('C4 model missing required arrays');
      }

      // Convert to YAML with schema validation
      const yamlContent = yaml.dump(model, {
        indent: 2,
        lineWidth: -1, // Don't wrap lines
        quotingType: '"', // Use double quotes
        schema: yaml.DEFAULT_SCHEMA,
        styles: {
          '!!null': 'empty' // Replace null with empty string
        },
        sortKeys: false // Preserve original order
      });

      console.log('Generated YAML:', yamlContent);

      // Create and trigger download
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedFrame.title || 'c4-context'}.yaml`;
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
      <div style={{ 
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        <div style={{ width: '200px' }}>
          <select 
            className="select select-large"
            value={selectedFrameId}
            onChange={(e) => setSelectedFrameId(e.target.value)}
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            <option value="">Select a frame...</option>
            {frames.map(frame => (
              <option key={frame.id} value={frame.id}>
                {frame.title || 'Untitled Frame'}
              </option>
            ))}
          </select>
        </div>
        
        <button
          className="button button-primary button-large"
          onClick={handleExport}
          disabled={!selectedFrameId || isLoading}
        >
          {isLoading ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </div>
  );
} 
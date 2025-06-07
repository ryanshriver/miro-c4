/**
 * C4 Context Model Type Definitions
 * 
 * This module defines the TypeScript interfaces and types for the C4 Context model structure.
 * It includes definitions for the context-level diagram elements (people, systems, integrations)
 * as well as color constants used for identifying elements in Miro.
 */

/**
 * Represents a complete C4 context model.
 * This is the top-level structure that gets exported to YAML.
 */
export interface C4ContextModel {
  level: 'Context';
  title: string;
  people: C4Person[];
  systems: C4System[];
  integrations: C4Integration[];
}

/**
 * Represents a person or role in the C4 model.
 * Identified in Miro as a dark blue round rectangle.
 */
export interface C4Person {
  name: string;
}

/**
 * Represents either a core system or an external system in the C4 model.
 * Core systems are identified as black round rectangles.
 * External systems are identified as light gray rectangles and require descriptions.
 */
export type C4System = {
  name: string;
  type: 'Core';
  dependencies: {
    in: number;
    out: number;
  };
} | {
  name: string;
  type: 'External';
  description: string;
  dependencies: {
    in: number;
    out: number;
  };
}

/**
 * Represents an integration (connection) between elements in the C4 model.
 * Derived from connector lines in Miro with associated text/captions.
 */
export interface C4Integration {
  number: number;
  source: string;
  'depends-on': string;
  description: string[];
}

/**
 * Color constants used to identify different types of elements in Miro diagrams.
 * These colors are used to determine the type of each shape when parsing.
 */
export const C4Colors = {
  PERSON: '#305bab',     // Person/Role shape (round rectangle) - dark blue
  CORE_SYSTEM: '#1a1a1a',    // Core system shape (round rectangle) - black
  SUPPORTING_SYSTEM: '#e7e7e7' // Supporting system shape (rectangle) - light gray
} as const; 
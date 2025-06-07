/**
 * Type definitions for C4 Container diagrams (Level 2)
 */

/**
 * Represents a complete C4 container model.
 */
export interface C4ContainerModel {
  level: 'Container';
  title: string;
  people: C4Person[];
  containers: C4Container[];
  systems: C4ExternalSystem[];
  integrations: C4Relationship[];
}

/**
 * Represents a person (user) who interacts with the system
 */
export interface C4Person {
  name: string;
}

/**
 * Represents a container within the system
 */
export interface C4Container {
  name: string;
  type: 'Container' | 'Web App' | 'Database' | 'Mobile App';
  description: string;
  dependencies: {
    in: number;
    out: number;
  };
}

/**
 * Represents an external system that interacts with our system
 */
export interface C4ExternalSystem {
  name: string;
  description: string;
  dependencies: {
    in: number;
    out: number;
  };
}

/**
 * Represents a relationship between two elements
 */
export interface C4Relationship {
  number: number;
  source: string;
  'depends-on': string;
  description: string[];
}

/**
 * Color constants for C4 Container diagram elements
 */
export const C4ContainerColors = {
  PERSON: '#305bab',
  WEB_BROWSER: '#12314c',
  CONTAINER: '#1a1a1a',
  DATABASE: '#f1e7f9',
  EXTERNAL_SYSTEM: '#e7e7e7'
} as const; 
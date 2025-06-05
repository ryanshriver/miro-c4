/**
 * Miro Web SDK Type Definitions
 * 
 * This module extends the official Miro Web SDK types with additional type definitions
 * specific to our C4 model exporter application. It includes detailed typing for
 * frames, shapes, connectors, and board items that we interact with.
 * 
 * Note: This builds upon the base types from @mirohq/websdk-types
 */

/// <reference types="@mirohq/websdk-types" />

declare namespace miro {
  /**
   * Represents a frame in a Miro board.
   * Frames are containers that can hold other board items and are used
   * to organize C4 diagrams.
   */
  interface Frame extends BoardItem {
    title: string;          // Frame title displayed in the UI
    children: BoardItem[];  // Array of items contained in the frame
    childrenIds: string[]; // Array of item IDs contained in the frame
    width: number;         // Frame width in pixels
    height: number;        // Frame height in pixels
  }

  /**
   * Represents a color value in Miro.
   * Can be any valid color string (hex, rgb, etc.)
   */
  type MiroColor = string;

  /**
   * Represents a shape in a Miro board.
   * Shapes are used to represent C4 model elements (people, systems)
   * with specific colors and styles.
   */
  interface Shape extends BoardItem {
    content: string;      // Text content inside the shape
    shape: 'rectangle' | 'round_rectangle' | 'circle' | 'can';  // Shape type
    style: {
      fillColor: MiroColor;  // Shape's fill color (used to identify C4 element types)
    };
  }

  /**
   * Represents a connector (line/arrow) between items on a Miro board.
   * Used to represent relationships/integrations between C4 elements.
   */
  interface Connector extends BoardItem {
    content: string;           // Text content associated with the connector
    start: ConnectorEndpoint;  // Starting point connection
    end: ConnectorEndpoint;    // Ending point connection
    style?: {
      startStrokeCap?: 'none' | 'arrow' | 'stealth' | 'diamond' | 'rounded_stealth';  // Style of start point
      endStrokeCap?: 'none' | 'arrow' | 'stealth' | 'diamond' | 'rounded_stealth';    // Style of end point
      strokeStyle?: 'normal' | 'dashed';
      strokeWidth?: number;
      strokeColor?: string;
    };
  }

  /**
   * Represents an endpoint of a connector.
   * Defines where and how a connector attaches to a board item.
   */
  interface ConnectorEndpoint {
    item: string;              // ID of the connected item
    position: {
      x: number;              // Relative x position (0-1)
      y: number;              // Relative y position (0-1)
    };
    snapTo?: string;          // Optional snap point identifier
  }

  /**
   * Base interface for all items on a Miro board.
   * Provides common properties shared by all board items.
   */
  interface BoardItem {
    id: string;      // Unique identifier
    type: string;    // Item type (e.g., 'frame', 'shape', 'connector')
    x: number;       // X coordinate on the board
    y: number;       // Y coordinate on the board
    content: string; // Text content (if applicable)
  }

  /**
   * Options for retrieving items from a Miro board.
   */
  interface BoardGetOptions {
    type?: string;    // Filter by item type
    parent?: string;  // Filter by parent item ID
  }

  /**
   * Options for displaying notifications in Miro.
   */
  interface NotificationOptions {
    style?: 'error' | 'success' | 'info';  // Notification style/type
  }

  /**
   * Board-related functionality namespace.
   */
  namespace board {
    /**
     * Retrieves items from the board based on specified options.
     * @param options Optional filtering criteria
     * @returns Promise resolving to array of board items
     */
    function get(options?: BoardGetOptions): Promise<BoardItem[]>;

    /**
     * Retrieves a specific frame by its ID.
     * @param id Frame identifier
     * @returns Promise resolving to the frame
     */
    function getById(id: string): Promise<Frame>;

    /**
     * Board notification system.
     */
    const notifications: {
      /**
       * Displays a notification in the Miro UI.
       * @param message Text to display
       * @param options Notification display options
       */
      show(message: string, options?: NotificationOptions): Promise<void>;
    };
  }

  /**
   * Interface for displaying different types of notifications.
   */
  interface Notifications {
    showWarning(message: string): Promise<void>;
    showSuccess(message: string): Promise<void>;
    showError(message: string): Promise<void>;
  }

  /**
   * Shows a notification with specified message and type.
   * @param message Text to display
   * @param type Notification type
   */
  function showNotification(message: string, type?: 'success' | 'error' | 'info'): Promise<void>;
} 
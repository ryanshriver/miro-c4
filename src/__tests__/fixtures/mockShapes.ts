/**
 * Mock Miro shapes for testing C4 context parsing
 */

import { C4Colors } from '../../types/c4Context';

export const mockPersonShape: miro.Shape = {
  id: 'person-1',
  type: 'shape',
  shape: 'round_rectangle',
  x: 100,
  y: 100,
  content: '<p><strong>Employee</strong></p>',
  style: {
    fillColor: C4Colors.PERSON,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

export const mockCoreSystemShape: miro.Shape = {
  id: 'core-system-1',
  type: 'shape',
  shape: 'round_rectangle',
  x: 300,
  y: 100,
  content: '<p><strong>Talent Systems</strong></p>',
  style: {
    fillColor: C4Colors.CORE_SYSTEM,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

export const mockSupportingSystemShape: miro.Shape = {
  id: 'supporting-system-1',
  type: 'shape',
  shape: 'rectangle',
  x: 500,
  y: 100,
  content: '<p><strong>Email System</strong></p><p><span>Uses MS Office 365 Outlook</span></p>',
  style: {
    fillColor: C4Colors.SUPPORTING_SYSTEM,
    fontFamily: 'open_sans',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'middle',
  },
};

export const mockFrame: miro.Frame = {
  id: 'frame-1',
  type: 'frame',
  title: 'Context Diagram (Level 1)',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  childrenIds: ['person-1', 'core-system-1', 'supporting-system-1', 'connector-1'],
  children: [],
  content: '',
};

export const mockConnector: miro.Connector = {
  id: 'connector-1',
  type: 'connector',
  x: 200,
  y: 150,
  content: '',
  start: {
    item: 'person-1',
    position: { x: 0.5, y: 0.5 },
  },
  end: {
    item: 'core-system-1',
    position: { x: 0.5, y: 0.5 },
  },
  style: {
    endStrokeCap: 'arrow',
  },
  captions: [
    {
      content: 'Maintains personal data',
    }
  ],
}; 
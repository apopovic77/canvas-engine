import { Vector2 } from 'arkturian-typescript-utils';

import type { ILayouter } from './LayoutEngine';
import { LayoutNode } from './LayoutNode';

export interface DayAxisLabel {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  eventCount: number;
}

export interface DayStackLayoutConfig<T> {
  axisWidth?: number;
  axisPadding?: number;
  columnGap?: number;
  rowGap?: number;
  cardWidth?: number;
  cardHeight?: number;
  daySort?: (a: { key: string; sortValue: number }, b: { key: string; sortValue: number }) => number;
  eventSort?: (a: T, b: T) => number;
  getDayKey: (item: T) => string | null | undefined;
  getDayLabel: (item: T) => string;
  getSortValue: (item: T) => number;
}

const DEFAULT_AXIS_WIDTH = 220;
const DEFAULT_AXIS_PADDING = 24;
const DEFAULT_COLUMN_GAP = 24;
const DEFAULT_ROW_GAP = 40;
const DEFAULT_CARD_WIDTH = 280;
const DEFAULT_CARD_HEIGHT = 180;

export class DayStackLayouter<T> implements ILayouter<T> {
  private axisLabels: DayAxisLabel[] = [];

  constructor(private readonly config: DayStackLayoutConfig<T>) {}

  getAxisLabels(): DayAxisLabel[] {
    return this.axisLabels;
  }

  compute(nodes: LayoutNode<T>[], _view: { width: number; height: number }): void {
    this.axisLabels = [];
    if (nodes.length === 0) {
      return;
    }

    const axisWidth = this.config.axisWidth ?? DEFAULT_AXIS_WIDTH;
    const axisPadding = this.config.axisPadding ?? DEFAULT_AXIS_PADDING;
    const columnGap = this.config.columnGap ?? DEFAULT_COLUMN_GAP;
    const rowGap = this.config.rowGap ?? DEFAULT_ROW_GAP;
    const cardWidth = this.config.cardWidth ?? DEFAULT_CARD_WIDTH;
    const cardHeight = this.config.cardHeight ?? DEFAULT_CARD_HEIGHT;

    type GroupInfo = {
      key: string;
      label: string;
      nodes: LayoutNode<T>[];
      sortValue: number;
    };

    const groups = new Map<string, GroupInfo>();

    for (const node of nodes) {
      const key = this.config.getDayKey(node.data);
      if (!key) continue;

      const sortValue = this.config.getSortValue(node.data);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: this.config.getDayLabel(node.data),
          nodes: [node],
          sortValue,
        });
      } else {
        const group = groups.get(key)!;
        group.nodes.push(node);
        group.sortValue = Math.max(group.sortValue, sortValue);
      }
    }

    const orderedGroups = Array.from(groups.values());
    orderedGroups.sort((a, b) => {
      if (this.config.daySort) {
        return this.config.daySort(a, b);
      }
      return b.sortValue - a.sortValue;
    });

    const eventSorter = this.config.eventSort;
    let currentY = 0;
    this.axisLabels = orderedGroups.map((group, index) => {
      if (eventSorter) {
        group.nodes.sort((a, b) => eventSorter(a.data, b.data));
      }

      const startX = axisWidth + axisPadding;
      const label: DayAxisLabel = {
        key: group.key,
        label: group.label,
        x: 0,
        y: currentY,
        width: axisWidth,
        height: cardHeight,
        index,
        eventCount: group.nodes.length,
      };

      group.nodes.forEach((node, eventIndex) => {
        const x = startX + eventIndex * (cardWidth + columnGap);
        const y = currentY;
        node.setTargets(new Vector2(x, y), new Vector2(cardWidth, cardHeight), 1, 1);
      });

      currentY += cardHeight + rowGap;
      return label;
    });
  }
}


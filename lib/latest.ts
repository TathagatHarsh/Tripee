/**
 * Drops answers to superseded requests. Dragging a map or typing fires lookups
 * that can finish out of order; only the newest may update the screen.
 */
export function latest(): { next(): number; isCurrent(id: number): boolean } {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (id) => id === current,
  };
}

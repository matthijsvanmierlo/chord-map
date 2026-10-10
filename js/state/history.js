// Snapshot-based undo/redo for the editor (songs are small JSON objects).
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  /** Record the state BEFORE a change. */
  push(snapshot) {
    this.past.push(JSON.stringify(snapshot));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(JSON.stringify(current));
    return JSON.parse(this.past.pop());
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(JSON.stringify(current));
    return JSON.parse(this.future.pop());
  }
  clear() { this.past = []; this.future = []; }
}

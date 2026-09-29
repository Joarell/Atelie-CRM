import type { IRepository } from '../../src/repositories/IRepository';

// In-memory IRepository double: behaves like ApiRepository's cache layer
// (synchronous reads, async mutations, notify-on-change) without any fetch
// call — the services can be tested in pure isolation.
export class InMemoryRepository<T extends { id: string }> implements IRepository<T> {
  private records: T[] = [];
  private listeners: Array<() => void> = [];
  private version = 0;

  static seeded<T extends { id: string }>(seed: T[]): InMemoryRepository<T> {
    const repo = new InMemoryRepository<T>();
    repo.records = seed.map((item) => ({ ...item }));
    return repo;
  }

  getAll(): T[] {
    return this.records.map((item) => ({ ...item }));
  }

  getById(id: string): T | undefined {
    const found = this.records.find((item) => item.id === id);
    return found ? { ...found } : undefined;
  }

  async add(item: T): Promise<T> {
    this.records.push({ ...item });
    this.bump();
    return { ...item };
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const index = this.records.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    this.records[index] = { ...this.records[index], ...patch };
    this.bump();
    return { ...this.records[index] };
  }

  async remove(id: string): Promise<void> {
    this.records = this.records.filter((item) => item.id !== id);
    this.bump();
  }

  stash(item: T): void {
    const index = this.records.findIndex(
      (candidate) => candidate.id === item.id
    );
    if (index === -1) this.records.push({ ...item });
    else this.records[index] = { ...item };
    this.bump();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async load(): Promise<void> {
    // No external source: seed via constructor already.
  }

  get versionNumber(): number {
    return this.version;
  }

  private bump(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}
// Minimal persistence contract. Any storage medium (localStorage, a REST
// API backed by D1, IndexedDB...) can implement this without the rest of
// the app knowing the difference (Liskov substitution).
//
// Reads (getAll/getById) stay synchronous — every repository keeps an
// in-memory cache that's hydrated once via load() and kept fresh by every
// mutation. Mutations are async because they now go over the network to
// the Cloudflare Worker / D1.
export interface IRepository<T extends { id: string }> {
	getAll(): T[];
	getById(id: string): T | undefined;
	add(item: T): Promise<T>;
	update(id: string, patch: Partial<T>): Promise<T | undefined>;
	remove(id: string): Promise<void>;
	stash(item: T): void;
	subscribe(listener: () => void): () => void;
	load(): Promise<void>;
}

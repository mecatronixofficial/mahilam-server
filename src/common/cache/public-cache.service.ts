import { Global, Injectable, Module } from "@nestjs/common";

type Entry = { expiresAt: number; value: Promise<unknown> };

const MAX_ENTRIES = 500;

/**
 * Small in-process cache for public, read-heavy endpoints (home page, programs, blogs...).
 * Concurrent misses share one in-flight query, and any CMS write calls `clear()` so
 * admins see their changes immediately.
 */
@Injectable()
export class PublicCacheService {
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs = Number(process.env.PUBLIC_CACHE_TTL_MS ?? 60_000);

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return load();
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

    if (this.store.size >= MAX_ENTRIES) this.prune(now);
    const value = load();
    this.store.set(key, { expiresAt: now + this.ttlMs, value });
    value.catch(() => this.store.delete(key));
    return value;
  }

  clear() {
    this.store.clear();
  }

  /** Drops expired entries; if every entry is still fresh, starts over rather than grow without bound. */
  private prune(now: number) {
    for (const [key, entry] of this.store) if (entry.expiresAt <= now) this.store.delete(key);
    if (this.store.size >= MAX_ENTRIES) this.store.clear();
  }
}

@Global()
@Module({ providers: [PublicCacheService], exports: [PublicCacheService] })
export class PublicCacheModule {}

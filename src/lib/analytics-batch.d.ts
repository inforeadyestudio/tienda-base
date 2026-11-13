export declare const IMMEDIATE_EVENTS: Set<string>;
export declare const BATCH_MAX_EVENTS: number;
export declare const BATCH_INTERVAL_MS: number;
export declare const SERVER_MAX_EVENTS: number;
export declare const SERVER_MAX_BYTES: number;
export declare const RATE_LIMIT_PER_MIN: number;
export declare function isImmediate(name: string): boolean;
export declare function shouldFlush(queueLength: number): boolean;
export declare function createRateLimiter(limit?: number, windowMs?: number): (ip: string, now?: number) => boolean;

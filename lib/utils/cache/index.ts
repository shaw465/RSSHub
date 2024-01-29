import { config } from '@/config';
import redis from './redis';
import memory from './memory';
import type CacheModule from './base';

const globalCache: {
    get: (key: string) => Promise<string | null | undefined> | string | null | undefined;
    set: (key: string, value?: string | Record<string, any>, maxAge?: number) => any;
} = {
    get: () => null,
    set: () => null,
};

let cacheModule: CacheModule;

if (config.cache.type === 'redis') {
    cacheModule = redis;
    cacheModule.init();
    const { redisClient } = cacheModule.clients;
    globalCache.get = async (key) => {
        if (key && cacheModule.status.available && redisClient) {
            const value = await redisClient.get(key);
            return value;
        }
    };
    globalCache.set = cacheModule.set;
} else {
    cacheModule = memory;
    cacheModule.init();
    const { memoryCache } = cacheModule.clients;
    globalCache.get = (key) => {
        if (key && cacheModule.status.available && memoryCache) {
            return memoryCache.get(key, { updateAgeOnGet: false }) as string | undefined;
        }
    };
    globalCache.set = (key, value, maxAge = config.cache.routeExpire) => {
        if (!value || value === 'undefined') {
            value = '';
        }
        if (typeof value === 'object') {
            value = JSON.stringify(value);
        }
        if (key && memoryCache) {
            return memoryCache.set(key, value, { ttl: maxAge * 1000 });
        }
    };
}

// only give cache string, as the `!` condition tricky
// md5 is used to shrink key size
// plz, write these tips in comments!
export default {
    ...cacheModule,
    tryGet: async (key: string, getValueFunc: () => Promise<string | Record<string, any>>, maxAge = config.cache.contentExpire, refresh = true) => {
        if (typeof key !== 'string') {
            throw new TypeError('Cache key must be a string');
        }
        let v = await cacheModule.get(key, refresh);
        if (v) {
            let parsed;
            try {
                parsed = JSON.parse(v);
            } catch {
                parsed = null;
            }
            if (parsed) {
                v = parsed;
            }

            return v;
        } else {
            const value = await getValueFunc();
            cacheModule.set(key, value, maxAge);

            return value;
        }
    },
    globalCache,
};

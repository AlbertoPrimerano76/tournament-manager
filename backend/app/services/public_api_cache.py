from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class PublicApiCache:
    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry] = {}
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._lock = asyncio.Lock()

    async def get_or_set(self, key: str, ttl_seconds: float, loader: Callable[[], Awaitable[Any]]) -> Any:
        now = time.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if entry and entry.expires_at > now:
                return entry.value

            future = self._inflight.get(key)
            if future is None:
                future = asyncio.get_running_loop().create_future()
                self._inflight[key] = future
                is_owner = True
            else:
                is_owner = False

        if not is_owner:
            return await future

        try:
            value = await loader()
        except Exception as exc:
            async with self._lock:
                current = self._inflight.pop(key, None)
                if current and not current.done():
                    current.set_exception(exc)
            raise

        async with self._lock:
            self._entries[key] = _CacheEntry(value=value, expires_at=time.monotonic() + ttl_seconds)
            current = self._inflight.pop(key, None)
            if current and not current.done():
                current.set_result(value)

        return value

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()


public_api_cache = PublicApiCache()

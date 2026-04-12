from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float
    stale_expires_at: float


class PublicApiCache:
    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry] = {}
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._lock = asyncio.Lock()
        self._generation = 0

    async def get_or_set(
        self,
        key: str,
        ttl_seconds: float,
        loader: Callable[[], Awaitable[Any]],
        stale_while_revalidate_seconds: float = 0,
    ) -> Any:
        now = time.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if entry and entry.expires_at > now:
                return entry.value

            generation = self._generation
            future = self._inflight.get(key)
            if entry and entry.stale_expires_at > now:
                if future is None:
                    future = asyncio.get_running_loop().create_future()
                    self._inflight[key] = future
                    asyncio.create_task(
                        self._refresh_in_background(
                            key=key,
                            ttl_seconds=ttl_seconds,
                            stale_while_revalidate_seconds=stale_while_revalidate_seconds,
                            loader=loader,
                            future=future,
                            generation=generation,
                        )
                    )
                return entry.value

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
            if generation == self._generation:
                now = time.monotonic()
                self._entries[key] = _CacheEntry(
                    value=value,
                    expires_at=now + ttl_seconds,
                    stale_expires_at=now + ttl_seconds + stale_while_revalidate_seconds,
                )
            current = self._inflight.pop(key, None)
            if current and not current.done():
                current.set_result(value)

        return value

    async def _refresh_in_background(
        self,
        *,
        key: str,
        ttl_seconds: float,
        stale_while_revalidate_seconds: float,
        loader: Callable[[], Awaitable[Any]],
        future: asyncio.Future[Any],
        generation: int,
    ) -> None:
        try:
            value = await loader()
        except Exception as exc:
            async with self._lock:
                current = self._inflight.pop(key, None)
                if current and not current.done():
                    current.set_exception(exc)
            return

        async with self._lock:
            if generation == self._generation:
                now = time.monotonic()
                self._entries[key] = _CacheEntry(
                    value=value,
                    expires_at=now + ttl_seconds,
                    stale_expires_at=now + ttl_seconds + stale_while_revalidate_seconds,
                )
            current = self._inflight.pop(key, None)
            if current and not current.done():
                current.set_result(value)

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()
            self._generation += 1


public_api_cache = PublicApiCache()

import asyncio
import ipaddress
import socket
from typing import List
from urllib.parse import urlparse

import httpx

DOWNLOAD_TIMEOUT = 15.0
MAX_DOWNLOAD_SIZE = 25 * 1024 * 1024

# raced in parallel against the target URL; first to succeed wins, the rest
# are cancelled. Different sites' anti-bot/anycast edges are flaky in
# different ways, so trying a few identities at once is more reliable than
# retrying one after another.
DOWNLOAD_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
]


class DownloadError(Exception):
    pass


def _resolves_to_public_address(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


async def _guard_request(request: httpx.Request) -> None:
    # runs on the initial request AND on every redirect hop, so a redirect
    # to an internal address (docker network, cloud metadata IP, etc.) gets
    # blocked the same as a direct request to one would
    if request.url.scheme not in ("http", "https"):
        raise DownloadError(f"Unsupported URL scheme: {request.url.scheme!r}")
    hostname = request.url.host
    is_public = await asyncio.to_thread(_resolves_to_public_address, hostname)
    if not is_public:
        raise DownloadError(
            f"Refusing to fetch from a non-public address ({hostname})"
        )


async def _fetch_one(
    client: httpx.AsyncClient, url: str, user_agent: str
) -> bytes:
    headers = {"User-Agent": user_agent, "Referer": url}
    response = await client.get(url, headers=headers, timeout=DOWNLOAD_TIMEOUT)
    response.raise_for_status()
    if len(response.content) > MAX_DOWNLOAD_SIZE:
        raise DownloadError(
            f"Download exceeds maximum size ({MAX_DOWNLOAD_SIZE} bytes)"
        )
    return response.content


async def download_racing(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise DownloadError(f"Unsupported URL scheme: {parsed.scheme!r}")

    async with httpx.AsyncClient(
        follow_redirects=True,
        http2=True,
        event_hooks={"request": [_guard_request]},
    ) as client:
        tasks = [
            asyncio.create_task(_fetch_one(client, url, user_agent))
            for user_agent in DOWNLOAD_USER_AGENTS
        ]
        pending = set(tasks)
        errors: List[BaseException] = []
        try:
            while pending:
                done, pending = await asyncio.wait(
                    pending, return_when=asyncio.FIRST_COMPLETED
                )
                for task in done:
                    ex = task.exception()
                    if ex is None:
                        return task.result()
                    errors.append(ex)
        finally:
            for task in pending:
                task.cancel()

    raise DownloadError(
        "All download attempts failed: "
        + "; ".join(str(error) for error in errors)
    )

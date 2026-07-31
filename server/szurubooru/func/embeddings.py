import logging
from typing import List, Optional, Tuple

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from szurubooru import config, errors

logger = logging.getLogger(__name__)

MODEL_NAME = "dinov2-base"
VECTOR_SIZE = 768  # hidden_size of facebook/dinov2-base

_client: Optional[QdrantClient] = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(
            url=config.config["qdrant"]["endpoint"], timeout=30
        )
    return _client


def _collection_name() -> str:
    return config.config["qdrant"]["collection"]


def _embed(content: bytes) -> List[float]:
    endpoint = config.config["embedder"]["endpoint"]
    try:
        response = httpx.post(
            f"{endpoint}/embed", content=content, timeout=30
        )
    except httpx.TimeoutException as ex:
        raise errors.ThirdPartyError(
            f"Embedder service at {endpoint} timed out: {ex}"
        )
    except httpx.HTTPError as ex:
        raise errors.ThirdPartyError(
            f"Embedder service at {endpoint} is unavailable: {ex}"
        )
    if response.status_code != 200:
        raise errors.ThirdPartyError(
            "Embedder service returned an error "
            f"(HTTP {response.status_code}): {response.text}"
        )
    try:
        return response.json()["vector"]
    except (ValueError, KeyError) as ex:
        raise errors.ThirdPartyError(
            f"Embedder service returned an invalid response: {ex}"
        )


def ensure_collection() -> None:
    client = _get_client()
    collection = _collection_name()
    existing = [c.name for c in client.get_collections().collections]
    if collection not in existing:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(
                size=VECTOR_SIZE, distance=Distance.COSINE
            ),
        )


def upsert(post_id: int, content: bytes) -> None:
    vector = _embed(content)
    try:
        _get_client().upsert(
            collection_name=_collection_name(),
            wait=True,
            points=[PointStruct(id=post_id, vector=vector)],
        )
    except Exception as ex:
        raise errors.ThirdPartyError(
            f"Could not store embedding for post {post_id} in Qdrant: {ex}"
        )


def delete(post_id: int) -> None:
    try:
        _get_client().delete(
            collection_name=_collection_name(),
            points_selector=[post_id],
            wait=True,
        )
    except Exception as ex:
        logger.warning(
            "Could not delete embedding for post %d in Qdrant: %s",
            post_id,
            ex,
        )


def find_similar(
    post_id: int, offset: int, limit: int
) -> List[Tuple[int, float]]:
    client = _get_client()
    collection = _collection_name()

    try:
        points = client.retrieve(
            collection_name=collection, ids=[post_id], with_vectors=True
        )
        if not points:
            return []

        result = client.query_points(
            collection_name=collection,
            query=points[0].vector,
            offset=offset,
            # fetch one extra candidate, since the post itself is expected
            # to come back as its own closest match on the first page
            limit=limit + 1,
            score_threshold=config.config["qdrant"]["similarity_threshold"],
        )
    except Exception as ex:
        raise errors.ThirdPartyError(f"Could not query Qdrant: {ex}")

    return [
        (point.id, point.score)
        for point in result.points
        if point.id != post_id
    ][:limit]

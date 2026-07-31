# szurubooru + similar post search (Qdrant) + autotagging

This is a fork of [szurubooru](https://github.com/rr-/szurubooru) with added
search for visually similar posts, backed by the
[Qdrant](https://qdrant.tech/) vector database, plus client-side autotagging
on upload.

## What's new

- **"Similar" tab on the post page.** Next to comments, there's now a tab with
  a grid of posts that are visually similar in content — embeddings are
  computed with [DINOv2](https://github.com/facebookresearch/dinov2), rather
  than tags or the perceptual hash used by the built-in duplicate finder on
  upload.
- **New `embedder` service** — a separate microservice (FastAPI + DINOv2 /
  transformers) that computes the image vector. It runs as its own container
  rather than inside the main server, since the server image is built on
  Alpine and PyTorch doesn't publish wheels for it.
- **Qdrant vector database** — stores the embeddings and looks up nearest
  neighbors by cosine similarity, with a cutoff score
  (`qdrant.similarity_threshold` in the config).
- **Synchronous embedding generation** on post upload/edit — if `embedder` or
  `qdrant` is unreachable, the upload is blocked with a clear error instead of
  silently skipping the embedding.
- **New API endpoint** — `GET /post/{id}/similar` (behind the `posts:similar`
  privilege), with `offset`/`limit` support. See
  [doc/API.md](doc/API.md#getting-similar-posts) for details.
- The Similar tab respects the same user settings as the main post list —
  masonry layout (`Use post flow`) and endless scroll.
- **Autotagging on upload.** An "Autotagging" checkbox in the upload form runs
  each image through a tagging model (DeepDanbooru-style) *before* it's
  uploaded to the server, prefilling the new tags field and setting safety
  (Safe/Sketchy/Unsafe) from the model's predicted rating tag. Tagging runs in
  the `embedder` service, reached same-origin through an nginx proxy at
  `/tagging` — no server-side (Falcon) changes and no CORS exposure of the raw
  model endpoint. See [doc/API.md](doc/API.md#tagging-an-image) for the
  request format.
- A plain tags input field was also added to the upload form itself (it was
  previously missing — tags could only be set after upload).
- New services in `docker-compose.yml`: `qdrant` and `embedder` (the latter
  now handles both embeddings and tagging).
- Images are published to GHCR manually (`workflow_dispatch` in GitHub
  Actions), tagged with the build date (e.g. `2026.04.15`) and `latest`.

---

**The original README follows below:**

---

# szurubooru

Szurubooru is an image board engine inspired by services such as Danbooru,
Gelbooru and Moebooru dedicated for small and medium communities. Its name [has
its roots in Polish language and has onomatopeic meaning of scraping or
scrubbing](https://sjp.pwn.pl/sjp/;2527372). It is pronounced as *shoorubooru*.

## Features

- Post content: images (JPG, PNG, GIF, animated GIF), videos (MP4, WEBM), Flash animations
- Ability to retrieve web video content using [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Post comments
- Post notes / annotations, including arbitrary polygons
- Rich JSON REST API ([see documentation](doc/API.md))
- Token based authentication for clients
- Rich search system
- Rich privilege system
- Autocomplete in search and while editing tags
- Tag categories
- Tag suggestions
- Tag implications (adding a tag automatically adds another)
- Tag aliases
- Pools and pool categories
- Duplicate detection
- Post rating and favoriting; comment rating
- Polished UI
- Browser configurable endless paging
- Browser configurable backdrop grid for transparent images

## Installation

It is recommended that you use Docker for deployment.
[See installation instructions.](doc/INSTALL.md)

More installation resources, as well as related projects can be found on the
[GitHub project Wiki](https://github.com/rr-/szurubooru/wiki)

## Screenshots

Post list:

![20160908_180032_fsk](https://cloud.githubusercontent.com/assets/1045476/18356730/3f1123d6-75ee-11e6-85dd-88a7615243a0.png)

Post view:

![20160908_180429_lmp](https://cloud.githubusercontent.com/assets/1045476/18356731/3f1566ee-75ee-11e6-9594-e86ca7347b0f.png)

## License

[GPLv3](LICENSE.md).

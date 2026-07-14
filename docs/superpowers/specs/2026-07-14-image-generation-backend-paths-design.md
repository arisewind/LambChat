# Image Generation Backend Paths Design

## Goal

Allow image-edit/reference-generation calls to use image files stored in the agent runtime backend, matching `image_analyze`.

## Behavior

`input_images` accepts HTTP(S) URLs, upload URLs, data URLs, plain backend paths (absolute or relative), and `file://` backend paths. Plain and file-scheme paths are downloaded through the runtime backend and submitted to the image edit API as multipart files. URLs and data URLs preserve their existing paths.

Backend download content is bounded by the existing 20 MiB limit. Missing backends or failed downloads produce the existing image-generation error result; no fallback network request is made for a backend path.

## Testing

Tests cover absolute, relative, and file-scheme backend paths, verify bytes/name/MIME sent to the edit endpoint, and verify oversized backend files are rejected.

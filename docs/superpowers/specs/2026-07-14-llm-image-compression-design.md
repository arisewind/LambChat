# LLM Image Compression Design

## Goal

Use the configured image upload limit for LLM image preparation, compress only images larger than 5 MB into an in-memory temporary JPEG for the LLM request, and retain the original upload URL.

## Data flow

Image preparation reads `FILE_UPLOAD_MAX_SIZE_IMAGE` as its download ceiling. Files at or below 5 MB are base64 encoded unchanged. Larger files up to that configured ceiling are decoded and compressed in memory, then the temporary JPEG data URL is placed in `data_url` for the LLM request. The attachment `url` remains the original upload URL; no storage object is replaced or deleted.

## Error handling

Files above the configured upload limit are left unchanged. Decode or compression errors leave the original URL untouched. The same preparation function is used by attachment conversion and image URL middleware.

## Tests

Cover the configured ceiling, 5 MB compression threshold, temporary data URL preference in multimodal messages, and preservation of the original URL.

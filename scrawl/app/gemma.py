"""Thin wrapper around Gemma 4 on the Gemini API."""

from __future__ import annotations

import logging
import os

from google import genai
from google.genai import types

from .level import extract_json
from .prompt import PROMPT

log = logging.getLogger("scrawl")

_client: genai.Client | None = None


def model_name() -> str:
    return os.getenv("GEMMA_MODEL", "gemma-4-26b-a4b-it")


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.")
        _client = genai.Client(api_key=key)
    return _client


def _configs() -> list[types.GenerateContentConfig]:
    """Try the fast config first (thinking minimal), then a plain one.

    Some SDK/model combinations reject the thinking setting; the plain config
    is the safety net so a demo never dies on a parameter.
    """
    configs: list[types.GenerateContentConfig] = []
    try:
        configs.append(
            types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2048,
                thinking_config=types.ThinkingConfig(thinking_level="minimal"),
            )
        )
    except Exception:  # older SDKs don't know thinking_level
        pass
    configs.append(types.GenerateContentConfig(temperature=0.2, max_output_tokens=2048))
    return configs


def read_sketch(image_bytes: bytes, mime_type: str) -> dict:
    """Send the sketch photo to Gemma 4 and return the raw (unsanitized) level dict."""
    client = _get_client()
    image = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    last_error: Exception | None = None
    for config in _configs():
        try:
            response = client.models.generate_content(
                model=model_name(),
                contents=[image, PROMPT],
                config=config,
            )
            return extract_json(response.text or "")
        except ValueError as exc:  # bad JSON: retrying with the same prompt rarely helps, but try the next config once
            last_error = exc
            log.warning("Unparseable reply: %s", exc)
        except Exception as exc:  # network, quota, unsupported parameter...
            last_error = exc
            log.warning("Gemma call failed (%s), trying next config", exc)
    assert last_error is not None
    raise last_error

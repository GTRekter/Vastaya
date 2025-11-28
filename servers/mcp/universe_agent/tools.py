import json
import os
from typing import Any, Dict, Mapping, Optional, Tuple
from urllib import error as urllib_error
from urllib import parse, request as urllib_request

UNIVERSE_API_BASE_URL = os.getenv("UNIVERSE_API_BASE_URL", "http://localhost:4005/api/universe").rstrip("/")
HTTP_TIMEOUT = float(os.getenv("AGENT_HTTP_TIMEOUT", "10"))


def _format_response(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, indent=4)


def _format_url(url: str, params: Optional[Mapping[str, Any]]) -> str:
    if not params:
        return url
    query = parse.urlencode(params, doseq=True)
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"


def _decode_bytes(payload: bytes, encoding_header: Optional[str]) -> str:
    if not payload:
        return ""
    encoding = "utf-8"
    if encoding_header:
        encoding = encoding_header or encoding
    try:
        return payload.decode(encoding, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def _request_json(
    method: str,
    url: str,
    *,
    payload: Optional[Mapping[str, Any]] = None,
    params: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    full_url = _format_url(url, params)
    data: Optional[bytes] = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request_obj = urllib_request.Request(full_url, data=data, headers=headers, method=method.upper())
    try:
        with urllib_request.urlopen(request_obj, timeout=HTTP_TIMEOUT) as response:
            raw_body = response.read()
            if not raw_body:
                return {"detail": f"{method} {full_url} succeeded with no response body."}
            body_text = _decode_bytes(raw_body, response.headers.get_content_charset())
    except urllib_error.HTTPError as exc:
        detail_text = _decode_bytes(exc.read(), exc.headers.get_content_charset() if exc.headers else None)
        try:
            detail = json.loads(detail_text) if detail_text else None
        except ValueError:
            detail = detail_text or None
        return {
            "error": f"{method} {full_url} failed",
            "status": exc.code,
            "detail": detail or detail_text or exc.reason,
        }
    except urllib_error.URLError as exc:
        reason = getattr(exc, "reason", None)
        detail_text = str(reason or exc)
        return {
            "error": f"{method} {full_url} failed",
            "status": None,
            "detail": detail_text,
        }
    try:
        return json.loads(body_text)
    except ValueError:
        return {"raw": body_text}


def _load_current_config() -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    state = _request_json("GET", UNIVERSE_API_BASE_URL)
    config = state.get("config") if isinstance(state, Mapping) else None
    if isinstance(config, Mapping):
        return dict(config), state
    if isinstance(state, Mapping) and "error" not in state:
        return dict(state), state
    return None, state


def _update_config(
    updates: Mapping[str, Any],
    *,
    replace_config: bool = False,
) -> Dict[str, Any]:
    if replace_config:
        payload = updates.get("config") if "config" in updates else updates
        if not isinstance(payload, Mapping):
            return {"error": "replace_config=True requires a mapping payload."}
        return _request_json("PUT", UNIVERSE_API_BASE_URL, payload=dict(payload))
    current_config, raw_state = _load_current_config()
    if current_config is None:
        return raw_state
    merged = dict(current_config)
    merged.update(updates)
    return _request_json("PUT", UNIVERSE_API_BASE_URL, payload=merged)


def get_universe_state() -> str:
    """Return the current universe configuration snapshot."""
    return _format_response(_request_json("GET", UNIVERSE_API_BASE_URL))


def update_universe_config(updates: Dict[str, Any], replace_config: bool = False) -> str:
    """
    Persist configuration updates. When replace_config=False (default) the payload is merged
    with the current config; otherwise the provided mapping is stored as-is.
    """
    return _format_response(_update_config(updates, replace_config=replace_config))


def apply_universe_config() -> str:
    """Trigger the Universe API to apply the stored configuration."""
    return _format_response(_request_json("POST", f"{UNIVERSE_API_BASE_URL}/apply"))

def destroy_planet(planet_id: str, reason: Optional[str] = None, apply_after: bool = False) -> str:
    """
    Removes a planet by its ID from the universe configuration. Optionally applies the state.
    """
    current_config, raw_state = _load_current_config()
    if current_config is None:
        return _format_response(raw_state)
    planets = current_config.get("planets", [])
    updated_planets = [p for p in planets if p.get("id") != planet_id]
    if len(planets) == len(updated_planets):
        return _format_response({"error": f"Planet with ID '{planet_id}' not found."})
    updates: Dict[str, Any] = {
        "planets": updated_planets
    }
    if reason:
        updates["statusMessage"] = reason
    result = _update_config(updates)
    if "error" in result:
        return _format_response(result)
    if apply_after:
        result["applyResult"] = _request_json("POST", f"{UNIVERSE_API_BASE_URL}/apply")
    result["message"] = f"Planet with ID '{planet_id}' removed."
    return _format_response(result)

def destroy_all_planets(reason: Optional[str] = None, apply_after: bool = False) -> str:
    """
    Wipes the planets array and disables interplanetary features. Optionally applies the state.
    """
    updates: Dict[str, Any] = {
        "planets": [],
        "crossGalaxyEnabled": False,
        "wormholesEnabled": False,
        "shieldsEnabled": False,
        "blackHoleEnabled": True,
    }
    if reason:
        updates["statusMessage"] = reason
    result = _update_config(updates)
    if "error" in result:
        return _format_response(result)
    if apply_after:
        result["applyResult"] = _request_json("POST", f"{UNIVERSE_API_BASE_URL}/apply")
    result["message"] = "All planets removed and defensive systems disabled."
    return _format_response(result)

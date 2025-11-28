import json
import os
from typing import Any, Dict, Mapping, Optional
from urllib import error as urllib_error
from urllib import parse, request as urllib_request

FLEET_API_BASE_URL = os.getenv("FLEET_API_BASE_URL", "http://localhost:4006/api/fleet").rstrip("/")
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


def _build_endpoint(endpoint_id: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    endpoint: Dict[str, Any] = {"id": endpoint_id}
    if metadata:
        endpoint.update(metadata)
        endpoint.setdefault("displayName", metadata.get("displayName") or endpoint_id)
        endpoint.setdefault("id", endpoint_id)
    else:
        endpoint["displayName"] = endpoint_id
    return endpoint


def list_missions() -> str:
    """Return the current mission list."""
    return _format_response(_request_json("GET", f"{FLEET_API_BASE_URL}/missions"))


def get_mission(mission_id: str) -> str:
    """Fetch a single mission by id."""
    url = f"{FLEET_API_BASE_URL}/missions/{parse.quote(mission_id, safe='')}"
    return _format_response(_request_json("GET", url))


def create_mission(
    source_id: str,
    destination_id: str,
    *,
    rps: int,
    speed: str,
    escort_enabled: bool = True,
    source_metadata: Optional[Dict[str, Any]] = None,
    destination_metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Schedule a new mission between two planets.

    Optional metadata dictionaries let callers include codes, labels, or descriptions.
    """
    payload = {
        "source": _build_endpoint(source_id, source_metadata),
        "destination": _build_endpoint(destination_id, destination_metadata),
        "rps": rps,
        "speed": speed,
        "escortEnabled": escort_enabled,
    }
    return _format_response(_request_json("POST", f"{FLEET_API_BASE_URL}/missions", payload=payload))


def terminate_mission(mission_id: str) -> str:
    """Mark a mission as terminated."""
    url = f"{FLEET_API_BASE_URL}/missions/{parse.quote(mission_id, safe='')}"
    return _format_response(_request_json("DELETE", url))


def fetch_orders(planet_id: Optional[str] = None) -> str:
    """Return actionable missions, optionally filtered to a planet id."""
    params = {"planetId": planet_id} if planet_id else None
    return _format_response(_request_json("GET", f"{FLEET_API_BASE_URL}/orders", params=params))

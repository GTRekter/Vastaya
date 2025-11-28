"""Runtime application that mimics a "planet" deployed by the Spaceport.

The service exposes a FastAPI application that reflects the environment-based
configuration used by the Spaceport UI:
- NEBULA_*  variables introduce global request latency
- CHAOS_*   variables inject random errors
- The fleet API is queried to surface the currently scheduled missions
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime
import logging
import os
import random
import re
from typing import Any, Dict, List, Mapping, Optional, Tuple, Union

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


def iso_now() -> str:
    """Return the current timestamp in ISO-8601 UTC format."""

    return datetime.utcnow().isoformat()


def env_bool(name: str, default: bool = False) -> bool:
    """Parse an environment variable into a boolean."""

    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int = 0, minimum: Optional[int] = None, maximum: Optional[int] = None) -> int:
    """Parse an environment variable into an integer within optional bounds."""

    raw = os.environ.get(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def env_float(name: str, default: float = 0.0, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    """Parse an environment variable into a float within optional bounds."""

    raw = os.environ.get(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


@dataclass
class UniverseConfig:
    """In-memory configuration toggles exposed to callers."""

    cross_galaxy_enabled: bool = True
    cross_galaxy_mode: str = "gateway"
    wormholes_enabled: bool = True
    wormhole_instability: int = 0
    nebula_enabled: bool = False
    nebula_density_ms: int = 0
    shields_enabled: bool = True
    black_hole_enabled: bool = True
    chaos_experiments_enabled: bool = False
    chaos_failure_rate: float = 0.18
    fleet_api_base_url: str = "http://localhost:4006/api/fleet"
    fleet_timeout_seconds: float = 5.0
    planet_identifier: Optional[str] = None
    planet_service_template: str = "http://{planet}-service"
    mission_poll_interval_seconds: float = 5.0
    mission_dispatch_timeout_seconds: float = 5.0

    @classmethod
    def from_env(cls) -> "UniverseConfig":
        """Build a config object from the current environment."""

        mode = os.environ.get("CROSS_GALAXY_MODE", "gateway").strip().lower() or "gateway"
        if mode not in {"gateway", "mirrored", "federated"}:
            mode = "gateway"
        nebula_density_ms = env_int("NEBULA_DENSITY", default=0, minimum=0)
        return cls(
            cross_galaxy_enabled=env_bool("CROSS_GALAXY_ENABLED", default=True),
            cross_galaxy_mode=mode,
            wormholes_enabled=env_bool("WORMHOLES_ENABLED", default=True),
            wormhole_instability=env_int("WORMHOLE_INSTABILITY", default=0, minimum=0, maximum=100),
            nebula_enabled=env_bool("NEBULA_ENABLED", default=False),
            nebula_density_ms=nebula_density_ms,
            shields_enabled=env_bool("SHIELDS_ENABLED", default=True),
            black_hole_enabled=env_bool("BLACK_HOLE_ENABLED", default=False),
            chaos_experiments_enabled=env_bool("CHAOS_EXPERIMENTS_ENABLED", default=False),
            chaos_failure_rate=env_float("CHAOS_FAILURE_RATE", default=0.18, minimum=0.0, maximum=1.0),
            fleet_api_base_url=os.environ.get("FLEET_API_BASE_URL", "http://localhost:4006/api/fleet"),
            fleet_timeout_seconds=env_float("FLEET_API_TIMEOUT_SECONDS", default=5.0, minimum=0.1, maximum=30.0),
            planet_identifier=os.environ.get("PLANET_ID"),
            planet_service_template=os.environ.get("PLANET_SERVICE_TEMPLATE", "http://{planet}-service"),
            mission_poll_interval_seconds=env_float(
                "MISSION_POLL_INTERVAL_SECONDS", default=5.0, minimum=0.5, maximum=120.0
            ),
            mission_dispatch_timeout_seconds=env_float(
                "MISSION_DISPATCH_TIMEOUT_SECONDS", default=5.0, minimum=0.5, maximum=60.0
            ),
        )

    def describe(self) -> Dict[str, Any]:
        """Return a camelCase payload for the UI/diagnostics."""

        data = asdict(self)
        return {
            "crossGalaxyEnabled": data["cross_galaxy_enabled"],
            "crossGalaxyMode": data["cross_galaxy_mode"],
            "wormholesEnabled": data["wormholes_enabled"],
            "wormholeInstability": data["wormhole_instability"],
            "nebulaEnabled": data["nebula_enabled"],
            "nebulaDensity": data["nebula_density_ms"],
            "shieldsEnabled": data["shields_enabled"],
            "blackHoleEnabled": data["black_hole_enabled"],
            "chaosExperimentsEnabled": data["chaos_experiments_enabled"],
            "chaosFailureRate": data["chaos_failure_rate"],
            "fleetApiBaseUrl": data["fleet_api_base_url"],
            "fleetTimeoutSeconds": data["fleet_timeout_seconds"],
            "planetId": data["planet_identifier"],
            "planetServiceTemplate": data["planet_service_template"],
            "missionPollIntervalSeconds": data["mission_poll_interval_seconds"],
            "missionDispatchTimeoutSeconds": data["mission_dispatch_timeout_seconds"],
        }

    def nebula_delay_seconds(self) -> float:
        """Return the nebula latency budget (in seconds)."""

        if not self.nebula_enabled:
            return 0.0
        return max(0.0, self.nebula_density_ms / 1000.0)


CONFIG = UniverseConfig.from_env()
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logger = logging.getLogger("spaceport")
if not logger.handlers:
    logging.basicConfig(level=LOG_LEVEL)
logger.setLevel(LOG_LEVEL)
PROTECTED_PATHS = {"/healthz", "/readyz", "/livez"}

CARGO_ITEMS = [
    ("fusion cores", "crates"),
    ("quantum relays", "pallets"),
    ("hydroponic seeds", "canisters"),
    ("medical stims", "cases"),
    ("survey drones", "tubes"),
    ("vacuum-rated textiles", "rolls"),
]

DOCK_OPERATIONS = [
    "Requesting docking clearance",
    "Synchronizing shields",
    "Aligning cargo bay doors",
    "Unloading cargo containers",
    "Routing goods to storage rings",
    "Signing customs ledger",
]


class DockingRequest(BaseModel):
    missionId: str = Field(..., description="Identifier for the fleet mission driving this delivery.")
    source: Dict[str, Any] = Field(default_factory=dict)
    destination: Dict[str, Any] = Field(default_factory=dict)
    rps: Optional[int] = None
    speed: Optional[str] = None
    escortEnabled: Optional[bool] = None
    cargo: List[Dict[str, Any]] = Field(default_factory=list)
    sentAt: Optional[str] = None


@dataclass(frozen=True)
class SpeedProfile:
    """Describe how a fleet speed affects burst sizing and pacing."""

    key: str
    burst_multiplier: tuple[float, float]
    cooldown_seconds: tuple[float, float]

    def burst_size(self, rps: int) -> int:
        multiplier = self._sample(self.burst_multiplier)
        return max(1, int(round(rps * multiplier)))

    def cooldown(self) -> float:
        duration = self._sample(self.cooldown_seconds)
        return max(0.05, duration)

    @staticmethod
    def _sample(bounds: tuple[float, float]) -> float:
        lower, upper = bounds
        if upper <= lower:
            return lower
        return random.uniform(lower, upper)


DEFAULT_SPEED_PROFILE = SpeedProfile("cruise", (1.0, 1.0), (1.0, 1.0))
SPEED_PROFILES: Dict[str, SpeedProfile] = {
    "cruise": SpeedProfile("cruise", (0.95, 1.05), (0.9, 1.1)),
    "warp": SpeedProfile("warp", (1.75, 3.0), (1.2, 2.4)),
    "chaotic": SpeedProfile("chaotic", (0.35, 4.0), (0.35, 1.5)),
}


def resolve_speed_profile(speed: Optional[str]) -> SpeedProfile:
    """Resolve a mission speed string into a configured profile."""

    normalized = (speed or "cruise").strip().lower()
    return SPEED_PROFILES.get(normalized, DEFAULT_SPEED_PROFILE)


def sanitize_planet_slug(value: Optional[str]) -> str:
    if not value:
        return "planet"
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "planet"


def build_planet_service_base(planet_id: str) -> str:
    slug = sanitize_planet_slug(planet_id)
    template = CONFIG.planet_service_template or "{planet}"
    replacements = {
        "planet": slug,
        "planet_slug": slug,
        "slug": slug,
        "planetId": planet_id,
        "planet_id": planet_id,
    }
    base = template
    for key, value in replacements.items():
        base = base.replace(f"{{{key}}}", value)
    return base.rstrip("/") or slug


def build_docking_url(planet_id: str) -> str:
    base = build_planet_service_base(planet_id)
    return f"{base}/dock"


def get_endpoint_id(endpoint: Optional[Mapping[str, Any]]) -> str:
    if not endpoint:
        return ""
    value = endpoint.get("id") or endpoint.get("code") or endpoint.get("displayName")
    return str(value or "").strip()


def build_cargo_manifest() -> List[Dict[str, Any]]:
    items = random.sample(CARGO_ITEMS, k=random.randint(2, min(4, len(CARGO_ITEMS))))
    manifest: List[Dict[str, Any]] = []
    for label, unit in items:
        manifest.append({
            "item": label,
            "quantity": random.randint(1, 12),
            "unit": unit,
        })
    return manifest


def build_mission_signature(mission: Mapping[str, Any], destination_id: str) -> Tuple[Any, ...]:
    """Produce a signature used to determine whether a mission stream changed."""

    rps = max(1, int(mission.get("rps") or 1))
    speed = (mission.get("speed") or "cruise").strip().lower()
    escort = bool(mission.get("escortEnabled"))
    return (destination_id, rps, speed, escort)


async def send_single_docking_request(
    client: httpx.AsyncClient,
    mission: Mapping[str, Any],
    source_id: str,
    destination_id: str,
    url: str,
) -> None:
    payload = {
        "missionId": mission.get("id"),
        "source": mission.get("source") or {"id": source_id},
        "destination": mission.get("destination") or {"id": destination_id},
        "rps": mission.get("rps"),
        "speed": mission.get("speed"),
        "escortEnabled": mission.get("escortEnabled"),
        "cargo": build_cargo_manifest(),
        "sentAt": iso_now(),
    }
    response = await client.post(url, json=payload)
    response.raise_for_status()


async def emit_mission_burst(
    client: httpx.AsyncClient,
    mission: Mapping[str, Any],
    source_id: str,
    destination_id: str,
    url: str,
    burst_size: int,
) -> None:
    if burst_size <= 0:
        return
    mission_id = mission.get("id")
    attempts = [
        send_single_docking_request(client, mission, source_id, destination_id, url)
        for _ in range(burst_size)
    ]
    results = await asyncio.gather(*attempts, return_exceptions=True)
    for outcome in results:
        if isinstance(outcome, Exception):
            logger.warning(
                "Mission %s dispatch to %s failed: %s",
                mission_id,
                destination_id,
                outcome,
            )


async def stream_mission_load(
    mission: Mapping[str, Any],
    destination_id: str,
    stop_event: asyncio.Event,
) -> None:
    mission_id = mission.get("id")
    source_id = get_endpoint_id(mission.get("source")) or CONFIG.planet_identifier or "unknown"
    rps = max(1, int(mission.get("rps") or 1))
    speed_profile = resolve_speed_profile(mission.get("speed"))
    url = build_docking_url(destination_id)
    logger.info(
        "Mission %s streaming %srps (%s) toward %s",
        mission_id,
        rps,
        speed_profile.key,
        destination_id,
    )
    try:
        async with httpx.AsyncClient(timeout=CONFIG.mission_dispatch_timeout_seconds) as client:
            while not stop_event.is_set():
                burst_size = speed_profile.burst_size(rps)
                await emit_mission_burst(client, mission, source_id, destination_id, url, burst_size)
                pause = speed_profile.cooldown()
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=pause)
                    break
                except asyncio.TimeoutError:
                    continue
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("Mission %s load stream aborted: %s", mission_id, exc)
    finally:
        logger.info("Mission %s load stream stopped", mission_id)


async def ensure_mission_stream(mission: Mapping[str, Any]) -> None:
    mission_id = mission.get("id")
    if not mission_id:
        return
    destination_id = get_endpoint_id(mission.get("destination"))
    if not destination_id:
        logger.warning("Mission %s is missing a destination id", mission_id)
        return
    signature = build_mission_signature(mission, destination_id)
    handle = MISSION_LOAD_STREAMS.get(mission_id)
    if handle and handle.task.done():
        MISSION_LOAD_STREAMS.pop(mission_id, None)
        handle = None
    if handle and handle.signature == signature:
        return
    if handle:
        await stop_mission_stream(mission_id)
    stop_event = asyncio.Event()
    task = asyncio.create_task(stream_mission_load(mission, destination_id, stop_event))
    MISSION_LOAD_STREAMS[mission_id] = MissionLoadHandle(
        mission_id=mission_id,
        signature=signature,
        stop_event=stop_event,
        task=task,
    )


async def stop_mission_stream(mission_id: str) -> None:
    handle = MISSION_LOAD_STREAMS.pop(mission_id, None)
    if not handle:
        return
    handle.stop_event.set()
    try:
        await handle.task
    except asyncio.CancelledError:
        pass


async def stop_all_mission_streams() -> None:
    pending_ids = list(MISSION_LOAD_STREAMS.keys())
    for mission_id in pending_ids:
        await stop_mission_stream(mission_id)


async def sync_mission_streams(actionable: List[Mapping[str, Any]]) -> None:
    seen_ids: set[str] = set()
    for mission in actionable:
        mission_id = mission.get("id")
        if not mission_id:
            continue
        seen_ids.add(mission_id)
        await ensure_mission_stream(mission)
    for mission_id in list(MISSION_LOAD_STREAMS.keys()):
        if mission_id not in seen_ids:
            await stop_mission_stream(mission_id)


async def mission_dispatch_loop() -> None:
    if not CONFIG.planet_identifier:
        return
    interval = CONFIG.mission_poll_interval_seconds
    logger.info(
        "Mission dispatch loop active for %s (poll %.1fs)",
        CONFIG.planet_identifier,
        interval,
    )
    try:
        while True:
            try:
                result = await fetch_fleet_json("/orders", params={"planetId": CONFIG.planet_identifier})
                if not result.get("ok"):
                    logger.warning("Failed to fetch fleet orders: %s", result.get("error"))
                else:
                    missions = result["data"].get("missions", [])
                    actionable = [
                        mission
                        for mission in missions
                        if get_endpoint_id(mission.get("source")) == CONFIG.planet_identifier
                    ]
                    await sync_mission_streams(actionable)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - defensive logging for dispatcher
                logger.exception("Unexpected error while dispatching missions: %s", exc)
            await asyncio.sleep(interval)
    finally:
        await stop_all_mission_streams()


mission_dispatch_task: Optional[asyncio.Task] = None
MISSION_LOAD_STREAMS: Dict[str, "MissionLoadHandle"] = {}


@dataclass
class MissionLoadHandle:
    mission_id: str
    signature: Tuple[Any, ...]
    stop_event: asyncio.Event
    task: asyncio.Task


async def perform_docking_operations(mission: DockingRequest) -> List[Dict[str, Any]]:
    total_operations = len(DOCK_OPERATIONS)
    upper = max(3, total_operations)
    selection = min(total_operations, random.randint(3, upper)) if total_operations else 0
    steps = random.sample(DOCK_OPERATIONS, k=selection) if selection else []
    operations: List[Dict[str, Any]] = []
    for step in steps:
        delay = round(random.uniform(0.2, 1.5), 2)
        logger.info("Mission %s: %s", mission.missionId, step)
        await asyncio.sleep(delay)
        operations.append({
            "action": step,
            "durationSeconds": delay,
            "completedAt": iso_now(),
        })
    return operations


def build_fleet_url(path: str) -> str:
    base = CONFIG.fleet_api_base_url.rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}"


async def fetch_fleet_json(
    path: str, params: Optional[Mapping[str, Union[str, int, float]]] = None
) -> Dict[str, Any]:
    """Fetch JSON from the Fleet API with graceful error handling."""

    url = build_fleet_url(path)
    try:
        async with httpx.AsyncClient(timeout=CONFIG.fleet_timeout_seconds) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
            return {"ok": True, "data": payload, "source": url}
    except httpx.HTTPError as exc:  # pragma: no cover - network/HTTP edge cases
        return {
            "ok": False,
            "error": str(exc),
            "source": url,
        }


async def gather_fleet_snapshot() -> Dict[str, Any]:
    """Collect the overall missions plus optional planet-specific orders."""

    missions_task = fetch_fleet_json("/missions")
    orders_task = None
    if CONFIG.planet_identifier:
        orders_task = fetch_fleet_json("/orders", params={"planetId": CONFIG.planet_identifier})
    missions_result, orders_result = await asyncio.gather(
        missions_task,
        orders_task if orders_task else asyncio.sleep(0, result=None),
    )
    snapshot: Dict[str, Any] = {
        "missions": missions_result,
        "orders": orders_result,
        "fetchedAt": iso_now(),
    }
    return snapshot


app = FastAPI(title="Vastaya Spaceport Runtime")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def start_mission_dispatcher() -> None:
    global mission_dispatch_task
    if mission_dispatch_task is None and CONFIG.planet_identifier:
        mission_dispatch_task = asyncio.create_task(mission_dispatch_loop())
    elif not CONFIG.planet_identifier:
        logger.info("PLANET_ID not set; mission dispatch loop disabled.")


@app.on_event("shutdown")
async def stop_mission_dispatcher() -> None:
    global mission_dispatch_task
    if mission_dispatch_task:
        mission_dispatch_task.cancel()
        try:
            await mission_dispatch_task
        except asyncio.CancelledError:
            pass
        mission_dispatch_task = None
    await stop_all_mission_streams()


@app.middleware("http")
async def nebula_and_chaos(request: Request, call_next):
    """Apply latency and chaos experiments to all non-health traffic."""

    normalized_path = request.url.path.rstrip("/") or "/"
    if normalized_path not in PROTECTED_PATHS:
        delay = CONFIG.nebula_delay_seconds()
        if delay:
            await asyncio.sleep(delay)
        if CONFIG.chaos_experiments_enabled and random.random() < CONFIG.chaos_failure_rate:
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Chaos experiments triggered a simulated failure.",
                    "timestamp": iso_now(),
                    "config": {
                        "chaosExperimentsEnabled": CONFIG.chaos_experiments_enabled,
                        "chaosFailureRate": CONFIG.chaos_failure_rate,
                    },
                },
            )
    response = await call_next(request)
    return response


@app.get("/healthz")
async def healthcheck() -> Dict[str, Any]:
    """Basic health endpoint that is never impacted by chaos."""

    return {"status": "ok", "timestamp": iso_now()}


@app.get("/status")
async def status() -> Dict[str, Any]:
    """Expose the current config values and fleet snapshot."""
    snapshot = await gather_fleet_snapshot()
    return {
        "service": "spaceport",
        "timestamp": iso_now(),
        "config": CONFIG.describe(),
        "fleet": snapshot,
    }


@app.get("/missions")
async def missions_proxy() -> Mapping[str, Any]:
    """Proxy helper that mirrors the Fleet API missions endpoint."""

    result = await fetch_fleet_json("/missions")
    if result.get("ok"):
        return result["data"]
    raise HTTPException(status_code=502, detail=f"Fleet API unreachable: {result.get('error')}")


@app.post("/dock")
async def receive_cargo(payload: DockingRequest) -> Dict[str, Any]:
    """Simulate cargo handling for missions targeting this planet."""

    destination_id = get_endpoint_id(payload.destination) or CONFIG.planet_identifier or "unknown"
    origin_id = get_endpoint_id(payload.source) or "unknown"
    logger.info(
        "Receiving convoy for mission %s from %s to %s",
        payload.missionId,
        origin_id,
        destination_id,
    )
    operations = await perform_docking_operations(payload)
    cargo_quantity = sum(int(item.get("quantity", 0)) for item in payload.cargo)
    response = {
        "missionId": payload.missionId,
        "status": "completed",
        "processedAt": iso_now(),
        "planetId": destination_id,
        "operations": operations,
        "cargoProcessed": cargo_quantity,
    }
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

# Universe Configuration API
# This file defines a FastAPI application for managing and applying a configurable
# "universe state" stored in a JSON file. The code has been grouped and commented
# for clarity while preserving the original logic.

from __future__ import annotations
from collections.abc import Mapping
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict
import json
import logging
import os
import sys

# ---------------------------------------------------------------------------
# sys.path fix: move the app directory to the END of the search path so that
# `import kubernetes` resolves to the installed third-party package before
# it can accidentally find our local kubernetes.py and cause a circular import.
# This must happen before any kubernetes-related imports.
# ---------------------------------------------------------------------------
_here = str(Path(__file__).resolve().parent)
for _p in ("", _here):
    while _p in sys.path:
        sys.path.remove(_p)
    sys.path.append(_p)

from fastapi import APIRouter, Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .kubernetes import generate_apply_artifacts
except ImportError:  # pragma: no cover - running as a flat module (container)
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location(
        "universe_k8s", Path(__file__).resolve().parent / "kubernetes.py"
    )
    _mod = _ilu.module_from_spec(_spec)  # type: ignore[arg-type]
    _spec.loader.exec_module(_mod)  # type: ignore[union-attr]
    generate_apply_artifacts = _mod.generate_apply_artifacts

# =====================================================
# =============== GLOBAL CONFIGURATION ================
# =====================================================

# Path to the JSON file storing universe state
DATA_FILE = Path(__file__).with_name("universe-state.json")
# Application port configuration (default: 4005)
PORT = int(os.environ.get("PORT", "4005"))
# Base path for API routing
API_BASE = os.environ.get("API_BASE_PATH", "/api/universe")

# Default planet configuration applied automatically on first boot so that
# fleet missions can reference planets without requiring a manual UI step.
DEFAULT_BOOTSTRAP_CONFIG: Dict[str, Any] = {
    "planets": [
        {"id": "planet-a", "code": "A", "displayName": "Planet A", "type": "trade",   "description": "High-throughput, stateless service"},
        {"id": "planet-b", "code": "B", "displayName": "Planet B", "type": "archive", "description": "Slow, high-latency storage nodes"},
        {"id": "planet-c", "code": "C", "displayName": "Planet C", "type": "research","description": "Flaky service that injects failures"},
        {"id": "planet-d", "code": "D", "displayName": "Planet D", "type": "resort",  "description": "Low traffic most days with dramatic spikes"},
    ],
    "crossGalaxyEnabled": False,
    "wormholesEnabled": False,
    "wormholeInstability": 0,
    "nebulaEnabled": False,
    "nebulaDensity": 0,
    "shieldsEnabled": False,
    "blackHoleEnabled": False,
    "chaosExperimentsEnabled": False,
}

logger = logging.getLogger("uvicorn.error")

# =====================================================
# ====================== MODELS ========================
# =====================================================

class UniverseState(BaseModel):
    """
    Represents the stored universe state.
    - config: dictionary of configuration values
    - lastUpdatedAt: timestamp of last update
    - lastAppliedAt: timestamp when last applied (if any)
    """
    config: Dict[str, Any] = Field(default_factory=dict)
    lastUpdatedAt: str
    lastAppliedAt: str | None = None

# =====================================================
# ===================== UTILITIES ======================
# =====================================================

def iso_now() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.utcnow().isoformat()


def read_config_payload(value: Any) -> Dict[str, Any]:
    """
    Extracts a configuration dictionary from a payload.
    Accepts either a BaseModel or a JSON-mapping object.
    """
    if isinstance(value, BaseModel):
        value = value.model_dump()
    if isinstance(value, Mapping):
        payload = value.get("config") if "config" in value else value
        if isinstance(payload, Mapping):
            return dict(payload)
    raise HTTPException(status_code=400, detail="Config payload must be a JSON object.")


def load_state() -> UniverseState:
    """
    Loads the universe state from disk or initializes a new one.
    """
    if DATA_FILE.exists():
        try:
            payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            payload = {}
        return UniverseState(
            config=payload.get("config") or {},
            lastUpdatedAt=payload.get("lastUpdatedAt") or iso_now(),
            lastAppliedAt=payload.get("lastAppliedAt"),
        )
    # Create a new initial state
    initial_state = UniverseState(config={}, lastUpdatedAt=iso_now())
    persist_state(initial_state)
    return initial_state


def persist_state(state: UniverseState) -> None:
    """
    Saves the given universe state back to the JSON file.
    """
    DATA_FILE.write_text(state.model_dump_json(indent=2), encoding="utf-8")

# =====================================================
# ====================== API SETUP =====================
# =====================================================

universe_state = load_state()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """On first boot (no config ever applied) auto-apply the default planet set."""
    global universe_state
    if universe_state.lastAppliedAt is None and not universe_state.config:
        logger.info("No universe config applied yet — bootstrapping default planets.")
        applied_at = iso_now()
        try:
            generate_apply_artifacts(DEFAULT_BOOTSTRAP_CONFIG)
            universe_state = UniverseState(
                config=DEFAULT_BOOTSTRAP_CONFIG,
                lastUpdatedAt=applied_at,
                lastAppliedAt=applied_at,
            )
            persist_state(universe_state)
            logger.info("Bootstrap complete.")
        except Exception as exc:
            logger.error("Bootstrap apply failed: %s", exc, exc_info=True)
    yield


app = FastAPI(title="Universe configuration API", lifespan=lifespan)
# CORS configuration: allow all (customizable as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Base router
router = APIRouter(prefix=API_BASE)

# =====================================================
# ===================== API ROUTES =====================
# =====================================================

@router.get("")
async def get_universe_state() -> UniverseState:
    """Return the currently stored universe state."""
    return universe_state


@router.put("")
async def update_universe_state(body: Dict[str, Any] = Body(...)) -> UniverseState:
    """
    Update the universe configuration.
    Overwrites the stored config and updates metadata.
    """
    global universe_state
    config = read_config_payload(body)
    universe_state = UniverseState(
        config=config,
        lastUpdatedAt=iso_now(),
        lastAppliedAt=universe_state.lastAppliedAt,
    )
    persist_state(universe_state)
    return universe_state


@router.post("/apply")
async def apply_universe_state() -> Dict[str, Any]:
    """
    Apply the currently stored universe configuration.
    Generates Kubernetes artifacts/environment data and applies them.
    """
    global universe_state
    config_model = universe_state.config
    applied_at = iso_now()
    try:
        artifacts = generate_apply_artifacts(config_model)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to apply resources: {exc}") from exc
    universe_state = UniverseState(
        config=config_model,
        lastUpdatedAt=universe_state.lastUpdatedAt,
        lastAppliedAt=applied_at,
    )
    persist_state(universe_state)
    return {
        "appliedAt": applied_at,
        "config": config_model,
        **artifacts,
    }

# Register router
app.include_router(router)

# =====================================================
# =================== MAIN EXECUTION ===================
# =====================================================

if __name__ == "__main__":
    import uvicorn
    # Run the FastAPI app via Uvicorn
    uvicorn.run("servers.universe.app:app", host="0.0.0.0", port=PORT, reload=False)

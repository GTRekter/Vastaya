"""Fleet service for managing active load-generation missions."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Mapping
import json
import os
import re
import uuid

from kubernetes import client as k8s_client, config as k8s_config

from fastapi import APIRouter, Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

DATA_FILE = Path(__file__).with_name("fleet-state.json")
PORT = int(os.environ.get("PORT", "4006"))
API_BASE_PATH = os.environ.get("FLEET_API_BASE_PATH", "/api/fleet")
UNIVERSE_NAMESPACE = os.environ.get("UNIVERSE_NAMESPACE", "vastaya")


def iso_now() -> str:
    """Return an ISO-8601 timestamp in UTC."""
    return datetime.utcnow().isoformat()


class MissionEndpoint(BaseModel):
    """Planet metadata used to describe either mission endpoint."""

    id: str = Field(..., min_length=1)
    code: str | None = None
    displayName: str | None = None
    type: str | None = None
    typeLabel: str | None = None
    description: str | None = None
    image: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_endpoint(cls, value: Mapping[str, object] | str) -> Mapping[str, object]:
        """Allow payloads to pass either a string id or a mapping with metadata."""
        if isinstance(value, str):
            return {"id": value, "displayName": value}
        if isinstance(value, Mapping):
            data = dict(value)
            if "id" not in data:
                fallback = data.get("code") or data.get("displayName")
                if fallback:
                    data["id"] = str(fallback)
            return data
        raise ValueError("Mission endpoint must be a string id or an object with at least an id.")


class MissionBase(BaseModel):
    """Common mission fields."""

    rps: int = Field(..., gt=0, description="Requests per second emitted by the fleet.")
    speed: str = Field(..., min_length=1, description="Traffic pattern identifier (e.g. cruise, warp, chaotic).")
    source: MissionEndpoint
    destination: MissionEndpoint
    escortEnabled: bool = Field(default=True, description="Flag that toggles companion traffic.")

    @model_validator(mode="after")
    def validate_route(self) -> "MissionBase":
        # if self.source.id == self.destination.id:
        #     raise ValueError("Mission source and destination must be different planets.")
        return self


class Mission(MissionBase):
    """Persisted mission representation."""

    id: str = Field(..., description="Unique mission identifier.")
    status: str = Field(default="scheduled", description="Lifecycle status for the mission.")
    createdAt: str
    updatedAt: str


class MissionCreate(MissionBase):
    """Payload used to create a mission."""


class MissionList(BaseModel):
    missions: List[Mission]


class FleetState(BaseModel):
    """State stored on disk."""

    missions: List[Mission] = Field(default_factory=list)
    lastUpdatedAt: str


def load_state() -> FleetState:
    """Load missions from disk."""
    if DATA_FILE.exists():
        try:
            payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            return FleetState.model_validate(payload)
        except json.JSONDecodeError:
            pass
    initial = FleetState(missions=[], lastUpdatedAt=iso_now())
    persist_state(initial)
    return initial


def persist_state(state: FleetState) -> None:
    """Persist the entire fleet state."""
    DATA_FILE.write_text(state.model_dump_json(indent=2), encoding="utf-8")


def replace_state(missions: List[Mission]) -> FleetState:
    """Replace stored missions and persist."""
    global fleet_state
    fleet_state = FleetState(missions=missions, lastUpdatedAt=iso_now())
    persist_state(fleet_state)
    return fleet_state


fleet_state = load_state()

app = FastAPI(title="Fleet Mission Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
router = APIRouter(prefix=API_BASE_PATH)


def _get_mission(mission_id: str) -> Mission:
    for mission in fleet_state.missions:
        if mission.id == mission_id:
            return mission
    raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' was not found.")


@router.get("/missions", response_model=MissionList)
async def list_missions() -> MissionList:
    """Return all missions, newest first."""
    return MissionList(missions=fleet_state.missions)


@router.post("/missions", response_model=Mission, status_code=201)
async def create_mission(body: MissionCreate = Body(...)) -> Mission:
    """Create and persist a new mission."""
    created_at = iso_now()
    mission = Mission(
        id=str(uuid.uuid4()),
        status="scheduled",
        createdAt=created_at,
        updatedAt=created_at,
        **body.model_dump(),
    )
    replace_state([mission, *fleet_state.missions])
    return mission


@router.get("/missions/{mission_id}", response_model=Mission)
async def get_mission(mission_id: str) -> Mission:
    """Fetch a single mission by id."""
    return _get_mission(mission_id)


@router.delete("/missions/{mission_id}", response_model=Mission)
async def terminate_mission(mission_id: str) -> Mission:
    """Mark a mission as terminated."""
    mission = _get_mission(mission_id)
    updated = mission.model_copy(update={"status": "terminated", "updatedAt": iso_now()})
    updated_list = [updated if item.id == mission_id else item for item in fleet_state.missions]
    replace_state(updated_list)
    return updated


def _planet_slug(planet_id: str) -> str:
    """Convert a planet id to a Kubernetes-safe label value (mirrors universe/kubernetes.py)."""
    slug = re.sub(r"[^a-z0-9]+", "-", planet_id.lower()).strip("-")
    return slug or "planet"


def _k8s_core_v1() -> k8s_client.CoreV1Api:
    """Return a Kubernetes CoreV1Api, loading in-cluster config or local kubeconfig."""
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api()


@router.get("/missions/{mission_id}/logs")
async def get_mission_logs(mission_id: str) -> dict:
    """Return recent pod logs for the planets involved in a mission."""
    mission = _get_mission(mission_id)
    lines: List[dict] = []

    try:
        v1 = _k8s_core_v1()
    except Exception as exc:
        return {"lines": [{"source": "system", "role": "system", "text": f"[k8s config error: {exc}]"}], "missionId": mission_id}

    for endpoint, role in [(mission.source, "source"), (mission.destination, "destination")]:
        planet_slug = _planet_slug(endpoint.id)
        label_selector = f"universe.vastaya.dev/planet={planet_slug}"
        display = endpoint.displayName or endpoint.id
        try:
            pod_list = v1.list_namespaced_pod(namespace=UNIVERSE_NAMESPACE, label_selector=label_selector)
            if not pod_list.items:
                lines.append({"source": display, "role": role, "text": f"[no pods found matching {label_selector}]"})
                continue
            for pod in pod_list.items:
                log_text = v1.read_namespaced_pod_log(
                    name=pod.metadata.name,
                    namespace=UNIVERSE_NAMESPACE,
                    tail_lines=50,
                    timestamps=True,
                ) or ""
                for raw in log_text.splitlines():
                    lines.append({"source": display, "role": role, "text": raw})
        except Exception as exc:
            lines.append({"source": display, "role": role, "text": f"[error: {exc}]"})

    return {"lines": lines, "missionId": mission_id}


@router.get("/orders", response_model=MissionList)
async def fetch_orders(planet_id: str | None = Query(default=None, alias="planetId")) -> MissionList:
    """
    Provide the current set of actionable missions.

    Planets poll this endpoint to determine which routes they should service.
    """
    actionable = [mission for mission in fleet_state.missions if mission.status in {"scheduled", "running"}]
    if planet_id:
        actionable = [
            mission
            for mission in actionable
            if mission.source.id == planet_id or mission.destination.id == planet_id
        ]
    return MissionList(missions=actionable)


app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("servers.fleet.app:app", host="0.0.0.0", port=PORT, reload=False)

from __future__ import annotations
import asyncio
import json
import os
from typing import Any, Dict, Optional
from fastmcp import FastMCP
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
from fleet_agent import tools as fleet_tools  # type: ignore
from universe_agent.agent import root_agent as universe_agent  # type: ignore
from universe_agent import tools as universe_tools  # type: ignore
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

MCP_NAME = "Vastaya Control Tower"
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "3002"))
MCP_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("MCP_ALLOW_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

mcp = FastMCP(MCP_NAME)
AGENT_APP_NAME = os.getenv("MCP_AGENT_APP_NAME", "vastaya-mcp-agent")
AGENT_USER_ID = os.getenv("MCP_AGENT_USER_ID", "web-ui")
AGENT_SESSION_ID = os.getenv("MCP_AGENT_SESSION_ID", "web-session")

session_service = InMemorySessionService()
runner = Runner(
    app_name=AGENT_APP_NAME,
    agent=universe_agent,
    session_service=session_service,
)
agent_lock = asyncio.Lock()

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=MCP_ALLOW_ORIGINS,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=[
            "mcp-protocol-version",
            "mcp-session-id",
            "Authorization",
            "Content-Type",
        ],
        expose_headers=["mcp-session-id"],
    )
]

async def ensure_agent_session(session_id: str) -> None:
    existing = await session_service.get_session(
        app_name=AGENT_APP_NAME,
        user_id=AGENT_USER_ID,
        session_id=session_id,
    )
    if existing:
        return
    await session_service.create_session(
        app_name=AGENT_APP_NAME,
        user_id=AGENT_USER_ID,
        session_id=session_id,
    )


def content_to_text(content: Optional[types.Content]) -> str:
    if not content:
        return ""
    parts = []
    if content.parts:
        for part in content.parts:
            if getattr(part, "text", None):
                parts.append(part.text)
            elif getattr(part, "function_call", None):
                parts.append(f"[function call] {part.function_call.name}")
            elif getattr(part, "function_response", None):
                parts.append(
                    f"[function response] {part.function_response.name}: "
                    f"{part.function_response.response}"
                )
            elif getattr(part, "code_execution_result", None):
                result = part.code_execution_result
                output = getattr(result, "output", None) or getattr(
                    result, "stdout", None
                )
                if output:
                    parts.append(str(output))
    return "\n".join([p for p in parts if p]) or (getattr(content, "text", "") or "")

async def run_agent_chat(message: str, session_id: str) -> str:
    await ensure_agent_session(session_id)
    final_response = ""
    user_message = types.Content(role="user", parts=[types.Part(text=message)])

    async for event in runner.run_async(
        user_id=AGENT_USER_ID,
        session_id=session_id,
        new_message=user_message,
    ):
        if event.author != AGENT_USER_ID and event.is_final_response():
            final_response = content_to_text(event.content) or final_response

    return final_response or "The agent did not return any text."


@mcp.tool
async def chat(message: str, session_id: Optional[str] = None) -> str:
    """
    Route chat requests through the Gemini agent so it thinks before calling tools.

    The session id is optional; when omitted, a shared in-memory session is used.
    """
    message = message.strip()
    if not message:
        raise ValueError("A message is required.")

    resolved_session = (session_id or AGENT_SESSION_ID).strip() or AGENT_SESSION_ID
    async with agent_lock:
        return await run_agent_chat(message, resolved_session)


@mcp.tool
def get_universe_state() -> str:
    """Return the current universe configuration snapshot."""
    return universe_tools.get_universe_state()


@mcp.tool
def update_universe_config(updates: Dict[str, Any], replace_config: bool = False) -> str:
    """
    Merge configuration updates into the stored universe config.

    Set replace_config=True to overwrite the entire config payload.
    """
    return universe_tools.update_universe_config(updates, replace_config=replace_config)


@mcp.tool
def apply_universe_config() -> str:
    """Trigger the Universe API to apply the stored configuration."""
    return universe_tools.apply_universe_config()


@mcp.tool
def destroy_all_planets(reason: Optional[str] = None, apply_after: bool = False) -> str:
    """
    Wipes the planets array and disables cross-galaxy features.

    Optionally propagate the changes immediately with apply_after=True.
    """
    return universe_tools.destroy_all_planets(reason=reason, apply_after=apply_after)


@mcp.tool
def list_missions() -> str:
    """List all currently tracked missions, newest first."""
    return fleet_tools.list_missions()


@mcp.tool
def get_mission(mission_id: str) -> str:
    """Fetch a single mission by id."""
    return fleet_tools.get_mission(mission_id)


@mcp.tool
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
    """Schedule a new mission between two planets."""
    return fleet_tools.create_mission(
        source_id=source_id,
        destination_id=destination_id,
        rps=rps,
        speed=speed,
        escort_enabled=escort_enabled,
        source_metadata=source_metadata,
        destination_metadata=destination_metadata,
    )


@mcp.tool
def terminate_mission(mission_id: str) -> str:
    """Mark a mission as terminated."""
    return fleet_tools.terminate_mission(mission_id)


@mcp.tool
def fetch_orders(planet_id: Optional[str] = None) -> str:
    """Return actionable missions, optionally filtered by planet id."""
    return fleet_tools.fetch_orders(planet_id=planet_id)

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT, middleware=middleware)

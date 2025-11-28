import os
from typing import Callable, List
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams

from .instructions import fleet_agent_instruction
from .tools import (
    create_mission,
    fetch_orders,
    get_mission,
    list_missions,
    terminate_mission,
)

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL_NAME = os.getenv("AGENT_MODEL", "gemini-2.0-flash")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3002")

FLEET_TOOLS: List[Callable] = [
    list_missions,
    get_mission,
    create_mission,
    terminate_mission,
    fetch_orders,
]
FLEET_TOOL_NAMES = [tool.__name__ for tool in FLEET_TOOLS]

tool_set = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=f"{MCP_SERVER_URL.rstrip('/')}/mcp"
    ),
    tool_filter=FLEET_TOOL_NAMES,
)

fleet_agent = Agent(
    name="fleet_agent",
    model=MODEL_NAME,
    description="Plan and monitor fleet missions.",
    instruction=fleet_agent_instruction,
    # tools=FLEET_TOOLS,
    tools=[tool_set],
)

root_agent = fleet_agent

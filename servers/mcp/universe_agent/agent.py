import os
from typing import Callable, List
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams

from fleet_agent.agent import fleet_agent
from .instructions import universe_agent_instruction
from .tools import (
    apply_universe_config,
    destroy_all_planets,
    get_universe_state,
    update_universe_config,
    destroy_planet
)

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL_NAME = os.getenv("AGENT_MODEL", "gemini-2.0-flash")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3002")

UNIVERSE_TOOLS: List[Callable] = [
    get_universe_state,
    update_universe_config,
    apply_universe_config,
    destroy_all_planets,
    destroy_planet
]
UNIVERSE_TOOL_NAMES = [tool.__name__ for tool in UNIVERSE_TOOLS]

tool_set = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=f"{MCP_SERVER_URL.rstrip('/')}/mcp"
    ),
    tool_filter=UNIVERSE_TOOL_NAMES,
)

universe_agent = Agent(
    name="universe_agent",
    model=MODEL_NAME,
    description="Inspect and manipulate the universe configuration.",
    instruction=universe_agent_instruction,
    # tools=UNIVERSE_TOOLS,
    tools=[tool_set],
    sub_agents=[fleet_agent]
)

root_agent = universe_agent

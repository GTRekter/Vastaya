import asyncio
from typing import Any, Dict, Optional
import os

from dotenv import load_dotenv
from fastapi import APIRouter, Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from google.adk.agents import Agent as GoogleAgent
from google.adk.runners import Runner as GoogleRunner
from google.adk.sessions.in_memory_session_service import InMemorySessionService as GoogleInMemorySessionService
from google.adk.tools.mcp_tool import MCPToolset as GoogleMCPToolset
from google.adk.tools.mcp_tool import StreamableHTTPConnectionParams as GoogleStreamableHTTPConnectionParams
from google.genai import types

load_dotenv()

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3002/mcp")
PORT = int(os.environ.get("PORT", "3100"))
GOOGLE_MODEL = os.getenv("AGENT_MODEL_GOOGLE", "gemini-2.0-flash")
PROVIDER_ID = "google"
APP_NAME = "vastaya-google"
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_GENAI_API_KEY")
GOOGLE_VERTEX_PROJECT = os.getenv("GOOGLE_VERTEX_PROJECT") or os.getenv("VERTEX_PROJECT")
GOOGLE_VERTEX_LOCATION = os.getenv("GOOGLE_VERTEX_LOCATION") or os.getenv("VERTEX_LOCATION")

DEFAULT_INSTRUCTION = (
    "You are the Vastaya agent interface. Think out loud, then call MCP tools "
    "to answer the user's request. Return a concise final answer after tools complete."
)

app = FastAPI(title="Control Tower Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    provider: str
    session_id: str

session_service: Optional[Any] = None
runner: Optional[Any] = None
lock = asyncio.Lock()


def ensure_google_credentials() -> None:
    # The Google GenAI client requires either an API key or Vertex AI project + location.
    if not GOOGLE_API_KEY and not (GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION):
        raise RuntimeError(
            "Google credentials are missing. Set GOOGLE_API_KEY (or GOOGLE_GENAI_API_KEY) "
            "or configure GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION."
        )


def build_agent() -> Any:
    ensure_google_credentials()
    tool_set = GoogleMCPToolset(
        connection_params=GoogleStreamableHTTPConnectionParams(url=MCP_SERVER_URL.rstrip("/"))
    )
    return GoogleAgent(
        name=f"{PROVIDER_ID}_agent",
        model=GOOGLE_MODEL,
        description="Google agent that calls MCP tools",
        instruction=DEFAULT_INSTRUCTION,
        tools=[tool_set],
    )


def get_runner() -> Any:
    global session_service, runner
    if session_service is None:
        session_service = GoogleInMemorySessionService()
    if runner is None:
        agent = build_agent()
        runner = GoogleRunner(
            app_name=APP_NAME,
            agent=agent,
            session_service=session_service,
        )
    return runner


async def ensure_session(session_id: str) -> None:
    existing = await session_service.get_session(
        app_name=APP_NAME,
        user_id="web-ui",
        session_id=session_id,
    )
    if existing:
        return
    await session_service.create_session(
        app_name=APP_NAME,
        user_id="web-ui",
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
                fn = part.function_response
                parts.append(f"[function response] {fn.name}: {fn.response}")
            elif getattr(part, "code_execution_result", None):
                result = part.code_execution_result
                output = getattr(result, "output", None) or getattr(result, "stdout", None)
                if output:
                    parts.append(str(output))
    return "\n".join([p for p in parts if p]) or (getattr(content, "text", "") or "")


async def run_agent_chat(message: str, session_id: str) -> str:
    runner = get_runner()
    await ensure_session(session_id)

    final_response = ""
    user_message = types.Content(role="user", parts=[types.Part(text=message)])

    async for event in runner.run_async(
        user_id="web-ui",
        session_id=session_id,
        new_message=user_message,
    ):
        if event.author != "web-ui" and event.is_final_response():
            final_response = content_to_text(event.content) or final_response

    return final_response or "The agent did not return any text."


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="A message is required.")

    session_id = (request.session_id or f"default-{PROVIDER_ID}").strip() or f"default-{PROVIDER_ID}"

    try:
        runner = get_runner()
    except RuntimeError as exc:
        # Surface missing SDKs or similar setup issues as a client-visible error.
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    async with lock:
        content = await run_agent_chat(message, session_id)

    return ChatResponse(content=content, provider=PROVIDER_ID, session_id=session_id)


@app.get("/healthz")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("servers.control-tower.app:app", host="0.0.0.0", port=PORT, reload=False)

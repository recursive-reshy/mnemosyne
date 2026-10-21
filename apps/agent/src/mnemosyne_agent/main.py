import hmac
import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from mnemosyne_agent.claude import AnthropicClaude, ClaudeClient
from mnemosyne_agent.config import Settings, load_settings
from mnemosyne_agent.contract.link import InstructionsResponse
from mnemosyne_agent.linker.instructions import build_instructions

logger = logging.getLogger( "mnemosyne_agent" )

def create_secret_check( settings: Settings ) -> Callable[ [ str | None ], Awaitable[ None ] ]:
    expected = f"Bearer {settings.agent_secret}".encode()

    async def check_secret( authorization: Annotated[ str | None, Header() ] = None ) -> None:
        if authorization is None or not hmac.compare_digest( authorization.encode(), expected ):
            raise HTTPException( status_code = 401, detail = "unauthorized" )

    return check_secret

def create_app( settings: Settings, claude: ClaudeClient ) -> FastAPI:
    app = FastAPI( docs_url = None, redoc_url = None, openapi_url = None )
    app.state.claude = claude

    @app.middleware( "http" )
    async def log_request( request: Request, call_next: Callable[ [ Request ], Awaitable[ Response ] ] ) -> Response:
        started = time.perf_counter()
        response = await call_next( request )
        duration = ( time.perf_counter() - started ) * 1000
        logger.info( f"{request.method} {request.url.path} {response.status_code} {duration:.0f}ms" )

        return response

    @app.get( "/health" )
    def read_health() -> JSONResponse:
        try:
            next( settings.vault_path.iterdir(), None )
        except OSError:
            return JSONResponse( status_code = 503, content = { "status": "error", "vault": "unreadable" } )

        return JSONResponse( content = { "status": "ok", "vault": "readable" } )

    v1 = APIRouter( prefix = "/v1", dependencies = [ Depends( create_secret_check( settings ) ) ] )

    @v1.get( "/link/instructions" )
    def read_instructions() -> InstructionsResponse:
        return InstructionsResponse( instructions = build_instructions( settings.max_suggestions ) )

    app.include_router( v1 )

    return app

def __getattr__( name: str ) -> FastAPI:
    if name != "app":
        raise AttributeError( f"module {__name__!r} has no attribute {name!r}" )

    handler = logging.StreamHandler()
    handler.setFormatter( logging.Formatter( "%(asctime)s %(levelname)s %(message)s" ) )
    logger.addHandler( handler )
    logger.setLevel( logging.INFO )

    settings = load_settings( os.environ )

    return create_app( settings, AnthropicClaude( settings.anthropic_api_key ) )

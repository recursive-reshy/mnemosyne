import importlib
import logging
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from mnemosyne_agent import main
from mnemosyne_agent.claude import AnthropicClaude
from mnemosyne_agent.config import ConfigError, Settings
from mnemosyne_agent.main import create_app, create_secret_check
from tests.fakes import ScriptedClaude

def test_health_is_ok_without_auth( settings: Settings, app_factory: Callable[ [ Settings ], FastAPI ] ) -> None:
    response = TestClient( app_factory( settings ) ).get( "/health" )

    assert response.status_code == 200
    assert response.json() == { "status": "ok", "vault": "readable" }

def test_health_is_unavailable_when_the_vault_cannot_be_listed(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ]
) -> None:
    client = TestClient( app_factory( settings ) )
    shutil.rmtree( settings.vault_path )

    response = client.get( "/health" )

    assert response.status_code == 503
    assert response.json() == { "status": "error", "vault": "unreadable" }

@pytest.mark.parametrize( "path", [ "/docs", "/redoc", "/openapi.json" ] )
def test_documentation_routes_are_off(
    path: str,
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ]
) -> None:
    assert TestClient( app_factory( settings ) ).get( path ).status_code == 404

def make_guarded_client( settings: Settings ) -> TestClient:
    guarded = FastAPI()

    @guarded.get( "/guarded" )
    def read_guarded( _: Annotated[ None, Depends( create_secret_check( settings ) ) ] ) -> dict[ str, bool ]:
        return { "ok": True }

    return TestClient( guarded )

def test_the_secret_check_lets_the_right_secret_through(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    response = make_guarded_client( settings ).get( "/guarded", headers = auth_headers )

    assert response.status_code == 200

@pytest.mark.parametrize(
    "headers",
    [
        {},
        { "Authorization": "Bearer wrong" },
        { "Authorization": "Basic " + "s" * 32 },
        { "Authorization": "s" * 32 }
    ]
)
def test_the_secret_check_rejects_everything_else( headers: dict[ str, str ], settings: Settings ) -> None:
    response = make_guarded_client( settings ).get( "/guarded", headers = headers )

    assert response.status_code == 401
    assert response.json() == { "detail": "unauthorized" }

def test_logs_one_line_per_request_without_secrets_or_content(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ],
    caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level( logging.INFO, logger = "mnemosyne_agent" )
    client = TestClient( app_factory( settings ) )

    client.post(
        "/health?token=query-sentinel",
        content = "body-sentinel",
        headers = { "Authorization": f"Bearer {settings.agent_secret}" }
    )

    assert len( caplog.records ) == 1
    line = caplog.records[ 0 ].getMessage()

    assert "/health" in line
    assert "405" in line
    assert "ms" in line

    for forbidden in [ settings.agent_secret, settings.anthropic_api_key, "query-sentinel", "body-sentinel" ]:
        assert forbidden not in caplog.text

def test_importing_main_does_not_read_the_environment( monkeypatch: pytest.MonkeyPatch ) -> None:
    for name in [ "ANTHROPIC_API_KEY", "AGENT_SECRET", "VAULT_PATH" ]:
        monkeypatch.delenv( name, raising = False )

    reloaded = importlib.reload( main )

    with pytest.raises( ConfigError, match = "ANTHROPIC_API_KEY" ):
        _ = reloaded.app

def test_the_module_level_app_is_built_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
    fixture_vault: Path
) -> None:
    monkeypatch.setenv( "ANTHROPIC_API_KEY", "sk-test-key" )
    monkeypatch.setenv( "AGENT_SECRET", "s" * 32 )
    monkeypatch.setenv( "VAULT_PATH", str( fixture_vault ) )

    assert TestClient( main.app ).get( "/health" ).status_code == 200

def test_the_module_level_app_uses_the_anthropic_client(
    monkeypatch: pytest.MonkeyPatch,
    fixture_vault: Path
) -> None:
    monkeypatch.setenv( "ANTHROPIC_API_KEY", "sk-test-key" )
    monkeypatch.setenv( "AGENT_SECRET", "s" * 32 )
    monkeypatch.setenv( "VAULT_PATH", str( fixture_vault ) )

    assert isinstance( main.app.state.claude, AnthropicClaude )

def test_create_app_keeps_the_claude_client_it_is_given( settings: Settings ) -> None:
    claude = ScriptedClaude( [] )

    assert create_app( settings, claude ).state.claude is claude

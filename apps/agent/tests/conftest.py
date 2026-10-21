import shutil
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI

from mnemosyne_agent.config import Settings
from mnemosyne_agent.main import create_app
from tests.fakes import ScriptedClaude

FIXTURE_VAULT = Path( __file__ ).parent / "fixtures" / "vault"

@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"

@pytest.fixture
def fixture_vault() -> Path:
    return FIXTURE_VAULT

@pytest.fixture
def vault_copy( tmp_path: Path ) -> Path:
    vault = tmp_path / "vault"
    shutil.copytree( FIXTURE_VAULT, vault )
    return vault

@pytest.fixture
def settings( vault_copy: Path ) -> Settings:
    return Settings( anthropic_api_key = "test-api-key", agent_secret = "s" * 32, vault_path = vault_copy )

@pytest.fixture
def auth_headers( settings: Settings ) -> dict[ str, str ]:
    return { "Authorization": f"Bearer {settings.agent_secret}" }

@pytest.fixture
def app_factory() -> Callable[ [ Settings ], FastAPI ]:
    return lambda settings: create_app( settings, ScriptedClaude( [] ) )

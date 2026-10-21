import shutil
from pathlib import Path

import pytest

FIXTURE_VAULT = Path( __file__ ).parent / "fixtures" / "vault"

@pytest.fixture
def fixture_vault() -> Path:
    return FIXTURE_VAULT

@pytest.fixture
def vault_copy( tmp_path: Path ) -> Path:
    vault = tmp_path / "vault"
    shutil.copytree( FIXTURE_VAULT, vault )
    return vault

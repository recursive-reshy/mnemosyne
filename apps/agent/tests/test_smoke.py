from mnemosyne_agent import main

def test_package_imports_and_exposes_main() -> None:
    assert callable( main )

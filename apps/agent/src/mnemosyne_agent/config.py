from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel

SECRET_MINIMUM_LENGTH = 32

LIMIT_DEFAULTS: dict[ str, int ] = {
    "max_turns": 12,
    "max_tool_calls": 24,
    "max_output_tokens": 4096,
    "run_timeout_seconds": 90,
    "max_suggestions": 8,
    "list_notes_limit": 500,
    "search_hits_limit": 20,
    "search_snippet_chars": 200,
    "read_note_chars": 8000,
    "link_targets_limit": 500
}

class ConfigError( Exception ):
    pass

class Settings( BaseModel ):
    anthropic_api_key: str
    agent_secret: str
    vault_path: Path
    max_turns: int = LIMIT_DEFAULTS[ "max_turns" ]
    max_tool_calls: int = LIMIT_DEFAULTS[ "max_tool_calls" ]
    max_output_tokens: int = LIMIT_DEFAULTS[ "max_output_tokens" ]
    run_timeout_seconds: int = LIMIT_DEFAULTS[ "run_timeout_seconds" ]
    max_suggestions: int = LIMIT_DEFAULTS[ "max_suggestions" ]
    list_notes_limit: int = LIMIT_DEFAULTS[ "list_notes_limit" ]
    search_hits_limit: int = LIMIT_DEFAULTS[ "search_hits_limit" ]
    search_snippet_chars: int = LIMIT_DEFAULTS[ "search_snippet_chars" ]
    read_note_chars: int = LIMIT_DEFAULTS[ "read_note_chars" ]
    link_targets_limit: int = LIMIT_DEFAULTS[ "link_targets_limit" ]

def load_settings( environ: Mapping[ str, str ] ) -> Settings:
    problems: list[ str ] = []
    api_key = environ.get( "ANTHROPIC_API_KEY", "" )
    secret = environ.get( "AGENT_SECRET", "" )
    vault_value = environ.get( "VAULT_PATH", "" )

    if not api_key:
        problems.append( "ANTHROPIC_API_KEY is required" )

    if len( secret ) < SECRET_MINIMUM_LENGTH:
        problems.append( f"AGENT_SECRET is required and must be at least {SECRET_MINIMUM_LENGTH} characters" )

    if not vault_value:
        problems.append( "VAULT_PATH is required" )
    elif not Path( vault_value ).is_dir():
        problems.append( "VAULT_PATH must be an existing directory" )

    limits: dict[ str, int ] = {}

    for name in LIMIT_DEFAULTS:
        variable = f"AGENT_{name.upper()}"

        if variable not in environ:
            continue

        value = environ[ variable ]

        if not value.isdecimal() or int( value ) < 1:
            problems.append( f"{variable} must be a positive whole number" )
            continue

        limits[ name ] = int( value )

    if problems:
        raise ConfigError( f"Invalid configuration: {'; '.join( problems )}" )

    return Settings( anthropic_api_key = api_key, agent_secret = secret, vault_path = Path( vault_value ), **limits )

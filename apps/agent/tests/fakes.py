from mnemosyne_agent.claude import ClaudeError, MessageReply, MessageRequest

class ScriptedClaude:
    def __init__( self, script: list[ MessageReply | ClaudeError ] ) -> None:
        self.script = list( script )
        self.requests: list[ MessageRequest ] = []

    async def create_message( self, request: MessageRequest ) -> MessageReply:
        self.requests.append( request )

        if not self.script:
            raise AssertionError( f"ScriptedClaude has no reply left for request {len( self.requests )}" )

        next_item = self.script.pop( 0 )

        if isinstance( next_item, ClaudeError ):
            raise next_item

        return next_item

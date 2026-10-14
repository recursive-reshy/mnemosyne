# ops

## whisper-server (launchd agent)

Install and start at login:

```sh
cp ops/com.naresh.whisper-server.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.naresh.whisper-server.plist
```

Check it:

```sh
launchctl print gui/$(id -u)/com.naresh.whisper-server
curl http://127.0.0.1:8178
```

Logs are in `~/Library/Logs/whisper-server.log`.

Stop and remove it:

```sh
launchctl bootout gui/$(id -u)/com.naresh.whisper-server
rm ~/Library/LaunchAgents/com.naresh.whisper-server.plist
```

## The app (Docker)

```sh
docker compose up -d
curl http://localhost:3100/api/health
```

Stop it with `docker compose stop`, and remove the container with `docker compose down`.

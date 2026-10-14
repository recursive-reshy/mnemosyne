#!/bin/sh
set -u

if ! yt-dlp -U; then
  echo "Warning: could not update yt-dlp; continuing with the installed version" >&2
fi

exec "$@"

# Phone access

Review in Melete from your phone while the app keeps running on your Mac. This guide uses [Tailscale](https://tailscale.com): a private network between your own devices, with `tailscale serve` giving the app a private HTTPS address that only your tailnet can reach (ADR 0060). Nothing in Mnemosyne depends on Tailscale; this is setup on the Mac and phone only.

Checked against Tailscale's documentation on 2026-10-23 (Serve, HTTPS certificates, machine names, CLI reference). If a command or menu name below no longer matches, trust Tailscale's docs and fix this file.

## What you get
- The app is published by Docker on `127.0.0.1:3100` only, so other machines on your Wi-Fi can't connect. `http://localhost:3100` on the Mac works as before.
- `tailscale serve` forwards a private `https://<machine>.<tailnet>.ts.net` address to that port. Only devices signed in to your tailnet can open it.
- Adding that address to your home screen opens Mnemosyne full-screen on Melete. There is no offline mode: grading needs the Mac, so the Mac must be awake and online.
- There is no login. The tailnet is the only protection, so keep **Funnel off** (below).

## Set up

1. **Install Tailscale** on the Mac and on the phone, and sign in to the same tailnet on both.
2. **Choose a machine name that reveals nothing.** When Serve gets its certificate, the machine's full name goes into public Certificate Transparency logs, where anyone can read it. The tailnet name hides your account, but the machine name is visible, so don't use your name, employer or anything private. To rename the Mac, either run `tailscale set --hostname=<name>`, or open the **Machines** page of the [admin console](https://login.tailscale.com/admin/machines), open the menu on the machine's row and choose **Edit machine name** (untick **Auto-generate from OS hostname** to keep your name). Do this before step 3.
3. **Turn on MagicDNS and HTTPS** in the admin console, on the [DNS page](https://login.tailscale.com/admin/dns): enable **MagicDNS** if it is off, then under **HTTPS Certificates** choose **Enable HTTPS** and acknowledge that machine names are published.
4. **Start Mnemosyne** on the Mac (`docker compose up -d`), then publish it to the tailnet:

   ```sh
   tailscale serve --bg 3100
   ```

   `--bg` keeps it running in the background, across reboots. The command prints the address, of the form `https://<machine>.<tailnet>.ts.net`. If `tailscale` isn't found in Terminal, the macOS app's command line tool is inside the app bundle; see Tailscale's macOS CLI instructions.
5. **Check it:** `tailscale serve status` lists what is published. Open the address on the phone (Tailscale must be on there too).
6. **Add it to the home screen.** Safari: Share → **Add to Home Screen**. Chrome: menu → **Add to Home screen** (or **Install app**). It opens full-screen as "Mnemosyne", starting on Melete.

To undo it: `tailscale serve reset` clears the Serve configuration.

## Keep Funnel off
Funnel would put the app on the public internet with no login. Never run `tailscale funnel`. It is off unless you turn it on; `tailscale funnel status` shows whether anything is exposed and `tailscale funnel reset` clears it.

## Keep the Mac awake
The phone can only review while the Mac is awake and online. On a Mac laptop: System Settings → **Battery** → **Options** → turn on **Prevent automatic sleeping on power adapter when the display is off**, and leave it plugged in. On a desktop Mac the same switch is under System Settings → **Energy**. The menu names change between macOS versions; if you can't find it, search System Settings for "sleeping".

## Gmail
Gmail is still connected from the Mac, at `http://localhost:3100` (Settings → Sources). Google's sign-in redirects to a `localhost` address, so don't connect Gmail from the phone. Once connected, the poller runs on the Mac as usual.

## When the phone can't reach it
- **The page doesn't load or times out:** the Mac is asleep, offline, or Tailscale is off on the Mac or the phone. Wake the Mac, check the Tailscale app on both.
- **"Can't connect" with Tailscale on:** the container is down. On the Mac run `docker compose ps`, and `docker compose up -d` if needed. Check `http://localhost:3100/api/health` on the Mac.
- **Serve isn't running:** `tailscale serve status` shows nothing. Run `tailscale serve --bg 3100` again.
- **A certificate error:** HTTPS isn't enabled yet (step 3), or the machine was renamed after Serve was set up. Run `tailscale serve reset`, then step 4 again.
- **Grading fails but the question shows:** the Mac can't reach the Claude API. Rate yourself from the reference answer; the failure is logged on the Mac.

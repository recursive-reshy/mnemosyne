# Phone access

Review in Melete from your phone, or let another person use the app, while it keeps running on your Mac. This guide uses [Tailscale](https://tailscale.com): a private network between your own devices, with `tailscale serve` giving the app a private HTTPS address that only your tailnet can reach (ADR 0060). Nothing in Mnemosyne depends on Tailscale; this is setup on the Mac and phone only.

Checked against Tailscale's documentation on 2026-10-23 (Serve, HTTPS certificates, machine names, CLI reference). The section on sharing the app with another person was written from the app's side only and has **not** been checked against Tailscale's documentation or tried yet (release check 8.4); if a menu name there is wrong, trust Tailscale's docs and fix this file. If a command or menu name elsewhere no longer matches, do the same.

## What you get
- The app is published by Docker on `127.0.0.1:3100` only, so other machines on your Wi-Fi can't connect. `http://localhost:3100` on the Mac works as before.
- `tailscale serve` forwards a private `https://<machine>.<tailnet>.ts.net` address to that port. Only devices signed in to your tailnet can open it.
- Adding that address to your home screen opens Mnemosyne full-screen on Melete. There is no offline mode: grading needs the Mac, so the Mac must be awake and online.
- Everyone signs in with Google, and only people the admin has added get in (ADR 0061). The tailnet is still the first protection, so keep **Funnel off** (below).

## Set up

1. **Install Tailscale** on the Mac and on the phone, and sign in to the same tailnet on both.
2. **Choose a machine name that reveals nothing.** When Serve gets its certificate, the machine's full name goes into public Certificate Transparency logs, where anyone can read it. The tailnet name hides your account, but the machine name is visible, so don't use your name, employer or anything private. To rename the Mac, either run `tailscale set --hostname=<name>`, or open the **Machines** page of the [admin console](https://login.tailscale.com/admin/machines), open the menu on the machine's row and choose **Edit machine name** (untick **Auto-generate from OS hostname** to keep your name). Do this before step 3.
3. **Turn on MagicDNS and HTTPS** in the admin console, on the [DNS page](https://login.tailscale.com/admin/dns): enable **MagicDNS** if it is off, then under **HTTPS Certificates** choose **Enable HTTPS** and acknowledge that machine names are published.
4. **Start Mnemosyne** on the Mac (`docker compose up -d`), then publish it to the tailnet:

   ```sh
   tailscale serve --bg 3100
   ```

   `--bg` keeps it running in the background, across reboots. The command prints the address, of the form `https://<machine>.<tailnet>.ts.net`. If `tailscale` isn't found in Terminal, the macOS app's command line tool is inside the app bundle; see Tailscale's macOS CLI instructions.
5. **Tell Mnemosyne its address.** Add the printed address to `APP_ORIGINS` in `.env` (comma-separated, after the local one, no path), for example `APP_ORIGINS=http://localhost:3100,https://<machine>.<tailnet>.ts.net`, and run `docker compose up -d`. Then add its two redirect URIs in Google Cloud ([`google-cloud-setup.md`](google-cloud-setup.md#2-authorized-redirect-uris)). Without this the sign-in answers "This address isn't configured in APP_ORIGINS".
6. **Check it:** `tailscale serve status` lists what is published. Open the address on the phone (Tailscale must be on there too) and sign in with Google.
7. **Add it to the home screen.** Safari: Share → **Add to Home Screen**. Chrome: menu → **Add to Home screen** (or **Install app**). It opens full-screen as "Mnemosyne", on your first module (Melete for someone who only has Melete). Sign in from the installed app the first time. Whether that session stays in the installed app on an iPhone is still to be confirmed on a real device; if it doesn't, it is a bug to report, not something to work around.

To undo it: `tailscale serve reset` clears the Serve configuration.

## Sharing the app with another person
Mnemosyne has accounts, so a second person can use your instance from their own device (ADR 0061):

1. **Give them access to the Mac on your tailnet.** In the Tailscale admin console, either invite them to your tailnet, or share the Mac's node with them (Machines → the Mac's menu → **Share**). They install Tailscale and accept.
2. **Add them in the app** (Settings → Admin → **Add user**): their Google email, a name, and the modules they may use. If your Google app is in *Testing*, add them as a test user in Google Cloud too ([`google-cloud-setup.md`](google-cloud-setup.md#3-who-can-sign-in)).
3. **They open the Tailscale address and sign in with Google.** The first time they choose a vault folder (one nobody has claimed, or a new one) under the vaults folder you set as `VAULTS_HOST_PATH`. They see only their own notes, jobs and questions.

Their address needs no change in `APP_ORIGINS` if it is the same Tailscale address. A person who is removed in Admin is signed out at once.

## Keep Funnel off
Funnel would put the app on the public internet, where anyone could reach the sign-in page and the Google redirect, with the tailnet no longer a barrier. Never run `tailscale funnel`. It is off unless you turn it on; `tailscale funnel status` shows whether anything is exposed and `tailscale funnel reset` clears it.

## Keep the Mac awake
The phone can only review while the Mac is awake and online. On a Mac laptop: System Settings → **Battery** → **Options** → turn on **Prevent automatic sleeping on power adapter when the display is off**, and leave it plugged in. On a desktop Mac the same switch is under System Settings → **Energy**. The menu names change between macOS versions; if you can't find it, search System Settings for "sleeping".

## Gmail
Connect Gmail from whichever address you are using (Settings → Sources): the redirect goes back to that address, as long as it is in `APP_ORIGINS` and its Gmail redirect URI is in the Google client ([`google-cloud-setup.md`](google-cloud-setup.md#2-authorized-redirect-uris)). Once connected, the poller runs on the Mac as usual.

## When the phone can't reach it
- **The page doesn't load or times out:** the Mac is asleep, offline, or Tailscale is off on the Mac or the phone. Wake the Mac, check the Tailscale app on both.
- **"Can't connect" with Tailscale on:** the container is down. On the Mac run `docker compose ps`, and `docker compose up -d` if needed. Check `http://localhost:3100/api/health` on the Mac.
- **Serve isn't running:** `tailscale serve status` shows nothing. Run `tailscale serve --bg 3100` again.
- **A certificate error:** HTTPS isn't enabled yet (step 3), or the machine was renamed after Serve was set up. Run `tailscale serve reset`, then step 4 again.
- **"This address isn't configured in APP_ORIGINS" when signing in:** step 5 wasn't done, or the address differs (for example after renaming the machine). Fix `APP_ORIGINS` and the Google redirect URIs.
- **Google says "redirect_uri_mismatch":** the Tailscale address's redirect URIs aren't in the Google client yet.
- **The sign-in page says you are not allowed:** the Google account isn't in Admin, or has been removed.
- **Grading fails but the question shows:** the Mac can't reach the Claude API. Rate yourself from the reference answer; the failure is logged on the Mac.

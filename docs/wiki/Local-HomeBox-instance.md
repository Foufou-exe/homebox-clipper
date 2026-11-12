# Local HomeBox instance

This guide sets up a development HomeBox instance with Docker Compose. Its data lives in the repository's
`homebox/` folder: this is the setup used to develop the extension.

```
homebox-clipper/
├── compose.yaml      dev HomeBox instance
├── .env              your HomeBox pepper (ignored by git)
├── homebox/          HomeBox data: SQLite database + attachments (ignored by git)
│   ├── homebox.db
│   └── <uuid>/…      attached files (invoices)
└── …
```

## Requirements

- Docker with the Compose plugin (`docker compose version`).
- `openssl` to generate the secret.
- The repository installed (`bun install`), see the [README](https://github.com/Foufou-exe/homebox-clipper/blob/main/README.md#installation).

## 1. Prepare the secret (pepper)

Since version 0.27, HomeBox requires `HBOX_AUTH_API_KEY_PEPPER`: a secret of at least 32 bytes that
protects the API keys in the database. **It must stay the same from one start to the next**. Changing it
invalidates all the API keys already created, and you then have to recreate them and enter them again in
the extension.

**New installation:**

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(openssl rand -base64 48)|" .env
```

**You already have a pepper** (for example in a `hbox.pepper` file at the root): reuse it to keep your
API keys valid.

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(cat hbox.pepper)|" .env
```

`.env` and `*.pepper` are ignored by git: never commit them.

## 2. Start HomeBox

```bash
docker compose up -d
docker compose logs -f homebox      # Ctrl+C to leave the logs
```

Check that the API answers:

```bash
curl -s http://localhost:3100/api/v1/status
# {"health":true, … ,"build":{"version":"v0.27.0", …}}
```

> [!NOTE]
> **You already run HomeBox with `docker run`** (`homebox` container mounted on `./homebox`): remove the
> old container, your data stays in `homebox/`.
>
> ```bash
> docker rm -f homebox
> docker compose up -d
> ```

| Variable (`.env`) | Default | Role |
|-------------------|---------|------|
| `HBOX_AUTH_API_KEY_PEPPER` | — | **Required.** Secret for the API keys |
| `HOMEBOX_VERSION` | `latest` | Image version, e.g. `v0.27.0` to pin the tested version |
| `HOMEBOX_PORT` | `3100` | Port exposed on the machine |
| `TZ` | `Europe/Paris` | Time zone |

## 3. Create an account and an API key

1. Open <http://localhost:3100> and create an account (a fictitious address is enough, for example
   `dev@example.com`).
2. **Profile → API Keys** → create a key named `homebox-clipper-dev`, with an expiration date.
3. Copy the `hb_…` key: it will not be shown again.

## 4. Connect the extension

Choose the address according to where the browser runs:

| Browser | Address to enter |
|---------|------------------|
| On the same machine as Docker | `http://localhost:3100` |
| On another machine of the network (homelab) | `http://<machine-IP>:3100` (e.g. `http://192.0.2.10:3100`) |

Both work with the single build (`bun run build` → `.output/chrome-mv3/`, or `bun run dev`). HTTP is
accepted for local network addresses and refused for public addresses (see the
[Configuration](Configuration.md) page).

Then:

1. `chrome://extensions` → *Developer mode* → *Load unpacked* → the build folder. If the extension is
   already loaded, click ↻ after each build.
2. Settings page: address, API key, passphrase (at least 10 characters) → **Test and save** → accept the
   access requested by Chrome.
3. The badge must show `● HomeBox: http://… v0.27.0`.

> [!TIP]
> `bun run dev` opens a dedicated Chrome with the extension loaded and reloaded on every code change.
> It is the most convenient during development.

## 5. Scenarios to check

Sign in to Amazon.fr in the same browser, then:

| # | Scenario | Expected result |
|---|----------|-----------------|
| 1 | **Order Details** page → popup | Product, price, date, order number, invoice and instance displayed |
| 2 | *Add to HomeBox* | Success message and link; in HomeBox: price, date, seller, notes `Amazon.fr order: …`, invoice as an attachment |
| 3 | Replay the same import | Warning "A similar item already exists in HomeBox." with a link to the existing item |
| 4 | Multi-item order, check 2 products | 2 items, each with the invoice |
| 5 | Product page (not an order) → popup | "No purchase detected on this page." and an empty form; attach a local PDF → import OK |
| 6 | Attach a `.png` renamed to `.pdf` | "The file is not a PDF." |
| 7 | `docker compose stop` then import | "HomeBox is unreachable. Check the address and your connection." (restart with `docker compose start`) |
| 8 | Start an import then `docker compose stop` right after the creation | "The item was created but sending a document failed." ; `docker compose start` → *Retry the document upload* → a single item, with its documents |
| 9 | Popup → 🔒, then reopen | Passphrase requested; a wrong passphrase shows "Incorrect passphrase." |
| 10 | Revoke the key in HomeBox, then import | "Invalid or expired API key." |
| 11 | Extension DevTools → *Application → Extension storage → Local* | `homeboxConfig` contains an encrypted block (`ct`) and no clear-text key |

To see the invoices received by HomeBox, open the item in the interface (attachments tab). The files are
stored under `homebox/<uuid>/`.

## 6. Reset

To start again from an empty instance, which deletes **all** the test items and accounts:

```bash
docker compose down
# The files belong to the container's user: delete through Docker, without sudo.
docker run --rm -v "$PWD/homebox:/data" alpine sh -c 'rm -rf /data/* /data/.[!.]*'
docker compose up -d
```

Keep the same `.env`: the pepper can stay the same for a new instance.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `docker compose up`: *Set HBOX_AUTH_API_KEY_PEPPER…* | `.env` is missing or empty: redo step 1 |
| The container restarts in a loop (`docker compose logs homebox`) | Pepper too short (< 32 bytes): regenerate it with `openssl rand -base64 48` |
| `Conflict. The container name "/homebox" is already in use` | An old container exists: `docker rm -f homebox` |
| All API keys are refused after a restart | The pepper changed: put the old one back in `.env`, or recreate the keys |
| The extension shows "An HTTPS address is required." | The address entered is public: use the machine's local IP (`192.168.x.x`…) or `localhost` |
| Unreachable from another machine | Firewall of the Docker machine: allow port 3100 on the local network |

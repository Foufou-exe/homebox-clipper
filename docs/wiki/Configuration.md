# Configuration

Before the first import, the extension needs the address of your HomeBox instance and an API key.
Everything is done in the settings page (click the extension icon then ⚙, or right-click then *Options*).

## 1. Create an API key in HomeBox

In HomeBox: **Profile** then **API Keys**, create a key and copy it (it starts with `hb_`). It is shown
only once.

> [!TIP]
> Create a key **dedicated to the extension, with an expiration date**: HomeBox shows its last use and
> lets you revoke it without touching your other keys.

## 2. Fill in the extension

1. **HomeBox instance address**, for example `https://homebox.example.com`. There is no need to add
   `/api`: the extension normalizes the address (it removes the trailing `/` and any `/api` or `/api/v1`).
2. **API key**: paste the `hb_...` key.
3. **Passphrase** (at least **10 characters**, entered twice): it encrypts the API key on disk. Remember
   it: it cannot be recovered.
4. Click **Test and save**.
5. Chrome asks for permission to access **this address only**: accept.

The extension checks that the address answers like a HomeBox instance (`GET /api/v1/status`) and that the
key is accepted (`GET /api/v1/users/self`), then shows the connected instance and its version. The result
of the last test is kept with the settings.

## Accepted addresses

| Instance address | Accepted? |
|------------------|-----------|
| `https://...` (any address) | Yes |
| `http://` to the **local network**: `localhost`, `127.0.0.1` (loopback), private IPs (`10.x.x.x`, `172.16.x.x` to `172.31.x.x`, `192.168.x.x`), IPv6 `::1` and `fc...`/`fd...`, names ending in `.lan`, `.local`, `.home.arpa`, `.internal`, `.localhost`, or a short name without a dot (`http://homebox:7745`) | Yes, with the "Unencrypted HTTP" warning |
| `http://` to a **public** address (public domain name, public IP) | No: "An HTTPS address is required." |
| Address containing a username or password (`https://user:pass@...`) or a protocol other than `http`/`https` | No: "The HomeBox address is invalid or does not point to a HomeBox instance." |

> [!WARNING]
> Over HTTP, your API key travels **in clear text** on the network with every request. This is acceptable
> on a trusted local network (homelab), never on the Internet. To go further, put HomeBox behind an HTTPS
> reverse proxy (Caddy, Traefik, Nginx Proxy Manager...).

The rule is enforced in `src/background/config/url-policy.ts` and covered by unit tests. For example, a
test instance on another machine of the local network will have an address like
`http://192.0.2.10:3100` (documentation address): see [Local-HomeBox-instance](Local-HomeBox-instance.md).

## Locking and unlocking

- After a **browser restart**, the popup asks for your passphrase: this is the session unlock. The
  decrypted key lives only in memory.
- The 🔒 button in the popup (or **Lock** in the settings) clears the key from memory. Imports are then
  impossible until the next unlock.
- A wrong passphrase shows "Incorrect passphrase." without changing anything.

## Changing or deleting the settings

- **Change the address or the key**: in the settings. To **keep the current key**, leave the key field
  empty and enter your current passphrase: changing the address of an existing key therefore requires
  knowing the passphrase (see [Security-and-privacy](Security-and-privacy.md)).
- **Change the passphrase**: enter the API key again with the new passphrase.
- **Delete settings**: erases the address, the encrypted key, the in-progress imports kept for recovery,
  and **removes the access permission** granted to the instance.
- **Forgotten passphrase**: it cannot be recovered. Delete the settings, then set the extension up again
  with your API key (or a new key).

## Appearance

The theme (**Automatic (system)**, **Light** or **Dark**) is chosen in the *Appearance* section of the
settings, or with one click on the popup toolbar button.

## Upgrading from a version that stored the key in clear text

An earlier version saved the API key in clear text. At startup, the extension removes it from disk and
keeps it in memory until you set a passphrase in the settings; otherwise it is lost when the browser
closes.

A question or an error? See [Troubleshooting-and-FAQ](Troubleshooting-and-FAQ.md).

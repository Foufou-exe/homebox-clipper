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
5. The browser asks for permission to access **this address only**: accept.

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

- The decrypted key lives only in memory. When it is asked again depends on **Settings → Automatic
  lock**: **when the browser closes** (default), **after 15 minutes**, **1 hour** or **4 hours** of
  inactivity (not using the popup, the settings or an import), or **every time the extension is opened**.
  Changing the setting does not ask for the passphrase. An import in progress is never interrupted: the
  lock applies once it ends.
- There is no "never" option: the decrypted key would then be readable by anyone or any software with
  access to the browser profile. Whatever the choice, the key is forgotten when the browser closes.
- The 🔒 button in the popup (or **Lock** in the settings) clears the key from memory. Imports are then
  impossible until the next unlock.
- A wrong passphrase shows "Incorrect passphrase." without changing anything.

## Several HomeBox instances

You can set up **up to 10 instances** (for example one at home and one for a workshop). With a single
instance, the settings look as before, with a **Display name (optional)** field and an **Add an instance**
button.

- **Add an instance**: name (optional; empty: the host of the address), address, API key and passphrase. The
  passphrase is asked at every add, even when the extension is unlocked: it is your current passphrase (one
  passphrase protects every key). The browser asks for access to **this address only**. The address must not be
  already configured; the button is disabled once 10 instances are set up. The instance is saved even if the
  connection test fails, like the first configuration.
- From two instances on, each instance has its card (name, address, masked key, state of the last test) with:
  - **Test the connection**: only this instance is contacted (the extension must be unlocked);
  - **Rename**: no passphrase needed; 1 to 50 characters, not already used by another instance (case ignored);
  - **Change the address or key**: same rules as below for a single instance; a new origin is asked to the browser,
    the access to the former one is removed once no instance uses it;
  - **Delete this instance** (confirmation naming it): erases its key, its last location, its import history
    entries and its interrupted imports, and removes its access if no other instance uses the same origin. It is
    refused while an import to this instance is running. Deleting the last instance is the same as **Delete
    settings**;
  - **Request access again**, shown when the browser no longer grants access to this instance (permission removed
    from the browser settings, for example in `about:addons` › the extension › **Permissions** in Firefox).
- A key shown as **Key to re-enter** could not be decrypted with the right passphrase (damaged data): change
  the key of that instance; the other instances keep working.
- **Delete all settings** (from two instances on) erases every instance, as **Delete settings** does with one.

## Changing or deleting the settings

- **Change the address or the key**: in the settings. To **keep the current key**, leave the key field
  empty and enter your current passphrase: changing the address of an existing key therefore requires
  knowing the passphrase (see [Security-and-privacy](Security-and-privacy.md)).
- **Change the passphrase**: **Settings → Change the passphrase** (current passphrase, new one, confirmation)
  re-encrypts every key and the import history key at once; if anything fails, nothing changes and the former
  passphrase stays valid. With a single instance you can also enter the API key again with a new passphrase.
- **Delete settings** (**Delete all settings** with several instances): erases every instance (addresses,
  encrypted keys), the in-progress imports kept for recovery, the import history (its on/off setting is kept),
  and **removes the access permission** granted to each instance.
- **Import history**: the **Import history** card turns the local history on or off (turning it off
  erases it, after a confirmation). See [Usage](Usage.md#import-history).
- **New passphrase while locked**: if the extension is locked and you enter a new key and a new
  passphrase, the encrypted import history can no longer be read and is erased; a warning says so before
  sending. Unlock first (from the popup) to keep it.
- **Forgotten passphrase**: it cannot be recovered. Delete the settings, then set the extension up again
  with your API key (or a new key).

## Automatic tags

The **Automatic tags** card of the settings chooses the tags suggested in the summary
(see [Usage](Usage.md#tags)):

- **Suggest the store name as a tag** (on by default): suggests the store brand, for example "Amazon".
- **Rules**: "Product name contains" a text → "Tag" a name. The text is plain: case and accents are
  ignored, there is no regular expression (`.*` is looked for as is). Every matching rule applies. Type the
  text and the tag, then press Enter or **Add the rule**; edit a rule in place, or **Delete** it. An empty
  text or tag is refused with a message; a text is at most 100 characters, a tag name at most 255 bytes.

The setting is stored in the browser (`tagSettings`, `storage.local`), works whether the extension is
configured or locked, and is kept when you delete the settings. A change applies to the next summaries.

## Appearance

The theme (**Automatic (system)**, **Light** or **Dark**) is chosen in the *Appearance* section of the
settings, or with one click on the popup toolbar button.

## Upgrading from a version that stored the key in clear text

An earlier version saved the API key in clear text. At startup, the extension removes it from disk and
keeps it in memory until you set a passphrase in the settings; otherwise it is lost when the browser
closes.

A question or an error? See [Troubleshooting-and-FAQ](Troubleshooting-and-FAQ.md).

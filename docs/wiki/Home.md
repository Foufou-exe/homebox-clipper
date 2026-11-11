# HomeBox Clipper: the wiki

**HomeBox Clipper** is a Chrome extension (Manifest V3) that turns an online purchase into an
[HomeBox](https://github.com/sysadminsmedia/homebox) inventory item, PDF invoice included, after your
confirmation. It currently works with **Amazon** (the "Order Details" page): Amazon.fr, plus Amazon.de,
.es, .it, .com.be, .nl, .co.uk and .com in testing (see [Supported-merchants](Supported-merchants.md)), and
talks only to
**your** self-hosted HomeBox instance (API tested with v0.27).

> [!NOTE]
> The project is an MVP. It is independent: it has no affiliation with Amazon or the HomeBox team.

## Where to start

| You want to... | Page |
|----------------|------|
| Install the extension | [Installation](Installation.md) |
| Connect it to your HomeBox instance | [Configuration](Configuration.md) |
| Import a purchase | [Usage](Usage.md) |
| See which sites are supported | [Supported-merchants](Supported-merchants.md) |
| Understand what is stored and sent | [Security-and-privacy](Security-and-privacy.md) |
| Fix an error message | [Troubleshooting-and-FAQ](Troubleshooting-and-FAQ.md) |
| Understand the code | [Architecture](Architecture.md) |
| Add a merchant | [Adding-a-merchant](Adding-a-merchant.md) |
| Run or write tests | [Testing-and-fixtures](Testing-and-fixtures.md) |
| Set up a test HomeBox instance | [Local-HomeBox-instance](Local-HomeBox-instance.md) |
| Publish a release | [Releasing](Releasing.md) |
| Change or add an interface text | [Translations](Translations.md) |
| Maintain the development environment | [Maintaining-the-dev-environment](Maintaining-the-dev-environment.md) |

## Useful links

- [Repository README](https://github.com/Foufou-exe/homebox-clipper/blob/main/README.md)
- [Contributing guide](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md)
- [Changelog](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md)
- [Supported merchants](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md)
- [Security policy](https://github.com/Foufou-exe/homebox-clipper/blob/main/SECURITY.md)

The full navigation is in the sidebar. The content of this wiki is versioned in the repository, in
`docs/wiki/`: to fix it, open a pull request rather than editing the page on GitHub (a later
publication would overwrite the edit).

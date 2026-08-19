# Security policy

Ecommerce AI Workbench is designed for local use. The server must bind to `127.0.0.1`; do not expose it to a LAN or the public internet.

## Reporting a vulnerability

Please do not disclose security issues in public issue trackers. Send a private report to the maintainers with a description, affected version or commit, reproduction steps, and impact. Do not include secrets, user data, or API keys in the report.

Maintainers will acknowledge the report, assess it, and coordinate a fix and disclosure timeline with the reporter. Until a dedicated security contact is published, contact the repository owner through the private contact channel associated with the repository.

## Handling local data

Do not commit workspace data, database files, backups, logs containing sensitive information, or API keys. Future workspace backups must exclude secrets.

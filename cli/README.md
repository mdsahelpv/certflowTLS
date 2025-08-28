# My CA CLI

A command-line interface for interacting with the My CA certificate authority management system.

## Installation

```bash
npm install
npm link # To make the my-ca-cli command available globally
```

## Quick Start

1.  **Login to the server:**
    ```bash
    my-ca-cli login -u <username> -p <password> --server <server_url>
    ```

2.  **Check the server status:**
    ```bash
    my-ca-cli status
    ```

3.  **Issue a new certificate:**
    ```bash
    my-ca-cli cert issue --cn "test.example.com" --sans "test.example.com,www.test.example.com"
    ```

## Commands

### Global Options

-   `-s, --server <url>`: URL of the CA server. Overrides the configured server.
-   `--token <token>`: Bearer token for authentication. Overrides the configured token.

### `status`

Check the health status of the CA server.

### `login`

Authenticate with the CA server and store the token.

-   `-u, --username <username>`: (Required) Your username.
-   `-p, --password <password>`: (Required) Your password.

### `logout`

Clear the stored authentication token and server configuration.

### `config`

Manage the CLI configuration.

-   `config get`: Display the current configuration.
-   `config set <key> <value>`: Set a configuration key-value pair.

### `cert`

Manage certificates.

-   `cert issue`: Issue a new certificate.
    -   `--cn <commonName>`: (Required) Common Name for the certificate.
    -   `--type <type>`: Type of certificate (`SERVER`, `CLIENT`, `CA`). Default: `SERVER`.
    -   `--days <days>`: Validity period in days. Default: `365`.
    -   `--sans <sans>`: Comma-separated Subject Alternative Names.
    -   `--keyAlgorithm <algorithm>`: Key algorithm (`RSA` or `ECDSA`). Default: `RSA`.
    -   `--keySize <size>`: Key size (e.g., `2048` for RSA). Default: `2048`.
-   `cert list`: List certificates.
    -   `--limit <number>`: Number of certificates to return.
    -   `--page <number>`: Page number for pagination.
    -   `--type <type>`: Filter by certificate type.
    -   `--status <status>`: Filter by status (`ACTIVE`, `REVOKED`, `EXPIRED`).
    -   `--subjectDN <dn>`: Filter by Subject DN.
-   `cert revoke`: Revoke a certificate.
    -   `--serialNumber <serial>`: (Required) The serial number of the certificate to revoke.
    -   `--reason <reason>`: The reason for revocation.
-   `cert renew`: Renew a certificate.
    -   `--serialNumber <serial>`: (Required) The serial number of the certificate to renew.

### `ca`

Manage Certificate Authorities (CAs).

-   `ca list`: List all CAs.
-   `ca get --id <id>`: Get details for a specific CA.
-   `ca delete --id <id>`: Delete a CA.

### `crl`

Manage Certificate Revocation Lists (CRLs).

-   `crl generate`: Generate a new CRL.
    -   `--type <type>`: CRL type (`full` or `delta`). Default: `full`.
    -   `--caId <id>`: The ID of the CA to generate the CRL for.
-   `crl download`: Download the latest CRL.
    -   `--out <file>`: File path to save the CRL to. If not provided, prints to standard output.

### `user`

Manage users.

-   `user list`: List all users.
    -   `--limit <number>`: Number of users to return.
    -   `--page <number>`: Page number for pagination.
-   `user create`: Create a new user.
    -   `--username <username>`: (Required) Username for the new user.
    -   `--email <email>`: (Required) Email for the new user.
    -   `--password <password>`: (Required) Password for the new user.
    -   `--role <role>`: Role for the new user (e.g., `ADMIN`, `USER`). Default: `USER`.
-   `user update`: Update an existing user.
    -   `--id <id>`: (Required) The ID of the user to update.
    -   `--username <username>`: New username for the user.
    -   `--email <email>`: New email for the user.
    -   `--role <role>`: New role for the user.
-   `user delete`: Delete a user.
    -   `--id <id>`: (Required) The ID of the user to delete.
-   `user reset-password`: Reset a user's password.
    -   `--id <id>`: (Required) The ID of the user whose password to reset.

### `audit`

Manage audit logs.

-   `audit list`: List audit log entries.
    -   `--limit <number>`: Number of entries to return.
    -   `--page <number>`: Page number for pagination.
    -   `--user <user>`: Filter by user ID or username.
    -   `--action <action>`: Filter by action type.
-   `audit export`: Export audit logs.
    -   `--format <format>`: Export format (e.g., `json`, `csv`). Default: `json`.
    -   `--out <file>`: File path to save the export to. If not provided, prints to standard output.

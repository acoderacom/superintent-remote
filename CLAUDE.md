## Superintent Config

- Namespace: claude-code-remote
- Database: Local SQLite (`.superintent/local.db`)

Always search knowledge before exploring the codebase — it is the primary source of truth. All `--stdin` flags expect JSON input.

<!-- superintent:knowledge:start -->

<!-- superintent:knowledge:end -->

### Setup Commands

| Command                               | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| `npx superintent init [--url <url>]`  | Create database tables                                    |
| `npx superintent status`              | Check Turso connection                                    |
| `npx superintent ui [-p <port>] [-o]` | Start web UI (default port 3456, -o to auto-open browser) |

### Ticket Operations

| Action  | Command                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create  | `npx superintent ticket create --stdin` (JSON: `{"title","intent","type","context","constraints","assumptions","changeClass","plan",[...]}`)                                                                    |
| Get     | `npx superintent ticket get <id>`                                                                                                                                                                               |
| Preview | `npx superintent ticket preview <id>`                                                                                                                                                                           |
| Update  | `npx superintent ticket update <id> [--stdin] [--status] [--complete-all] [--complete-task <indices>] [--complete-dod <indices>] [--comment <text>] [--author <name>] [--context <context>] [--spec <spec-id>]` |
| List    | `npx superintent ticket list [--status <status>] [--limit N]`                                                                                                                                                   |
| Delete  | `npx superintent ticket delete <id>`                                                                                                                                                                            |

### Spec Operations

| Action  | Command                                                                                     |
| ------- | ------------------------------------------------------------------------------------------- |
| Create  | `npx superintent spec create --stdin` (JSON: `{"title","content","author"}`)                |
| Get     | `npx superintent spec get <id>`                                                             |
| Preview | `npx superintent spec preview <id>`                                                         |
| List    | `npx superintent spec list [--limit N]`                                                     |
| Update  | `npx superintent spec update <id> [--stdin] [--title] [--comment <text>] [--author <name>]` |
| Delete  | `npx superintent spec delete <id>`                                                          |

### Knowledge Operations

| Action      | Command                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search      | `npx superintent knowledge search "<query>" [--limit N] [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--branch-auto] [--min-score]`                   |
| Extract     | `npx superintent knowledge extract <ticket-id> [--namespace <namespace>]`                                                                                                          |
| Create      | `npx superintent knowledge create --stdin` (JSON: `{"title","namespace","content","category","source","confidence","scope","tags",[...]}`)                               |
| Get         | `npx superintent knowledge get <id>`                                                                                                                                     |
| Preview     | `npx superintent knowledge preview <id>`                                                                                                                                 |
| List        | `npx superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--branch-auto] [--status active\|inactive\|all] [--limit N]`      |
| Update      | `npx superintent knowledge update <id> [--stdin] [--title] [--namespace] [--category] [--tags] [--scope] [--origin] [--confidence] [--comment <text>] [--author <name>]` |
| Activate    | `npx superintent knowledge activate <id>`                                                                                                                                |
| Deactivate  | `npx superintent knowledge deactivate <id>`                                                                                                                              |
| Promote     | `npx superintent knowledge promote <id>`                                                                                                                                 |
| Recalculate | `npx superintent knowledge recalculate [--dry-run]`                                                                                                                      |

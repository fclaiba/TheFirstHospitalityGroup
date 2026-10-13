# ADR 0003: Username sign-in, one role per account, venue assignments

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Staff share devices, change often and many have no work email. OSCURA ADR 0016/0020/0021/0024 settled username + password with a session bridge and one role per account.

## Decision
Keep the OSCURA session bridge (PBKDF2, RS256 cookie, Convex customJwt, session versions, lockout). Roles: server, runner, busser, bartender, barback, kitchen, captain, manager, owner (+ dev outside prod). One role per account; venues through `assignments`. Managers create staff with a temporary password that must be changed on first sign-in (differs from OSCURA ADR 0020, which did not force a change: here staff are many and change often). Manager and owner may also sign in and recover with a verified email.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Phone OTP | No passwords | SMS cost, shared phones, OSCURA dropped it |
| SSO (Google Workspace) | Central control | Most staff have no company account |
| Username + password (chosen) | Works on any device, proven | Password resets fall on managers |

## Consequences
Managers get a reset action; deactivation ends all sessions. Revisit SSO for managers if TFHG adopts Workspace.

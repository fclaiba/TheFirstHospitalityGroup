# ADR 0030: Reliable preview access, contextual guidance and original mark

Date: 2026-10-18. Status: accepted.

The owner reported that none of the sample accounts worked in an existing two-tab browser, requested didactic screens, and commissioned a logo from scratch. A regression reproduces account replacement across tabs. Shared-session persistence and rehydration writes cause identity interference; query caches also need identity boundaries.

Keep sample records shared locally, but store each tab's identity in sessionStorage. Ignore the old shared identity while preserving records. Rehydration must preserve the tab identity without creating storage feedback. Scope query outcomes by function, arguments and identity, and gate protected queries until authenticated. Sign-in errors must be visible and retryable. Provide concise EN/ES instructions per operational route, with optional details.

Replace the temporary square with an original vector lion in right-facing profile. Preserve burgundy from ADR 0029 and typography from ADR 0025. Author native SVG paths, with one source for UI and generated install icons. Historical drawings remain references. This supersedes the temporary-placeholder decision in the 2026-10-18 blueprint amendment. No remote Convex or production deployment is authorized by this change.

Validate all visible sample accounts, reloads and independent tab identities, existing functional journeys, accessibility and repository gates. These browser identities are a preview convenience; production authentication and server permission checks remain unchanged.

# iOS native module notes

iOS cannot fully match several Android behaviors because Apple restricts programmatic Wi-Fi scanning/switching, mobile-data toggling, and arbitrary filesystem access.

Implement the same `CAdminNative` JavaScript contract with the closest iOS-supported behavior:

- use `NEHotspotConfiguration` only for known SSIDs where the user grants permission
- expose document/folder picking through iOS document picker APIs
- implement the local HTTP server inside the app sandbox or security-scoped folder
- use background tasks where possible, but do not assume Android service parity

Any unavailable native behavior should return `false` or `undefined` and let the shared UI show the same failure messages.

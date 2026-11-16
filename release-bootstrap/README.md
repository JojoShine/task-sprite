# macOS credential agent bootstrap

The Apple Silicon executable is preserved byte for byte from the existing release. The Intel executable is compiled once from the same C source for x86_64. Both require the same original app signing certificate. Metadata pins each executable checksum and code directory hash. These files contain public program code and certificate requirements, never private credentials.

The existing release-candidates workflow builds and smoke tests Windows, Apple Silicon and Intel on native GitHub runners. It signs the final macOS app using the original identity held in protected GitHub Secrets, then creates the DMG and signed updater archive. Temporary signing files are removed after packaging. Local .tooling/signing files remain ignored and must never enter Git history.

# macOS credential agent bootstrap

The Apple Silicon executable is a byte-identical copy of the existing ad-hoc signed credential agent used by the local release process. It contains only program code and the public caller certificate requirement. It contains no account, token, authorization code, private certificate, password or signing key. Metadata records its public SHA-256, code directory hash and original caller certificate fingerprint.

The original C source remains in scripts/macos-credential-agent.c. This publication does not add a new software license or change existing rights.

CI verifies and copies this exact agent, then builds an ad-hoc signed candidate app. Such a candidate cannot access the protected Keychain item: the agent still requires the original app signing identity. CI smoke tests only launch with the runner's fresh profile; they do not claim authorized macOS Keychain access. Final production app signing and Keychain regression verification occur locally using the original protected identity. Never run scripts/build-macos.mjs on CI, generate replacement keys, or upload .tooling/signing.

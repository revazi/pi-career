# Native `career-cli` dependency inventory

## Status and scope

This is reproducible dependency evidence for the two native `career` binaries tracked by pi-career. It is **not legal advice**, a legal-compliance conclusion, an SPDX/CycloneDX SBOM, or release approval. A human license review remains mandatory under [`releasing.md`](releasing.md).

The inventory is pinned to:

- Career Core commit [`a3cdb4c6d7f966397e93ea4664071975bca7228c`](https://github.com/revazi/career-core/tree/a3cdb4c6d7f966397e93ea4664071975bca7228c)
- Cargo.lock SHA-256 `18d188cfea79128d4024dabe2e21f57e5d2098d32ffac8c4ef01243f49abb609`
- package `career-cli 0.1.0`
- build edges `normal,build`, excluding development dependencies
- targets `aarch64-apple-darwin` and `x86_64-unknown-linux-gnu`

The per-target provenance records show the corresponding locked release builds:

```text
cargo build --release --locked -p career-cli --target aarch64-apple-darwin
cargo build --release --locked -p career-cli --target x86_64-unknown-linux-gnu
```

## Derivation

The Career Core checkout was treated as read-only. The exact commit was exported to a temporary directory outside both repositories; the temporary export was removed after these offline commands:

```bash
cargo metadata --locked --offline \
  --filter-platform <target> --format-version 1
cargo tree --locked --offline -p career-cli \
  --target <target> --edges normal,build
```

Starting at the `career-cli` resolve node, only normal and build dependency edges were traversed. Package versions, manifest license expressions, registry sources, and checksums came from Cargo metadata and that commit's `Cargo.lock`.

Both targets resolve the same 30-package set. Cargo metadata reports no `kind = "build"` dependency edge in either graph. `clap_derive` and `serde_derive` are included because they are proc-macro packages reached through normal dependency edges and compiled for the build host. The table excludes all development dependencies and the unrelated `career-swift`/UniFFI workspace graph.

## Exact reachable package set for both targets

For crates.io packages, “Source” identifies the immutable name/version registry coordinate and “Lock checksum” is the package checksum recorded in the pinned `Cargo.lock`. Workspace crates are bound by the Core commit instead.

| Package | Version | Cargo license expression | Source | Lock checksum |
|---|---:|---|---|---|
| `aho-corasick` | `1.1.4` | `Unlicense OR MIT` | [crates.io](https://crates.io/crates/aho-corasick/1.1.4) | `ddd31a130427c27518df266943a5308ed92d4b226cc639f5a8f1002816174301` |
| `anstream` | `1.0.0` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/anstream/1.0.0) | `824a212faf96e9acacdbd09febd34438f8f711fb84e09a8916013cd7815ca28d` |
| `anstyle` | `1.0.14` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/anstyle/1.0.14) | `940b3a0ca603d1eade50a4846a2afffd5ef57a9feac2c0e2ec2e14f9ead76000` |
| `anstyle-parse` | `1.0.0` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/anstyle-parse/1.0.0) | `52ce7f38b242319f7cabaa6813055467063ecdc9d355bbb4ce0c68908cd8130e` |
| `anstyle-query` | `1.1.5` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/anstyle-query/1.1.5) | `40c48f72fd53cd289104fc64099abca73db4166ad86ea0b4341abe65af83dadc` |
| `career-cli` | `0.1.0` | `MIT OR Apache-2.0` | [Core workspace](https://github.com/revazi/career-core/tree/a3cdb4c6d7f966397e93ea4664071975bca7228c/crates/career-cli) | commit-bound |
| `career-core` | `0.1.0` | `MIT OR Apache-2.0` | [Core workspace](https://github.com/revazi/career-core/tree/a3cdb4c6d7f966397e93ea4664071975bca7228c) | commit-bound |
| `clap` | `4.6.4` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/clap/4.6.4) | `d91e0c145792ef73a6ad36d27c75ac09f1832222a3c209689d90f534685ee5b7` |
| `clap_builder` | `4.6.2` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/clap_builder/4.6.2) | `f09628afdcc538b57f3c6341e9c8e9970f18e4a481690a64974d7023bd33548b` |
| `clap_derive` | `4.6.4` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/clap_derive/4.6.4) | `d012d2b9d65aca7f18f4d9878a045bc17899bba951561ba5ec3c2ba1eed9a061` |
| `clap_lex` | `1.1.0` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/clap_lex/1.1.0) | `c8d4a3bb8b1e0c1050499d1815f5ab16d04f0959b233085fb31653fbfc9d98f9` |
| `colorchoice` | `1.0.5` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/colorchoice/1.0.5) | `1d07550c9036bf2ae0c684c4297d503f838287c83c53686d05370d0e139ae570` |
| `heck` | `0.5.0` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/heck/0.5.0) | `2304e00983f87ffb38b55b444b5e3b60a884b5d30c0fca7d82fe33449bbe55ea` |
| `is_terminal_polyfill` | `1.70.2` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/is_terminal_polyfill/1.70.2) | `a6cb138bb79a146c1bd460005623e142ef0181e3d0219cb493e02f7d08a35695` |
| `itoa` | `1.0.18` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/itoa/1.0.18) | `8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682` |
| `memchr` | `2.8.3` | `Unlicense OR MIT` | [crates.io](https://crates.io/crates/memchr/2.8.3) | `cf8baf1c55e62ffcace7a9f06f4bd9cd3f0c4beb022d3b367256b91b87513d98` |
| `proc-macro2` | `1.0.107` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/proc-macro2/1.0.107) | `985e7ec9bb745e6ce6535b544d84d6cd6f7ad8bd711c398938ae983b91a766d9` |
| `quote` | `1.0.47` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/quote/1.0.47) | `1fbf4db142a473a8d80c26bbf18454ed458bf8d26c8219c331daecfdbd079001` |
| `regex` | `1.13.1` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/regex/1.13.1) | `f020237b6c8eed93db2e2cb53c00c60a8e1bc73da7d073199a1180401450218d` |
| `regex-automata` | `0.4.16` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/regex-automata/0.4.16) | `8fcfdb36bda0c880c5931cdc7a2bcdc8ba4556847b9d912bca70bc94708711ad` |
| `regex-syntax` | `0.8.11` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/regex-syntax/0.8.11) | `d6f6ff9a378485b298a5286656da665ba74413d36db0979633275d2e708145d4` |
| `serde` | `1.0.229` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/serde/1.0.229) | `4148590afebada386688f18773da617792bf2ef03ffc1e4cbd2b1d45b023e0ba` |
| `serde_core` | `1.0.229` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/serde_core/1.0.229) | `67dca2c9c51e58a4791a4b1ed58308b39c64224d349a935ab5039aa360942a48` |
| `serde_derive` | `1.0.229` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/serde_derive/1.0.229) | `e7a5d71263a5a7d47b41f6b3f06ba276f10cc18b0931f1799f710578e2309348` |
| `serde_json` | `1.0.151` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/serde_json/1.0.151) | `c841b55ecdae098c80dcae9cf767f6f8a0c2cdb3416bbef72181df4d0fe73f14` |
| `strsim` | `0.11.1` | `MIT` | [crates.io](https://crates.io/crates/strsim/0.11.1) | `7da8b5736845d9f2fcb837ea5d9e2628564b3b043a70948a3f0b778838c5fb4f` |
| `syn` | `3.0.3` | `MIT OR Apache-2.0` | [crates.io](https://crates.io/crates/syn/3.0.3) | `53e9bae58849f64dfa4f5d5ae372c8341f7305f82a3868709269343628b659a3` |
| `unicode-ident` | `1.0.24` | `(MIT OR Apache-2.0) AND Unicode-3.0` | [crates.io](https://crates.io/crates/unicode-ident/1.0.24) | `e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75` |
| `utf8parse` | `0.2.2` | `Apache-2.0 OR MIT` | [crates.io](https://crates.io/crates/utf8parse/0.2.2) | `06abde3611657adf66d383f00b093d7faecc7fa57071cce2578660c9f1010821` |
| `zmij` | `1.0.23` | `MIT` | [crates.io](https://crates.io/crates/zmij/1.0.23) | `29666d0abbfad1e3dc4dcf6144730dd3a3ab225bbbdac83319345b1b44ccfc1b` |

## License evidence and limits

The only reachable manifest expression requiring a license beyond the root MIT/Apache alternatives is `unicode-ident 1.0.24`: `(MIT OR Apache-2.0) AND Unicode-3.0`. Its exact packaged `LICENSE-UNICODE` text is preserved as [`licenses/Unicode-3.0.txt`](licenses/Unicode-3.0.txt), SHA-256 `f7db81051789b729fea528a63ec4c938fdcb93d9d61d97dc8cc2e9df6d47f2a1`.

No MPL-2.0 UniFFI package is reachable from this `career-cli` normal/build graph. The UniFFI entries in `runtime/THIRD_PARTY_NOTICES.md` belong to the excluded Swift adapter graph, not either distributed CLI target.

The manifest expressions and registry checksums do not by themselves establish which alternative license should be selected, preserve every third-party copyright notice, prove the exact linker result, or determine distribution obligations. Human review must inspect the corresponding crate license files and the actual package notice set before any release claim.

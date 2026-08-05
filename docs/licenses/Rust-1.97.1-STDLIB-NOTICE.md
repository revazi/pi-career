# Rust 1.97.1 standard-library notice

The bundled `career` executables were built with `rustc 1.97.1 (8bab26f4f 2026-07-14)`, source commit [`8bab26f4f68e0e26f0bb7960be334d5b520ea452`](https://github.com/rust-lang/rust/commit/8bab26f4f68e0e26f0bb7960be334d5b520ea452).

The Rust Standard Library is used under its MIT alternative. Preserve [`Rust-1.97.1-COPYRIGHT.txt`](Rust-1.97.1-COPYRIGHT.txt) and [`Rust-1.97.1-LICENSE-MIT.txt`](Rust-1.97.1-LICENSE-MIT.txt) with copies of either native executable.

The target-reachable standard-library source includes these upstream notices:

- Copyright The Rust Project Developers; `MIT OR Apache-2.0` (MIT selected here).
- `library/backtrace`: Copyright 2014 Alex Crichton and The Rust Project Developers; `MIT OR Apache-2.0` (MIT selected here).
- `library/std/src/sync/mpmc`: Copyright 2019 The Crossbeam Project Developers and The Rust Project Developers; `MIT OR Apache-2.0` (MIT selected here).
- `library/core/src/unicode/unicode_data.rs`: Copyright 1991-2024 Unicode, Inc.; `Unicode-3.0`. Preserve [`Unicode-3.0.txt`](Unicode-3.0.txt).

`library/std/src/sys/sync/mutex/fuchsia.rs` is not compiled for either `aarch64-apple-darwin` or `x86_64-unknown-linux-gnu`; its Fuchsia-specific BSD-2-Clause term is therefore outside both distributed target binaries.

This notice records package-bounded license evidence, not legal advice or a claim about files supplied by the host operating system.

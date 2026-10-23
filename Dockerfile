# Dockerfile - Tauri AppImage builder (Ubuntu 22.04)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    file \
    libwebkit2gtk-4.1-dev \
    build-essential \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    fuse \
    libfuse2 \
    && rm -rf /var/lib/apt/lists/*

# Install the same supported Rust toolchain used by CI.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.90.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Tauri CLI (this was missing!)
RUN cargo install tauri-cli --version 2.10.0 --locked

# Install Node + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm@12.14.0

WORKDIR /app

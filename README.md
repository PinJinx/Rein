<div align="center">
  <span>
    <img src="public/app_icon/IconBg.png" width="128" height="128" alt="Rein icon" />
    <img src="https://github.com/user-attachments/assets/7f9e9c71-0714-4af7-9191-d3f7184b7193" width="128" height="128" alt="AOSSIE logo" />
  </span>
</div>

# GSoC Proposal  Rein: Virtual Input Device Simulation System

Demo Videos:
a) From a my machine which is a arch + hyprland combo running on wayland 

https://github.com/user-attachments/assets/06739f75-9caf-4cd0-83de-7dd82e747007

b) From my friends Machine which is running ubuntu in Xorg.

<---Link to be uploaded -->

> **Linux only.** This branch contains a proof-of-concept implementation of virtual trackpad input via a native Rust addon. Windows and macOS are not supported at this stage — the server will crash on non-Linux systems.

## Prerequisites

- Linux (x86_64, glibc)
- Node.js ≥ 18
- npm ≥ 9
- Rust + Cargo (for building the native addon)

## Setup

### 1. Clone the main project
```bash
git clone -b trackpadpoc https://github.com/PinJinx/Rein.git
cd Rein
```

### 2. Clone and build the native addon

In a separate directory alongside the main project:
```bash
git clone https://github.com/PinJinx/rein-virtual-trackpad-poc.git
cd rein-virtual-trackpad-poc
npm install
npm run build
```

### 3. Install the addon into the main project

From inside the `Rein` directory:
```bash
npm install /absolute/path/to/rein-virtual-trackpad-poc --ignore-scripts
```

Replace `/absolute/path/to/rein-trackpad` with the actual path where you cloned the addon, for example:
```bash
npm install /home/youruser/rein-virtual-trackpad-poc --ignore-scripts
```

### 4. Install main project dependencies
```bash
npm install
```

### 5. Run the dev server
```bash
npm run dev
```

The server will start and print the local address to connect from your phone.

## How it works

This branch replaces the previous input with a virtual multitouch trackpad created via the Linux `uinput` subsystem. Touch events from the phone are relayed over WebSocket, converted into multitouch protocol B events, and injected into the kernel. libinput picks up the virtual device and classifies the raw touch data into gestures — scroll, pinch, swipe — which the compositor then acts on as if a real trackpad was present.

See the full write-up in the proposal document for architecture details.

## Known limitations
- Linux only (uinput requires root or membership in the `input` group)
- Non-Linux platforms will crash the dev server
- This is a proof-of-concept — production hardening is out of scope for this branch

<img width="1915" height="718" alt="Group 13 (1)" src="https://github.com/user-attachments/assets/371217bc-3606-409d-a4ab-2f5b32eae4a1" />


# Rein

Welcome to Rein. A **cross-platform LAN-based remote control and streaming system** that
connects a host computer with browser-based clients over the local network.

A client can be a **phone, tablet, laptop, desktop, or any other compatible
browser-based device**. Use it to control the host with touch and pointer input,
send keyboard commands, interact with the desktop remotely, and view the host's
screen in real time.

Rein is built to make remote interaction feel like a natural extension of the
host machine rather than a separate remote-desktop application.

## What Rein Brings to the table

Rein isn't just a remote trackpad. It brings together the essential tools
for interacting with a computer remotely from input and streaming to
gaming and file sharing.

<div align="center">

<img  width="180" height="139" alt="Gaming" src="https://github.com/user-attachments/assets/81498119-c351-4277-b3b5-91de1872d9d4" />
&nbsp;
<img  width="180" height="139" alt="Remote Access" src="https://github.com/user-attachments/assets/671cb147-3e8f-4540-954b-39fcb959a52a" />
&nbsp;
<img  width="180" height="139" alt="File Transfer" src="https://github.com/user-attachments/assets/cf385d77-386e-4616-955c-0e3cfca0b4a2" />
&nbsp;
<img  width="180" height="139" alt="Streaming" src="https://github.com/user-attachments/assets/0afa0607-c09c-42c2-85f4-3611176a243f" />

</div>

## Why Rein?

A keyboard and mouse aren't always within reach.

Your computer might be connected to a TV across the room, running a
presentation, powering a game, hosting a remote machine, or sitting inside
a cloud PC. In those moments, reaching for a keyboard and mouse isn't always
the most convenient option.

Your phone is already in your hand.

**Rein turns it into the interface.**

At its core, Rein is built around a simple idea: **any device can become an
interface.**

It provides a common layer for remote interaction across platforms and
computing environments, bringing control, streaming, sharing, and gaming
together in one experience.

Whether you're sitting across the room or connecting to a cloud machine,
Rein gives you a consistent way to interact with your computer.

---

## Tech Stack

<div align="center">
<img src="https://github.com/user-attachments/assets/34d99ea7-b9ac-40b3-b32a-c758a376cc1f" height="55" alt="TanStack" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/6b3cdab3-8ebe-41ae-92ed-5c987111640c" height="55" alt="TypeScript" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/8e0dcc83-c6eb-4235-a9ea-d41580d3020a" height="55" alt="WebRTC" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/88de3842-b480-4cbe-b985-8521ba134e27" height="55" alt="GStreamer" />

</div>

## Development Setup

> [!NOTE]
> **For Linux**
>
> Rein uses a virtual input device (`/dev/uinput`) for keyboard and mouse injection.
>
> On Wayland, screen capture requires a working PipeWire + XDG Desktop Portal setup (typically provided by your desktop environment).
>
> Your user must also have permission to access `/dev/uinput`. A recommended setup is:
>
> ```bash
> sudo groupadd -f uinput
>
> sudo tee /etc/udev/rules.d/99-rein.rules <<EOF
> KERNEL=="uinput", MODE="0660", GROUP="uinput"
> EOF
>
> sudo usermod -aG uinput $USER
>
> sudo udevadm control --reload-rules
> sudo udevadm trigger
> ```
>
> Log out and back in after running the commands above.
>
> You can verify access with:
>
> ```bash
> ls -l /dev/uinput
> ```
>
> which should show:
>
> ```text
> crw-rw---- 1 root uinput ... /dev/uinput
> ```
>
> Additionally, some native dependencies are required. Install them via your package manager (see [`shell.nix`](shell.nix) for the list), or use `nix-shell` directly.

### Quick Start

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3.  Open the local app: `http://localhost:3000`

## How to Use (Remote Control)

To control this computer from your phone/tablet:

### 1. Configure Firewall
Ensure your computer allows incoming connections on:
- **3000/TCP** (Frontend and WebSocket signaling)
- **4000–4050/UDP** (WebRTC media and input channels)

**Linux (UFW):**
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 4000:4050/udp
```

**NixOS:**
```nix
networking.firewall = {
  allowedTCPPorts = [ 3000 ];
  allowedUDPPortRanges = [
    { from = 4000; to = 4050; }
  ];
};
```

Port `5004/UDP` is an internal loopback relay between GStreamer and Rein and
must not be exposed.

### 2. Connect Mobile Device
1.  Ensure your phone and computer are on the **same Wi-Fi network**.
2.  On your computer, open the app (`http://localhost:3000/settings`).
3.  Scan the QR code with your phone OR manually enter:
    `http://<YOUR_PC_IP>:3000`

### 3. Usage Tips
- **Trackpad**: Swipe to move, tap to click.
- **Scroll**: Toggle "Scroll Mode" or use two fingers.
- **Keyboard**: Tap the "Keyboard" button to use your phone's native keyboard.

Visit the [Discord Channel](https://discord.com/invite/C8wHmwtczs) for interacting with the community!
(Go to Project-> Rein)

---


## Testing Rein on Virtual Machines

When testing Rein inside a Virtual Machine (VirtualBox), the VM must allow devices on the same network to access the server.

### Network Configuration

1. Open **VM Settings**
2. Go to **Network**
3. Change Adapter from **NAT → Bridged Adapter**
4. Select your active **Wi-Fi or Ethernet interface**

This allows devices on the same LAN to connect to the Rein server running inside the VM.

### For MacOS

Grant Accessibility permission to your terminal/IDE in System Settings → Privacy & Security → Accessibility.


---

## Architecture

<img width="1280" height="946" alt="Rein application architecture and data flow" src="https://github.com/user-attachments/assets/335632e6-de89-41fa-b9a7-fe222548e578" />

### At a glance

- **Host / Application** — Runs Rein and coordinates the required services.
- **Server** — Handles client connections and communication with the host.
- **Client / Viewer** — Browser-based interface used to control and interact with the host.
- **GStreamer** — Handles screen capture and streaming.
- **Input Manager / Drivers** — Converts remote input into platform-specific system input.
- **WebRTC** — Provides real-time communication for input and media.
- **HTTP** — Used during the connection setup and handshake.
- **FTP / File Transfer** — Handles file transfers between the client and host.

For a deeper look at the architecture, communication flow, WebRTC,
screen capture, input handling, and platform-specific implementation,
see the **[Rein Wiki](../../wiki)**.

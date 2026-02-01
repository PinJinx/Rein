# Rein - Remote Input Control

A web-based remote control for your computer.

## Tech Stack

*   **Framework**: [TanStack Start](https://tanstack.com/start)
*   **Language**: TypeScript
*   **Real-time**: Native WebSockets (`ws`)
*   **Input Simulation**: [@nut-tree/nut-js](https://github.com/nut-tree/nut.js)

## Development Setup

This project behaves like a standard Node.js application and can run on Windows, macOS, or Linux. 

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

## 📱 How to Use (Remote Control)

To control this computer from your phone/tablet:

### 1. Configure Firewall
Ensure your computer allows incoming connections on:
- **3000** (Frontend + Input Server)

**Linux (UFW):**
```bash
sudo ufw allow 3000/tcp
```

### 2. Connect Mobile Device
1.  Ensure your phone and computer are on the **same Wi-Fi network**.
2.  On your computer, open the app (`http://localhost:3000/settings`).
3.  Scan the QR code with your phone OR manually enter:
    `http://<YOUR_PC_IP>:3000`

### 3. Usage Tips
- **Trackpad**: Swipe to move, tap to click.
- **Scroll**: Toggle "Scroll Mode" or use two fingers.
- **Keyboard**: Tap the "Keyboard" button to use your phone's native keyboard.

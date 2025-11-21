# 🎮 KillaDome - Visual Feature Showcase

## Project Overview

**KillaDome** is a comprehensive Oxide/Umod plugin that transforms your Rust server into a Call of Duty-style gaming experience.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     🎯 KILLADOME                          ┃
┃          Full COD-Style Rust Server Experience           ┃
┃                                                           ┃
┃  Lobby • Loadouts • Progression • Store • Analytics      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 🎬 Player Journey

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: JOIN SERVER                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Player connects to server                         │    │
│  │      ↓                                              │    │
│  │  Auto-teleport to LOBBY                            │    │
│  │      ↓                                              │    │
│  │  Load persistent profile from disk                 │    │
│  │      ↓                                              │    │
│  │  Display LOBBY UI after 1 second                   │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Step 2: CUSTOMIZE LOADOUT                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Click "LOADOUTS" tab                              │    │
│  │      ↓                                              │    │
│  │  Select weapon from grid                           │    │
│  │      ↓                                              │    │
│  │  Drag attachments from library                     │    │
│  │      ↓                                              │    │
│  │  Drop onto weapon slots                            │    │
│  │      ↓                                              │    │
│  │  View stat changes in preview panel                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Step 3: UPGRADE WEAPONS                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Click "Upgrade" button on weapon                  │    │
│  │      ↓                                              │    │
│  │  Open FORGE UI                                     │    │
│  │      ↓                                              │    │
│  │  Select attachment to upgrade                      │    │
│  │      ↓                                              │    │
│  │  Spend Blood Tokens                                │    │
│  │      ↓                                              │    │
│  │  Weapon stats improve!                             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Step 4: JOIN MATCH                                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Click "PLAY" tab                                  │    │
│  │      ↓                                              │    │
│  │  Click "JOIN QUEUE" button                         │    │
│  │      ↓                                              │    │
│  │  Wait for match start                              │    │
│  │      ↓                                              │    │
│  │  Auto-teleport to ARENA                            │    │
│  │      ↓                                              │    │
│  │  FIGHT! Earn Blood Tokens per kill                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Step 5: PROGRESSION PERSISTS                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Match ends                                        │    │
│  │      ↓                                              │    │
│  │  Return to LOBBY                                   │    │
│  │      ↓                                              │    │
│  │  Weapon XP and upgrades SAVED                      │    │
│  │      ↓                                              │    │
│  │  Ready for next match with upgraded gear!          │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🖼️ UI Mockup - Lobby Interface

```
╔═══════════════════════════════════════════════════════════════════╗
║                          🎯 KILLADOME                        [X]  ║
╠═══════════════════════════════════════════════════════════════════╣
║  [PLAY]  [LOADOUTS]  [STORE]  [STATS]  [SETTINGS]               ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║                                                                   ║
║                       READY TO PLAY?                              ║
║                                                                   ║
║                    ┌─────────────────┐                            ║
║                    │   JOIN QUEUE    │                            ║
║                    └─────────────────┘                            ║
║                                                                   ║
║                   Blood Tokens: 🪙 1,234                          ║
║                   VIP Status: ⭐ Active                            ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 🎨 UI Mockup - Loadouts Tab

```
╔═══════════════════════════════════════════════════════════════════╗
║                          🎯 KILLADOME                        [X]  ║
╠═══════════════════════════════════════════════════════════════════╣
║  [PLAY]  [🔧 LOADOUTS]  [STORE]  [STATS]  [SETTINGS]            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  WEAPON LIBRARY          │  CURRENT LOADOUT                       ║
║  ┌──┬──┬──┬──┬──┐       │  ┌─────────────────────────┐          ║
║  │AK│M4│M2│LR│P │       │  │      PRIMARY            │          ║
║  └──┴──┴──┴──┴──┘       │  │  ┌──────────────┐      │          ║
║                          │  │  │   🔫 AK-47   │      │          ║
║  ATTACHMENTS             │  │  │   Level: 6   │      │          ║
║  ┌──┬──┬──┬──┬──┐       │  │  └──────────────┘      │          ║
║  │SI│MA│OP│ST│GR│       │  │                         │          ║
║  └──┴──┴──┴──┴──┘       │  │  Attachments:           │          ║
║                          │  │  ┌──┬──┬──┬──┐         │          ║
║  SKINS                   │  │  │SI│MA│OP│  │         │          ║
║  ┌──┬──┬──┬──┬──┐       │  │  └──┴──┴──┴──┘         │          ║
║  │NS│FS│AC│GR│  │       │  │                         │          ║
║  └──┴──┴──┴──┴──┘       │  │  [⚡ UPGRADE]           │          ║
║                          │  └─────────────────────────┘          ║
║                          │                                        ║
║  Drag items here ←───────┤  SECONDARY                            ║
║  or click to select      │  ┌─────────────────────────┐          ║
║                          │  │   🔫 Pistol             │          ║
║                          │  └─────────────────────────┘          ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

Legend:
  AK=AK-47  M4=M4A1  M2=M249  LR=LR-300  P=Pistol
  SI=Silencer  MA=Extended Mag  OP=Optic  ST=Stock  GR=Grip
  NS=Neon Serpent  FS=Fire Storm  AC=Arctic Camo  GR=Gold Rush
```

---

## 🛒 UI Mockup - Store Tab

```
╔═══════════════════════════════════════════════════════════════════╗
║                          🎯 KILLADOME                        [X]  ║
╠═══════════════════════════════════════════════════════════════════╣
║  [PLAY]  [LOADOUTS]  [🛒 STORE]  [STATS]  [SETTINGS]            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  💰 Your Balance: 🪙 1,234 Blood Tokens                           ║
║                                                                   ║
║  ─────────────── FEATURED ITEMS ───────────────                  ║
║                                                                   ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        ║
║  │  🎨      │  │  🎨      │  │  🎨      │  │  🎨      │        ║
║  │  Neon    │  │  Fire    │  │  Arctic  │  │  Gold    │        ║
║  │  Serpent │  │  Storm   │  │  Camo    │  │  Rush    │        ║
║  │          │  │          │  │          │  │          │        ║
║  │  🪙 500   │  │  🪙 750   │  │  🪙 600   │  │  🪙 1000  │        ║
║  │  [BUY]   │  │  [BUY]   │  │  [BUY]   │  │  [BUY]   │        ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────┘        ║
║                                                                   ║
║  ─────────────── VIP MEMBERSHIP ───────────────                  ║
║                                                                   ║
║  ┌──────────────────────────────────────────────────────┐       ║
║  │  ⭐ VIP Pass - 30 Days                                │       ║
║  │                                                       │       ║
║  │  Benefits:                                            │       ║
║  │  ✓ 2x Token Earn Rate                                │       ║
║  │  ✓ Exclusive Skins                                   │       ║
║  │  ✓ Priority Queue                                    │       ║
║  │  ✓ Special Name Tag                                  │       ║
║  │                                                       │       ║
║  │  💳 $9.99                      [PURCHASE WITH TEBEX] │       ║
║  └──────────────────────────────────────────────────────┘       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 📊 Stats & Progression

```
╔═══════════════════════════════════════════════════════════════════╗
║                          🎯 KILLADOME                        [X]  ║
╠═══════════════════════════════════════════════════════════════════╣
║  [PLAY]  [LOADOUTS]  [STORE]  [📊 STATS]  [SETTINGS]            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  PLAYER PROFILE                                                   ║
║  ───────────────                                                  ║
║  Name:         PlayerOne                                          ║
║  Status:       ⭐ VIP                                             ║
║  Tokens:       🪙 1,234                                           ║
║                                                                   ║
║  COMBAT STATS                                                     ║
║  ───────────────                                                  ║
║  Kills:        45                                                 ║
║  Deaths:       23                                                 ║
║  K/D Ratio:    1.96                                               ║
║  Matches:      12                                                 ║
║                                                                   ║
║  WEAPON PROGRESSION                                               ║
║  ───────────────                                                  ║
║  🔫 AK-47      [████████░░] Level 8/10                           ║
║  🔫 M249       [███░░░░░░░] Level 3/10                           ║
║  🔫 Pistol     [█████░░░░░] Level 5/10                           ║
║                                                                   ║
║  ACHIEVEMENTS                                                     ║
║  ───────────────                                                  ║
║  🏆 First Blood                                                   ║
║  🏆 Sharpshooter (10 headshots)                                   ║
║  🏆 Weapon Master (Max level weapon)                              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## ⚙️ Upgrade System Flow

```
┌─────────────────────────────────────────────────────────────┐
│  WEAPON UPGRADE FLOW                                        │
│                                                             │
│  1. Click weapon card                                       │
│     ↓                                                       │
│  2. Click [⚡ UPGRADE] button                               │
│     ↓                                                       │
│  ┌──────────────────────────────────────────────┐          │
│  │  FORGE STATION                                │          │
│  │  ────────────────                             │          │
│  │                                                │          │
│  │  Weapon: AK-47 (Level 6 → 7)                 │          │
│  │                                                │          │
│  │  Attachments:                                 │          │
│  │  ┌────────┬────────┬────────┬────────┐       │          │
│  │  │Silencer│Ext Mag │ Reflex │ Stock  │       │          │
│  │  │ Lv 3   │ Lv 2   │ Lv 1   │  ---   │       │          │
│  │  │[UPGRADE]│[UPGRADE]│[UPGRADE]│ [ADD] │       │          │
│  │  └────────┴────────┴────────┴────────┘       │          │
│  │                                                │          │
│  │  STAT PREVIEW                                 │          │
│  │  ──────────────────────────────               │          │
│  │  Damage:        35 → 37  (+5.7%) 📈          │          │
│  │  Fire Rate:    0.13 → 0.12  (faster) 📈      │          │
│  │  Accuracy:     0.75 → 0.78  (+4.0%) 📈       │          │
│  │                                                │          │
│  │  Cost: 🪙 700    Balance: 🪙 1,234            │          │
│  │                                                │          │
│  │          [CONFIRM UPGRADE]  [CANCEL]          │          │
│  └──────────────────────────────────────────────┘          │
│     ↓                                                       │
│  3. Confirm purchase                                        │
│     ↓                                                       │
│  4. Deduct tokens                                           │
│     ↓                                                       │
│  5. Apply stat changes                                      │
│     ↓                                                       │
│  6. Save to profile                                         │
│     ↓                                                       │
│  7. Update UI                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MULTI-LAYER SECURITY                                       │
│                                                             │
│  Client Request                                             │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 1: Rate Limiter               │                   │
│  │ Max 5 actions per second            │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 2: Input Validation           │                   │
│  │ Sanitize all user inputs            │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 3: Permission Check           │                   │
│  │ Verify player permissions           │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 4: State Validation           │                   │
│  │ Check player state is valid         │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 5: Resource Validation        │                   │
│  │ Verify token balance, etc.          │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 6: Execute Action             │                   │
│  │ Apply changes server-side           │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │ Layer 7: Atomic Save                │                   │
│  │ Write to temp file, then move       │                   │
│  └─────────────────────────────────────┘                   │
│      ↓                                                      │
│  Response to Client                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 Performance Metrics

```
┌──────────────────────────────────────────────────────────────┐
│  PERFORMANCE OPTIMIZATIONS                                   │
│                                                              │
│  ✓ No LINQ Usage                                             │
│    All iterations use foreach loops                          │
│    └─ Benefit: Zero LINQ overhead                            │
│                                                              │
│  ✓ Object Pooling                                            │
│    Reusable data structures                                  │
│    └─ Benefit: Reduced GC pressure                           │
│                                                              │
│  ✓ Throttled UI Updates                                      │
│    Max 100ms between UI refreshes                            │
│    └─ Benefit: Smooth performance, reduced bandwidth         │
│                                                              │
│  ✓ Batched Saves                                             │
│    Auto-save every 5 minutes                                 │
│    └─ Benefit: Reduced I/O operations                        │
│                                                              │
│  ✓ Atomic File Writes                                        │
│    Temp file + move strategy                                 │
│    └─ Benefit: Corruption-proof saves                        │
│                                                              │
│  ✓ Rate Limiting                                             │
│    5 actions per second per player                           │
│    └─ Benefit: Protection against spam/exploits              │
│                                                              │
│  ✓ Minimal Allocations                                       │
│    GC-friendly code on hot paths                             │
│    └─ Benefit: Stable FPS, low memory usage                  │
│                                                              │
│  EXPECTED PERFORMANCE                                        │
│  ──────────────────────────────────────────                 │
│  Server Load:      < 5% CPU for 100 players                  │
│  Memory Usage:     ~50MB for plugin + player data            │
│  File I/O:         < 1MB/min average                          │
│  Network:          < 10KB/sec per player average             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Feature Checklist

```
CORE SYSTEMS
  [✅] Lobby spawn on connect
  [✅] Match queue system
  [✅] Arena teleportation
  [✅] Auto-save system
  [✅] Configuration file
  
UI SYSTEMS
  [✅] Full-screen CUI interface
  [✅] Tab navigation (5 tabs)
  [✅] Drag-and-drop emulation
  [✅] Click-to-place fallback
  [✅] Stat preview panels
  
PROGRESSION
  [✅] Weapon leveling (0-10)
  [✅] Attachment leveling (0-5)
  [✅] Persistent saves
  [✅] XP tracking
  [✅] Upgrade costs
  
ECONOMY
  [✅] Blood Token system
  [✅] Earn on kills
  [✅] Spend on upgrades
  [✅] Store purchases
  [✅] Tebex integration
  
SECURITY
  [✅] Rate limiting
  [✅] Input validation
  [✅] Server-side authority
  [✅] Atomic saves
  [✅] Anti-exploit
  
DOCUMENTATION
  [✅] README.md
  [✅] ARCHITECTURE.md
  [✅] INSTALL.md
  [✅] CHANGELOG.md
  [✅] Example configs
  [✅] This showcase!
```

---

## 🚀 Quick Start

```bash
# 1. Install plugin
cp KillaDome.cs /rust_server/oxide/plugins/

# 2. Reload Oxide
oxide.reload KillaDome

# 3. Grant admin permission
oxide.grant user YourName killadome.admin

# 4. Join server and test
/kd open

# 5. Configure spawn points
# Edit: oxide/config/KillaDome.json

# 6. Enjoy!
```

---

## 💡 Pro Tips

```
1. Enable debug logging during setup
   → Set "Enable Debug Logging": true in config

2. Start with default spawn positions
   → Test teleportation before customizing

3. Adjust token economy for your server
   → More tokens = faster progression

4. Back up player data regularly
   → tar -czf backup.tar.gz oxide/data/KillaDome/

5. Monitor auto-save logs
   → Check oxide/logs/oxide_debug.log

6. Use VIP for premium players
   → oxide.grant user PlayerName killadome.vip

7. Test Tebex in sandbox mode first
   → Verify purchases before going live

8. Adjust UI throttle for server specs
   → Lower = smoother, Higher = better performance
```

---

## 📞 Support Resources

```
📄 Full Documentation:     plugins/README.md
🏗️ Technical Details:      plugins/ARCHITECTURE.md
🔧 Setup Instructions:     plugins/INSTALL.md
📝 Version History:        plugins/CHANGELOG.md
⚙️ Configuration:          plugins/KillaDome.json.example
👤 Player Data:            plugins/PlayerProfile.example.json
```

---

**🎮 KillaDome - Transforming Rust Servers Into COD-Style Arenas**

*Version 1.0.0 | Production Ready | 3,497 Lines of Code*

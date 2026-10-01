# Home Network

Status: Verified against live configuration and configuration backups, September–October 2026.

This document describes the Miszuk home network as currently deployed. It is intended to provide enough information for a technically competent family member to understand the network, identify major dependencies, perform basic troubleshooting, and recover the network without relying on prior knowledge.

Secrets such as passwords, wireless keys, device credentials, private keys, and recovery codes are not stored here. Refer to Bitwarden and the physical break-glass instructions for credential recovery.

## 1. Network Overview

The home network is centered in the utility room.

The primary path is:

```text
Internet
   |
   | Western Iowa Wireless
   |
WISP radio
west side of garage, under eaves
   |
   | Ethernet / PoE
   |
WISP power/PoE equipment
utility room
   |
EdgeRouter-X
   |
   | eth1 - 802.1Q trunk, VLANs 71-75
   |
Cisco Catalyst 3850
   |
   +-- Management network
   +-- Servers
   +-- Trusted devices
   +-- Guest devices
   +-- Cameras
   |
   +-- Cisco 2504 Wireless LAN Controller
   |      |
   |      +-- Wireless access points
   |
   +-- Proxmox
   |      +-- Home Assistant
   |      +-- Infrastructure VM
   |
   +-- Blue Iris server
   |
   +-- Cameras and other wired devices
```

The WISP radio connects directly to the EdgeRouter-X. There is no separate ISP modem/router between the outdoor radio and the EdgeRouter.

## 2. Physical Location

The primary network equipment is in the utility room.

Wall-mounted equipment includes:

- structured-cabling patch panels
- Cisco Catalyst 3850 switch
- Cisco 2504 Wireless LAN Controller
- EdgeRouter-X
- network power equipment
- Tripp Lite 1800 W power distribution/surge-protection unit

The structured Ethernet cabling throughout the house terminates at the patch panels adjacent to the Catalyst 3850.

The Blue Iris server is a Dell OptiPlex 5070 standing vertically on the utility-room floor.

The Proxmox mini PC and the UGREEN enclosure containing the 4 TB WD Red disk are located on the white equipment box to the right of the main network equipment.

A Cisco C1111 router may also be present in this area. It is work equipment and is not part of the home network documented here.

## 3. Internet Connection

Primary documented Internet connection:

- Provider: Western Iowa Wireless
- Connection type: fixed wireless
- Outdoor radio location: west side of garage beneath the eaves
- Radio power/PoE originates in the utility room
- EdgeRouter WAN interface: `eth0`
- EdgeRouter WAN addressing: DHCP

Physical path:

```text
WISP radio
    |
Ethernet
    |
WISP PoE/power equipment
    |
EdgeRouter-X eth0
```

The EdgeRouter receives its WAN address dynamically from the ISP.

This document describes the established WISP configuration. Any newer or alternate Internet connection should be documented after its production configuration is finalized.

## 4. Router / Firewall

Device:

- Ubiquiti EdgeRouter-X
- Hostname: `EdgeRouter-X`
- Role: Internet router, firewall, inter-VLAN router, DHCP server, and NAT gateway

### LAN connection

`eth1` connects to the Cisco Catalyst 3850.

It carries VLANs 71 through 75.

### Routed networks

| VLAN | Purpose | Gateway |
|---|---|---|
| 71 | Management | `10.112.71.1/24` |
| 72 | Servers | `10.112.72.1/24` |
| 73 | Trusted | `10.112.73.1/24` |
| 74 | Guest | `10.112.74.1/24` |
| 75 | Cameras | `10.112.75.1/24` |

VLAN 76 (`Household`) exists in the Catalyst configuration, but no corresponding routed EdgeRouter interface was found during the 2026 documentation review. It should not be assumed to be an active routed network.

## 5. DHCP

The EdgeRouter provides DHCP for the routed VLANs.

| VLAN | DHCP range | DNS |
|---|---|---|
| 71 Management | `10.112.71.100-150` | OpenDNS |
| 72 Servers | `10.112.72.50-254` | OpenDNS |
| 73 Trusted | `10.112.73.50-254` | OpenDNS |
| 74 Guest | `10.112.74.2-254` | Google DNS |
| 75 Cameras | `10.112.75.100-150` | OpenDNS |

An EdgeRouter static DHCP mapping exists for the physical Proxmox host:

- Name: `homeserver`
- Address: `10.112.72.11`
- MAC: `6c:02:e0:81:6e:ac`

Important infrastructure devices use predictable addresses even where the underlying mechanism differs.

## 6. Important Network Addresses

| Device / Service | Address | Network |
|---|---|---|
| EdgeRouter management gateway | `10.112.71.1` | Management |
| Cisco Catalyst 3850 | `10.112.71.2` | Management |
| Cisco 2504 WLC | `10.112.71.3` | Management |
| Blue Iris | `10.112.72.10` | Servers |
| Proxmox | `10.112.72.11` | Servers |
| Home Assistant | `10.112.72.12` | Servers |
| Infrastructure VM | `10.112.72.13` | Servers |

Blue Iris also has a Tailscale address. Tailscale provides an additional remote-access path and is documented with the Blue Iris system rather than as part of the LAN addressing plan.

## 7. Cisco Catalyst 3850

Device:

- Hostname: `Basement-3850`
- Model: Cisco WS-C3850-48P
- Management address: `10.112.71.2/24`
- Default gateway: `10.112.71.1`
- Domain: `miszuk.com`
- SSH version 2
- NTP: `10.112.71.1`

SSH management access is permitted from the Management, Servers, and Trusted networks.

### VLANs

The switch contains:

- VLAN 71 - Management
- VLAN 72 - Servers
- VLAN 73 - Trusted
- VLAN 74 - Guest
- VLAN 75 - Cameras
- VLAN 76 - Household

VLAN 76 is present on the switch but was not found as a routed network on the EdgeRouter during verification.

### Important switch ports

| Port | Description / Purpose | Configuration |
|---|---|---|
| Gi1/0/1 | Firewall / EdgeRouter-X | trunk, VLANs 71-75 |
| Gi1/0/2 | Blue Iris | access VLAN 72 |
| Gi1/0/3 | Cisco 2504 WLC | trunk, VLANs 71,73,74 |
| Gi1/0/4 | Office & Printer | trunk, VLANs 72,73 |
| Gi1/0/5 | HomeServer / Proxmox | access VLAN 72 |
| Gi1/0/6-12 | Data | access VLAN 72 |
| Gi1/0/13-23 | Cameras | access VLAN 75 |
| Gi1/0/37-48 | Wireless AP connections | trunks, VLANs 71,73,74 |

The firewall trunk uses native VLAN 70 and allows VLANs 71-75.

The WLC and AP trunks use VLAN 71 as their native/management VLAN and carry Trusted and Guest wireless VLANs.

At the time of the configuration review, connected AP-facing switch ports included Gi1/0/37, 38, 39, 40, and 42.

## 8. Wireless Network

Wireless is provided by:

- Cisco 2504 Wireless LAN Controller
- five Cisco wireless access points at the time of the September 2026 controller backup

Controller:

- Model: AIR-CT2504-K9
- Software: 8.5.182.11
- Management address: `10.112.71.3/24`
- Gateway: `10.112.71.1`

### Wireless networks

| SSID | VLAN | Purpose |
|---|---|---|
| `miszuk-secure` | 73 | Trusted household wireless |
| `miszuk-guest` | 74 | Guest wireless |

The controller uses separate dynamic interfaces for the secure and guest wireless networks:

- Secure interface: `10.112.73.3/24`
- Guest interface: `10.112.74.3/24`

Wireless passwords are not documented here. Retrieve them from Bitwarden.

## 9. Firewall and Network Segmentation

The EdgeRouter provides segmentation between the major networks.

### Cameras

The Camera VLAN is restricted by default. Rules permit required communication such as access to Blue Iris and network time while limiting general access to other networks.

Camera addresses used by the Blue Iris system are in the `10.112.75.x` network. The documented cameras occupy addresses in the `10.112.75.20-26` range.

### Guest

The Guest network is restricted from normal access to internal networks.

Specific exceptions exist for required services such as selected Blue Iris/printer/DNS access. Guest clients are otherwise intended primarily for Internet access.

### Servers

Server-network policies permit required communication with cameras and include special handling for Blue Iris.

### Router management

Management access to the router is restricted. Trusted-network access includes required administrative protocols.

The device configuration backup is the authoritative source for detailed firewall rule order and behavior. This handbook intentionally summarizes policy rather than reproducing every rule.

## 10. Internet NAT / Inbound Access

Normal outbound Internet traffic is source-NATed through `eth0`.

A documented inbound NAT rule forwards:

```text
WAN TCP 57391
    ->
10.112.72.10 TCP 57391
    ->
Blue Iris
```

This is an intentional Internet exposure and depends on corresponding firewall policy.

Blue Iris also uses Tailscale, providing another remote-access mechanism that does not depend on this port-forwarding path.

## 11. Configuration Backups

Detailed device configuration backups exist for:

- EdgeRouter-X
- Cisco Catalyst 3850
- Cisco 2504 WLC

These raw configuration files may contain password hashes, authentication material, wireless security material, or other sensitive information.

They must **not** be committed to this GitHub repository.

The handbook provides the human-readable network design and recovery context. Protected configuration backups provide the detailed device configuration needed for restoration.

The protected storage location for these configuration backups should be recorded once the long-term secure backup location has been established.

## 12. Power

There is currently **no functioning battery backup** for the home network infrastructure.

A Tripp Lite 1800 W power distribution/surge-protection unit is present in the utility room. It is a PDU/surge device, not a UPS. The exact set of devices presently powered through it has not been verified.

An APC Smart-UPS 3000-class unit is present but is not operational because its batteries require replacement.

Therefore, a utility-power outage should currently be expected to shut down the network and associated servers.

The UGREEN enclosure containing the WD Red disk has an additional recovery consideration: after a power interruption, the enclosure can remain powered off even after utility power returns. Because Proxmox passes that disk through to the Infrastructure VM, VM 101 may fail to start until the enclosure is manually powered on.

## 13. Basic Outage Troubleshooting

When the entire network or Internet connection is unavailable, troubleshoot approximately from the physical layer inward:

1. Verify utility power is available in the utility room.
2. Verify the WISP outdoor radio's PoE/power equipment is powered.
3. Verify the EdgeRouter-X is powered and its WAN and LAN links are active.
4. Verify the Catalyst 3850 is powered and the EdgeRouter trunk is up.
5. Determine whether the failure affects:
   - Internet only,
   - wired and wireless LAN,
   - wireless only,
   - one VLAN,
   - or one server/service.
6. For wireless-only problems, check the Cisco 2504 WLC and AP connectivity.
7. For server problems, verify Proxmox before troubleshooting its VMs.
8. For the Infrastructure VM after a power outage, verify the UGREEN/WD Red enclosure is powered before attempting repeated VM starts.

Avoid factory-resetting network devices during initial troubleshooting. Existing configuration and protected backups should be preserved until the failure is understood.

## 14. Recovery Order After a Major Power Event

A practical dependency order is:

```text
Utility power
    |
WISP radio / PoE
    |
EdgeRouter-X
    |
Cisco Catalyst 3850
    |
    +-- Cisco 2504 / APs
    |
    +-- Blue Iris
    |
    +-- UGREEN / WD Red
            |
         Proxmox
            |
         VM 100 / VM 101
```

The exact server startup process is documented in the Proxmox and Infrastructure VM sections of the handbook.

The WD Red enclosure must be available before Infrastructure VM 101 can start successfully.

## 15. Authoritative Sources

Use these sources in descending order depending on the problem:

1. This handbook for topology, purpose, dependencies, and recovery context.
2. Current running device configuration for actual operational state.
3. Protected configuration backups for detailed restoration.
4. Bitwarden for credentials and other secret material.
5. Physical break-glass documentation for emergency Bitwarden access.

Do not assume an old configuration backup exactly represents the currently running configuration without verification.

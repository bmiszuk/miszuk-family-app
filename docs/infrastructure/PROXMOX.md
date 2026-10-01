# Proxmox and Virtual Machines

Status: Verified against the running Proxmox host and guest configuration, September–October 2026.

This document describes the home Proxmox host, its two virtual machines, their storage relationships, and the dependencies that matter for operation and recovery. It intentionally does not reproduce credentials or every default setting.

## 1. Role and Location

Proxmox provides virtualization for two home infrastructure systems:

- VM 100 — Home Assistant OS
- VM 101 — Ubuntu Infrastructure VM

The physical host is an HP ProDesk 600 G6 Mini located in the utility room on the white equipment box to the right of the main network equipment. The UGREEN enclosure containing the 4 TB WD Red disk is located with it.

Network path:

```text
Cisco Catalyst 3850
    |
Gi1/0/5 - access VLAN 72
    |
Proxmox host 10.112.72.11
    |
    +-- VM 100 - Home Assistant - 10.112.72.12
    |
    +-- VM 101 - Infrastructure - 10.112.72.13
```

## 2. Proxmox Host

| Item | Verified value |
|---|---|
| Hostname | `proxmox` |
| Address | `10.112.72.11/24` |
| Gateway | `10.112.72.1` |
| DNS | `208.67.222.222` |
| Search domain | `miszuk.com` |
| Proxmox VE | 9.2.4 |
| Kernel | `7.0.14-5-pve` |
| CPU | Intel Core i5-10500T |
| CPU topology | 6 cores / 12 threads |
| Memory | approximately 23 GiB usable |
| System storage | Samsung MZVLB256HAHQ-000H1, 256-GB-class NVMe |

The Proxmox web interface is available on the normal Proxmox HTTPS management port at:

`https://10.112.72.11:8006/`

Credentials are not stored in this repository.

## 3. Host Networking

The active Linux bridge is `vmbr0`.

- `vmbr0` carries the Proxmox host and VM traffic.
- It bridges physical interface `nic0`.
- `nic1` exists but was not in use during verification.
- The host is directly connected to `10.112.72.0/24`.
- Default route is through `10.112.72.1`.

The Catalyst switch port serving the host is Gi1/0/5, configured as an access port in VLAN 72 (Servers).

No VLAN trunking into the Proxmox host is required for the currently documented VMs.

## 4. VM Inventory

| VM ID | Name | Purpose | Address |
|---|---|---|---|
| 100 | `haos-18.1` | Home Assistant OS | `10.112.72.12` |
| 101 | `Infrastructure` | Ubuntu / Docker infrastructure services | `10.112.72.13` |

Both VMs are intended to start automatically with the host.

## 5. VM 100 — Home Assistant

Verified Proxmox configuration:

- VM ID: 100
- Name: `haos-18.1`
- Home Assistant OS
- UEFI / OVMF
- machine type: q35
- 2 virtual CPU cores
- 4096 MB RAM
- 32 GB virtual disk on `local-lvm`
- SCSI disk with discard enabled and SSD flag
- VirtIO network adapter
- MAC: `02:34:DD:A2:CC:96`
- bridge: `vmbr0`
- QEMU guest agent enabled
- serial socket configured
- `onboot: 1`

The VM was originally created using the Proxmox VE Community Scripts project.

### Hardware dependencies

No USB passthrough is configured.

No PCI passthrough is configured.

Therefore, the VM does not currently depend on a directly attached Zigbee, Z-Wave, Bluetooth, or other USB/PCI coordinator that would need to be recreated during a host rebuild.

Home Assistant application configuration, integrations, and backup behavior are documented separately.

## 6. VM 101 — Infrastructure

Verified Proxmox configuration:

- VM ID: 101
- Name: `Infrastructure`
- Ubuntu 26.04 LTS
- 2 virtual CPU cores
- 4096 MB RAM
- 50 GB virtual system disk
- `onboot: 1`
- address: `10.112.72.13`
- hostname inside guest: `infra`

The VM provides Docker-based home infrastructure services, currently including:

- Syncthing
- Uptime Kuma

Those services and their persistent data are documented in the Infrastructure VM/service section of the handbook.

## 7. Proxmox Storage

The Proxmox system and VM virtual disks use the internal NVMe storage.

Configured Proxmox storage observed during verification consisted of:

- `local` — `/var/lib/vz`
- `local-lvm`

The 4 TB WD Red is **not** mounted by Proxmox as a filesystem and is not configured as Proxmox backup storage.

Instead, the entire physical disk is passed through to VM 101.

Conceptually:

```text
Proxmox host
|
+-- internal NVMe
|   +-- Proxmox OS
|   +-- VM 100 virtual disk
|   +-- VM 101 system virtual disk
|
+-- physical WD Red in UGREEN USB enclosure
    |
    +-- whole-disk passthrough to VM 101
        |
        +-- Ubuntu sees disk as /dev/sdb
        +-- /dev/sdb1 mounted at /mnt/backup
```

The guest mounts the WD Red filesystem by UUID, so normal Linux device-name changes such as `/dev/sdb` becoming another `/dev/sdX` name should not by themselves break the filesystem mount.

Do not mount or modify this filesystem from the Proxmox host while VM 101 is using it.

## 8. Critical WD Red / UGREEN Dependency

The UGREEN USB enclosure has an important power behavior: after some power interruptions, the enclosure remains powered off even after utility power returns.

Proxmox passes the physical disk to VM 101 as:

`scsi1: /dev/sda`

If that physical device is absent when Proxmox attempts to start VM 101, the VM can fail to start.

Therefore, after a power outage:

1. Verify the UGREEN enclosure is powered on.
2. Verify Proxmox can see the WD Red.
3. Only then start or retry VM 101.

Repeatedly retrying VM 101 without first checking the enclosure does not address the underlying dependency.

VM 100 does not have this WD Red passthrough dependency.

## 9. Backup Status

At the time of the documentation review:

- Proxmox `/etc/pve/jobs.cfg` contained no scheduled backup jobs.
- No existing `vzdump`/VMA VM backup files were found.
- The WD Red was not configured as Proxmox backup storage.
- Therefore, no scheduled or existing Proxmox VM backups were identified.

Home Assistant does create encrypted application-level backups, but those backups are stored inside VM 100. They do not substitute for an independent backup of the VM or Proxmox host because they share the same underlying failure domain.

This section documents the current state; the absence of independent VM backups is tracked separately as an environment improvement item.

## 10. Power and Startup

There is currently no functioning UPS protecting the Proxmox host.

An APC Smart-UPS 3000-class unit is physically present but is out of service pending battery replacement.

Following a major power interruption, use this dependency order:

```text
Utility power
    |
Network infrastructure
    |
UGREEN enclosure / WD Red
    |
Proxmox host
    |
    +-- VM 100 - Home Assistant
    |
    +-- VM 101 - Infrastructure
```

The UGREEN/WD Red step is particularly important for VM 101.

If the network is available but the Infrastructure VM is not, check the UGREEN enclosure before assuming Ubuntu or Proxmox itself has failed.

## 11. Basic Health Checks

A basic Proxmox health check should establish:

1. The host responds at `10.112.72.11`.
2. The Proxmox web interface loads.
3. Internal NVMe storage is available.
4. VM 100 and VM 101 are running.
5. Home Assistant responds at `10.112.72.12:8123`.
6. Infrastructure services respond from `10.112.72.13`.
7. The WD Red is visible to VM 101 and mounted at `/mnt/backup`.

Uptime Kuma normally monitors Proxmox, Home Assistant, the Infrastructure VM, and Syncthing. It is useful for detecting failures but should not be considered authoritative when VM 101 itself is unavailable because Uptime Kuma runs on VM 101.

## 12. Failure Isolation

### Proxmox host unreachable

Check, in order:

- utility power
- physical host power
- Catalyst Gi1/0/5 link
- VLAN 72 connectivity
- host console if network management is unavailable

Do not immediately reinstall Proxmox or initialize storage.

### Home Assistant unavailable but Proxmox works

Check whether VM 100 is running. If it is not, inspect the VM's startup/error state before changing its configuration.

Because VM 100 has no USB or PCI passthrough, troubleshooting does not require locating an external coordinator attached to the Proxmox host.

### Infrastructure VM unavailable but Proxmox works

First check whether the UGREEN enclosure is powered and whether the physical WD Red is visible to Proxmox.

If the disk is absent, restore that hardware dependency before repeatedly attempting to start VM 101.

If VM 101 is running but Docker services are unavailable, continue troubleshooting inside the guest rather than changing Proxmox.

## 13. Host Rebuild / Disaster Recovery Notes

A complete tested Proxmox rebuild procedure has not yet been established.

The important known relationships to preserve during a rebuild are:

- Proxmox host address: `10.112.72.11/24`
- gateway: `10.112.72.1`
- bridge: `vmbr0` on the active physical NIC
- VM 100 identity and network configuration
- VM 101 identity and network configuration
- whole-disk passthrough of the physical WD Red to VM 101
- do not initialize, format, or repurpose the WD Red during host recovery

Because no independent Proxmox VM backups were found, a failed internal NVMe could require rebuilding the host and guests rather than simply restoring a Proxmox backup. Do not assume the WD Red contains VM backups.

Before destructive recovery work, preserve any readable data and confirm the available backup sources.

## 14. Credentials and Authoritative Configuration

Administrative passwords and other credentials belong in Bitwarden, not this repository.

For recovery and troubleshooting, use:

1. this handbook for architecture, dependencies, and operational context;
2. the current Proxmox configuration for actual running state;
3. protected configuration/backup artifacts where available;
4. Bitwarden for credentials;
5. the physical break-glass envelope for emergency Bitwarden access.

Do not place exported credentials, private keys, password hashes, or other secret-bearing configuration into normal GitHub documentation.
